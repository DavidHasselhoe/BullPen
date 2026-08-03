import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit } from '@/lib/security/api-security';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { SP500_SECTORS } from '@/lib/market-data/sp500-sectors';
import { logger } from '@/lib/utils/logger';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { seedPrices, type SeededQuote } from '@/lib/market-data/seed-prices';
import { isExtendedHoursET } from '@/lib/twelvedata/twelvedata-client';
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

 
async function heatmapHandler(_req: NextRequest): Promise<NextResponse> {
  const cachedHeatmap = await getCached<HeatmapResponse>(HEATMAP_CACHE_KEY);
  if (cachedHeatmap) {
    return NextResponse.json(cachedHeatmap);
  }

  const session = getCurrentSession();

  try {
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

    const sectorMap = new Map<string, HeatmapStock[]>();

    for (const ticker of SP500_TICKERS) {
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

      const stock: HeatmapStock = {
        ticker,
        name,
        sector: sectorName,
        marketCap,
        change,
        price,
        previousClose: isFinite(previousClose) ? previousClose : undefined,
        isExtended,
      };

      const existing = sectorMap.get(sectorName) ?? [];
      existing.push(stock);
      sectorMap.set(sectorName, existing);
    }

    if (sectorMap.size === 0) {
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

    const sectors: HeatmapSector[] = Array.from(sectorMap.entries())
      .map(([name, stocks]) => {
        const sorted = [...stocks].sort((a, b) => b.marketCap - a.marketCap);
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

    const response: HeatmapResponse = {
      success: true,
      sectors,
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

export const GET = withRateLimit(heatmapHandler, { windowMs: 60_000, maxRequests: 5 });
