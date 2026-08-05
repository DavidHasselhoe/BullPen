import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit, requireAuth } from '@/lib/security/api-security';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { SP500_SECTORS } from '@/lib/market-data/sp500-sectors';
import { logger } from '@/lib/utils/logger';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { seedPrices, type SeededQuote } from '@/lib/market-data/seed-prices';
import { isExtendedHoursET } from '@/lib/twelvedata/twelvedata-client';
import { isDuplicateShareClass } from '@/lib/market-data/dual-class-shares';
import { fetchAndUpsertScreenerStats } from '@/lib/market-data/screener-stats';
import { inferAssetType } from '@/lib/assets/asset-type';
import type { Session } from '@/app/api/market/heatmap/stream/route';

export const dynamic = 'force-dynamic';

export interface HeatmapStock {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number;
  change: number;
  price: number;
  previousClose?: number;
  isExtended?: boolean;
}

export interface HeatmapSector {
  name: string;
  totalMarketCap: number;
  avgChange: number;
  stocks: HeatmapStock[];
}

export interface HeatmapResponse {
  success: boolean;
  sectors?: HeatmapSector[];
  session?: Session;
  lastUpdated?: string;
  error?: string;
}

const HEATMAP_CACHE_KEY = 'heatmap:v2';
const HEATMAP_CACHE_TTL_SECONDS = 3 * 60;
const MY_STOCKS_CACHE_TTL_SECONDS = 3 * 60;
/** Post-dedupe, post-crypto/forex-filter cap on how many of a user's tracked
 *  symbols get a tile — bounds the on-demand screener-stats fetch below to a
 *  small, predictable fan-out rather than an unbounded one for a very large
 *  watchlist. Holdings first, then watchlist, both alphabetical. */
const MY_STOCKS_SYMBOL_CAP = 60;

// Shown to the user for any data-fetch failure — never leaks provider names,
// HTTP status codes, or other internals a visitor can't act on.
const GENERIC_LOAD_ERROR = 'Live prices are temporarily unavailable. Please try again in a moment.';

function getCurrentSession(): Session {
  const etStr = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  const [h, m] = etStr.split(':').map(Number);
  const etMins = h * 60 + m;
  const day = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  ).getDay();

  if (day === 0 || day === 6) return 'closed';
  if (etMins >= 240 && etMins < 570) return 'pre';
  if (etMins >= 570 && etMins < 960) return 'regular';
  if (etMins >= 960 && etMins < 1200) return 'post';
  return 'closed';
}

const SECTOR_ORDER = [
  'Information Technology',
  'Health Care',
  'Financials',
  'Consumer Discretionary',
  'Industrials',
  'Communication Services',
  'Consumer Staples',
  'Energy',
  'Real Estate',
  'Materials',
  'Utilities',
];

/** Groups a flat list of already-priced stocks into sectors, sorted by the
 *  app's canonical sector order. Shared by both sp500 and my-stocks modes —
 *  everything downstream of "I have a list of HeatmapStock" is identical
 *  regardless of where that list came from. */
function buildSectors(stocks: HeatmapStock[]): HeatmapSector[] {
  const sectorMap = new Map<string, HeatmapStock[]>();
  for (const stock of stocks) {
    const existing = sectorMap.get(stock.sector) ?? [];
    existing.push(stock);
    sectorMap.set(stock.sector, existing);
  }

  return Array.from(sectorMap.entries())
    .map(([name, group]) => {
      const sorted = [...group].sort((a, b) => b.marketCap - a.marketCap);
      const totalMarketCap = sorted.reduce((sum, s) => sum + s.marketCap, 0);
      const avgChange = sorted.reduce((sum, s) => sum + s.change, 0) / (sorted.length || 1);
      return { name, totalMarketCap, avgChange, stocks: sorted };
    })
    .sort((a, b) => {
      const ai = SECTOR_ORDER.indexOf(a.name);
      const bi = SECTOR_ORDER.indexOf(b.name);
      if (ai === -1 && bi === -1) return b.totalMarketCap - a.totalMarketCap;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
}

/**
 * Resolves the S&P 500 constituent list into fully-priced HeatmapStock rows.
 * Behavior is unchanged from before this file's mode split — same sector
 * sourcing (static map → companies table → 'Other'), same market-cap
 * fallback (real screener_stats value, or a rank-based synthetic estimate),
 * same dual-class dedup.
 */
async function resolveSp500Stocks(): Promise<HeatmapStock[]> {
  const supabase = createServerClient();

  // Fetch market caps from screener_stats for as many tickers as possible.
  // Also fetch name+sector from companies table as a fallback for tickers
  // not in SP500_SECTORS (covers recent additions / reclassifications).
  const [{ data: statsData }, { data: companiesData }] = await Promise.all([
    supabase
      .from('screener_stats')
      .select('ticker, market_cap')
      .in('ticker', SP500_TICKERS),
    supabase
      .from('companies')
      .select('ticker, name, sector')
      .in('ticker', SP500_TICKERS),
  ]);

  const marketCapMap = new Map<string, number>();
  for (const s of statsData ?? []) {
    if (s.market_cap && (s.market_cap as number) > 0) {
      marketCapMap.set(s.ticker, s.market_cap as number);
    }
  }

  const dbNameMap = new Map<string, string>();
  const dbSectorMap = new Map<string, string>();
  for (const c of companiesData ?? []) {
    if (c.name) dbNameMap.set(c.ticker, c.name);
    if (c.sector) dbSectorMap.set(c.ticker, c.sector);
  }

  // Rank-based fallback market cap when screener_stats has no entry
  const BASE_CAP = 3_000_000_000_000;
  const universeRank = new Map(SP500_TICKERS.map((t, i) => [t, i]));

  // Session-level extended-hours flag — every S&P 500 name has extended
  // quotes available on TwelveData in practice, so this is an acceptable
  // simplification of the old per-stock `extended_price != null` check.
  const isExtended = isExtendedHoursET();

  // Route through the shared, Redis-backed, chunk-isolated seeding pipeline
  // (same one the live heatmap stream uses) instead of hand-rolled raw
  // fetches: this shares warm cache with the live stream, batches requests
  // in TwelveData-safe chunks of 100 instead of 26 concurrent unbatched
  // calls, and — critically — isolates each chunk's failures so one
  // rate-limited chunk only drops its own symbols instead of aborting the
  // whole page.
  const quoteMap = new Map<string, SeededQuote>();
  await seedPrices(SP500_TICKERS, (ticker, quote) => {
    quoteMap.set(ticker, quote);
  });

  const stocks: HeatmapStock[] = [];

  for (const ticker of SP500_TICKERS) {
    // One tile per company: GOOG/FOX/NWS are the non-canonical half of a
    // dual-class pair (GOOGL/FOXA/NWSA is kept) — same rule movers and the
    // screener already apply, see lib/market-data/dual-class-shares.ts.
    if (isDuplicateShareClass(ticker)) continue;

    const quote = quoteMap.get(ticker);
    if (!quote || !isFinite(quote.price) || quote.price <= 0) continue;

    const price = quote.price;
    const change = quote.changePercent ?? 0;
    const previousClose = quote.previousClose;

    // Sector: static map → DB → 'Other'
    const sectorName =
      SP500_SECTORS[ticker] ??
      dbSectorMap.get(ticker)?.trim() ??
      'Other';

    // Name: DB → ticker (TwelveData quotes don't carry a company name)
    const name = dbNameMap.get(ticker) ?? ticker;

    const realCap = marketCapMap.get(ticker);
    const rank = universeRank.get(ticker) ?? SP500_TICKERS.length;
    const marketCap = realCap ?? Math.round(BASE_CAP * Math.pow(0.96, rank));

    stocks.push({
      ticker,
      name,
      sector: sectorName,
      marketCap,
      change,
      price,
      previousClose: isFinite(previousClose) ? previousClose : undefined,
      isExtended,
    });
  }

  return stocks;
}

/**
 * Resolves a user's holdings + watchlist into fully-priced HeatmapStock rows,
 * sourced from the broader active-universe screener data (screener_stats,
 * ~1,200 tickers and growing) rather than the S&P-500-only static sector map
 * — a user's tracked stocks are frequently outside the index. Crypto/forex
 * symbols are excluded (a sector heatmap is an equity concept); dual-class
 * shares are NOT deduped here, unlike sp500 mode — a user may specifically
 * hold/watch the non-canonical class, matching the exemption
 * app/api/screener/route.ts already grants symbol-scoped views. No synthetic
 * market-cap fallback: a ticker with no real market_cap data anywhere just
 * doesn't get a tile.
 */
async function resolveMyStocks(userId: string): Promise<HeatmapStock[]> {
  const supabase = createServerClient();

  const [{ data: holdingsRows }, { data: watchlistRows }] = await Promise.all([
    supabase.from('user_holdings').select('symbol, quantity').eq('user_id', userId),
    supabase.from('user_watchlist').select('symbol').eq('user_id', userId),
  ]);

  // A fully sold position keeps its row at quantity = 0 rather than being
  // deleted (see docs/superpowers/specs/2026-07-23-holding-sales-design.md —
  // enables sale history / average-cost accounting). Null quantity is a
  // separate, legitimate case (tracking without portfolio values, per
  // user_holdings.quantity's column comment) and must stay included — same
  // "quantity == null || quantity > 0" distinction app/holdings/page.tsx uses.
  const heldSymbols = (holdingsRows ?? [])
    .filter((r) => r.quantity == null || (r.quantity as number) > 1e-9)
    .map((r) => r.symbol as string);

  const uniqueSymbols = [
    ...new Set(
      [...heldSymbols, ...(watchlistRows ?? []).map((r) => r.symbol as string)]
        .map((sym) => sym.toUpperCase())
        .filter((sym) => {
          const type = inferAssetType(sym);
          return type !== 'crypto' && type !== 'forex';
        })
    ),
  ]
    .sort()
    .slice(0, MY_STOCKS_SYMBOL_CAP);

  if (uniqueSymbols.length === 0) return [];

  const { data: cachedStats } = await supabase
    .from('screener_stats')
    .select('ticker, name, sector, market_cap')
    .in('ticker', uniqueSymbols);

  const statsMap = new Map<string, { name: string; sector: string | null; market_cap: number | null }>();
  for (const row of cachedStats ?? []) {
    statsMap.set(row.ticker as string, row as { name: string; sector: string | null; market_cap: number | null });
  }

  const missing = uniqueSymbols.filter((sym) => !statsMap.has(sym));
  if (missing.length > 0) {
    try {
      const freshRows = await fetchAndUpsertScreenerStats(missing);
      for (const row of freshRows) {
        statsMap.set(row.ticker, { name: row.name, sector: row.sector, market_cap: row.market_cap });
      }
    } catch (err) {
      // A cold-fetch failure for some symbols shouldn't blank the whole
      // view — those tickers just won't get a tile (same "no data → skip"
      // behavior as a missing quote below), the rest still renders.
      logger.error('Heatmap my-stocks: on-demand screener fetch failed', err);
    }
  }

  const isExtended = isExtendedHoursET();
  const quoteMap = new Map<string, SeededQuote>();
  await seedPrices(uniqueSymbols, (ticker, quote) => {
    quoteMap.set(ticker, quote);
  });

  const stocks: HeatmapStock[] = [];

  for (const ticker of uniqueSymbols) {
    const quote = quoteMap.get(ticker);
    if (!quote || !isFinite(quote.price) || quote.price <= 0) continue;

    const stats = statsMap.get(ticker);
    const marketCap = stats?.market_cap;
    if (!marketCap || marketCap <= 0) continue;

    stocks.push({
      ticker,
      name: stats?.name ?? ticker,
      sector: stats?.sector?.trim() || 'Other',
      marketCap,
      change: quote.changePercent ?? 0,
      price: quote.price,
      previousClose: isFinite(quote.previousClose) ? quote.previousClose : undefined,
      isExtended,
    });
  }

  return stocks;
}

async function handleSp500(): Promise<NextResponse> {
  const cachedHeatmap = await getCached<HeatmapResponse>(HEATMAP_CACHE_KEY);
  if (cachedHeatmap) {
    return NextResponse.json(cachedHeatmap);
  }

  const session = getCurrentSession();

  try {
    const stocks = await resolveSp500Stocks();

    if (stocks.length === 0) {
      // Every symbol failed to resolve — Redis cold and TwelveData
      // unavailable at the same time. Rare, but a live-price hiccup shouldn't
      // blank the page: fall back to the last cached snapshot (however stale)
      // so the user sees yesterday's close instead of an error card. The
      // `lastUpdated` timestamp already shown in the header makes the age
      // honest rather than presenting stale data as live.
      const stale = await getCachedStale<HeatmapResponse>(HEATMAP_CACHE_KEY);
      if (stale?.success) {
        logger.error('Heatmap API: zero symbols resolved from seedPrices, served stale cache');
        return NextResponse.json(stale);
      }
      logger.error('Heatmap API: zero symbols resolved from seedPrices, no stale cache available');
      return NextResponse.json({ success: false, error: GENERIC_LOAD_ERROR });
    }

    const response: HeatmapResponse = {
      success: true,
      sectors: buildSectors(stocks),
      session,
      lastUpdated: new Date().toISOString(),
    };

    void setCached(HEATMAP_CACHE_KEY, 'MARKET', 'heatmap', response, HEATMAP_CACHE_TTL_SECONDS);

    return NextResponse.json(response);
  } catch (err) {
    // Log the real cause server-side; the client only ever sees a generic,
    // provider-agnostic message — no status codes, no vendor names.
    logger.error('Heatmap API error', err);
    const stale = await getCachedStale<HeatmapResponse>(HEATMAP_CACHE_KEY);
    if (stale?.success) {
      logger.error('Heatmap API error, served stale cache');
      return NextResponse.json(stale);
    }
    return NextResponse.json({ success: false, error: GENERIC_LOAD_ERROR });
  }
}

async function handleMyStocks(userId: string): Promise<NextResponse> {
  const cacheKey = `heatmap:my-stocks:v1:${userId}`;
  const cachedHeatmap = await getCached<HeatmapResponse>(cacheKey);
  if (cachedHeatmap) {
    return NextResponse.json(cachedHeatmap);
  }

  const session = getCurrentSession();

  try {
    const stocks = await resolveMyStocks(userId);

    // An empty result here is a legitimate state (no tracked symbols, or
    // none cleared the crypto/forex filter) — not an error. The client
    // renders a dedicated "add a stock" empty state for sectors: [].
    const response: HeatmapResponse = {
      success: true,
      sectors: buildSectors(stocks),
      session,
      lastUpdated: new Date().toISOString(),
    };

    void setCached(cacheKey, 'MY_STOCKS', 'heatmap', response, MY_STOCKS_CACHE_TTL_SECONDS);

    return NextResponse.json(response);
  } catch (err) {
    logger.error('Heatmap My Stocks API error', err);
    const stale = await getCachedStale<HeatmapResponse>(cacheKey);
    if (stale?.success) {
      return NextResponse.json(stale);
    }
    return NextResponse.json({ success: false, error: GENERIC_LOAD_ERROR });
  }
}

async function heatmapHandler(request: NextRequest): Promise<NextResponse> {
  const mode = request.nextUrl.searchParams.get('mode') === 'my-stocks' ? 'my-stocks' : 'sp500';

  if (mode === 'my-stocks') {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;
    return handleMyStocks(authResult.userId);
  }

  return handleSp500();
}

export const GET = withRateLimit(heatmapHandler, { windowMs: 60_000, maxRequests: 5 });
