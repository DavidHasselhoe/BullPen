import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getSessionForApiRoute, addSecurityHeaders } from '@/lib/security/api-security';
import { getStockQuotes } from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import {
  SECTOR_DISPLAY_ORDER,
  STOCKS_PER_SECTOR_RAIL,
  ETF_THEMES,
  ETF_ISSUER_DOMAINS,
  COMMODITY_SYMBOLS,
  COMMODITY_LOGO_URLS,
  CRYPTO_SYMBOLS,
  CRYPTO_LOGO_URLS,
  TRENDING_FALLBACK,
  logoDevUrl,
  type TickerItem,
  type DiscoverFeed,
} from '@/lib/discover/discover-config';

export const dynamic = 'force-dynamic';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface CompanyMeta {
  name: string;
  logo_url: string | null;
}

async function fetchCompanyMeta(
  tickers: string[]
): Promise<Map<string, CompanyMeta>> {
  if (tickers.length === 0) return new Map();
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const supabase = createServerClient();
  const { data } = await supabase
    .from('companies')
    .select('ticker, name, logo_url')
    .in('ticker', upper);
  return new Map(
    (data ?? []).map((c) => [c.ticker, { name: c.name as string, logo_url: c.logo_url as string | null }])
  );
}

function toStockItem(ticker: string, meta: CompanyMeta | undefined): TickerItem {
  return {
    symbol: ticker,
    ticker,
    name: meta?.name ?? ticker,
    logoUrl: meta?.logo_url ?? null,
  };
}

function toEtfItem(ticker: string, meta: CompanyMeta | undefined): TickerItem {
  const issuerDomain = ETF_ISSUER_DOMAINS[ticker.toUpperCase()];
  const issuerLogo = issuerDomain ? logoDevUrl(issuerDomain) : null;
  return {
    symbol: ticker,
    ticker,
    name: meta?.name ?? ticker,
    // Prefer DB-stored logo if present, otherwise the issuer's brand logo
    logoUrl: meta?.logo_url ?? issuerLogo,
  };
}

// ── Price hydration ──────────────────────────────────────────────────────────
//
// Hydrate every TickerItem with a `previousClose` and `changePercent` from
// the last TwelveData quote. This guarantees that the page renders real
// numbers immediately — no skeleton on initial paint, no dependency on the
// live WebSocket (which is silent when markets are closed, e.g. on holidays).
// Cached shared across users for 5 minutes via market_data_cache to keep
// TwelveData credit usage bounded.

interface PriceSeed {
  previousClose: number;
  changePercent: number | null;
}

const PRICE_CACHE_TTL_S = 5 * 60;
const QUOTE_CHUNK = 100;

async function loadPriceSeed(symbol: string): Promise<PriceSeed | null> {
  return getCached<PriceSeed>(`discover-price:${symbol.toUpperCase()}`);
}

async function fetchAndCachePriceSeeds(symbols: string[]): Promise<Map<string, PriceSeed>> {
  if (symbols.length === 0) return new Map();
  const out = new Map<string, PriceSeed>();

  // TwelveData /batch caps at ~120 requests; chunk well under that.
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += QUOTE_CHUNK) {
    chunks.push(symbols.slice(i, i + QUOTE_CHUNK));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const quotes = await getStockQuotes(chunk);
        for (const [sym, q] of quotes.entries()) {
          if (!q || !isFinite(q.c) || q.c <= 0) continue;
          const previousClose = q.pc > 0 ? q.pc : q.c;
          const changePercent = isFinite(q.dp) ? q.dp : null;
          const seed: PriceSeed = { previousClose, changePercent };
          out.set(sym.toUpperCase(), seed);
          // Cache fire-and-forget — never block the response
          void setCached(`discover-price:${sym.toUpperCase()}`, sym, 'discover_price', seed, PRICE_CACHE_TTL_S);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[discover/feed] quote chunk failed:', err instanceof Error ? err.message : err);
        }
        // Non-fatal — other chunks + the SSE will still deliver prices
      }
    })
  );
  return out;
}

/**
 * Return a Map of symbol → { previousClose, changePercent } for every passed
 * symbol. Cache hits are reused; cache misses are fetched in chunks.
 */
async function hydratePriceSeeds(symbols: string[]): Promise<Map<string, PriceSeed>> {
  const upper = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const cached = await Promise.all(upper.map((s) => loadPriceSeed(s)));
  const seeds = new Map<string, PriceSeed>();
  const missing: string[] = [];
  upper.forEach((sym, i) => {
    const hit = cached[i];
    if (hit) seeds.set(sym, hit);
    else missing.push(sym);
  });
  if (missing.length > 0) {
    const freshlyFetched = await fetchAndCachePriceSeeds(missing);
    for (const [sym, seed] of freshlyFetched.entries()) seeds.set(sym, seed);
  }
  return seeds;
}

function applySeed(item: TickerItem, seeds: Map<string, PriceSeed>): TickerItem {
  const seed = seeds.get(item.symbol.toUpperCase());
  if (!seed) return item;
  return { ...item, previousClose: seed.previousClose, changePercent: seed.changePercent ?? undefined };
}

// ── For You / Trending Today ──────────────────────────────────────────────────

async function buildForYouRail(userId: string | null): Promise<DiscoverFeed['forYou']> {
  const supabase = createServerClient();

  // Try personalized: holdings + watchlist symbols
  if (userId) {
    const [holdingsRes, watchlistRes] = await Promise.all([
      supabase.from('user_holdings').select('symbol').eq('user_id', userId),
      supabase.from('user_watchlist').select('symbol').eq('user_id', userId),
    ]);

    const userSymbols = new Set<string>();
    for (const row of holdingsRes.data ?? []) userSymbols.add((row.symbol as string).toUpperCase());
    for (const row of watchlistRes.data ?? []) userSymbols.add((row.symbol as string).toUpperCase());

    if (userSymbols.size > 0) {
      // Personalized: surface stocks from the same sectors the user already follows,
      // excluding tickers they already own/watch.
      const userTickers = [...userSymbols];
      const userSectors = SECTOR_DISPLAY_ORDER.filter((s) =>
        s.tickers.some((t) => userSymbols.has(t))
      ).slice(0, 3);

      if (userSectors.length > 0) {
        const candidates: string[] = [];
        const perSector = Math.ceil(12 / userSectors.length);
        for (const sector of userSectors) {
          const fresh = sector.tickers.filter((t) => !userSymbols.has(t)).slice(0, perSector);
          candidates.push(...fresh);
        }
        const items = candidates.slice(0, 12);
        const meta = await fetchCompanyMeta(items);
        const explanation = `Based on your ${userSectors
          .slice(0, 2)
          .map((s) => s.label)
          .join(' + ')} holdings`;
        return {
          mode: 'personalized',
          items: items.map((t) => toStockItem(t, meta.get(t))),
          explanation,
        };
      }

      // User has holdings but none in our curated sector lists — fall through to trending.
      void userTickers;
    }
  }

  // Trending Today: most-viewed in the last 24h via the existing hot_picks function
  let trendingTickers: string[] = [];
  try {
    const { data: hotPicks } = await supabase.rpc('get_hot_picks', {
      time_period_hours: 24,
      limit_count: 12,
    });
    if (Array.isArray(hotPicks)) {
      trendingTickers = hotPicks
        .map((row: { ticker?: string }) => (row.ticker ? String(row.ticker).toUpperCase() : ''))
        .filter(Boolean);
    }
  } catch {
    /* fall through to hardcoded fallback */
  }

  if (trendingTickers.length === 0) {
    trendingTickers = [...TRENDING_FALLBACK];
  }

  const meta = await fetchCompanyMeta(trendingTickers);
  return {
    mode: 'trending',
    items: trendingTickers.map((t) => toStockItem(t, meta.get(t))),
    explanation: 'Most-viewed today',
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const session = await getSessionForApiRoute();
  const userId = session?.userId ?? null;

  // Collect every ticker we need company metadata for (stocks + ETFs)
  const sectorTickers = SECTOR_DISPLAY_ORDER.flatMap((s) =>
    s.tickers.slice(0, STOCKS_PER_SECTOR_RAIL)
  );
  const etfTickers = ETF_THEMES.flatMap((t) => t.tickers);
  const commodityTickers = COMMODITY_SYMBOLS.map((c) => c.symbol);
  const cryptoTickers = CRYPTO_SYMBOLS.map((c) => c.symbol);

  const allMeta = await fetchCompanyMeta([
    ...sectorTickers,
    ...etfTickers,
    ...commodityTickers,
    ...cryptoTickers,
  ]);

  // Build sector rails (one entry per SECTOR_DISPLAY_ORDER)
  const sectors: Record<string, TickerItem[]> = {};
  for (const entry of SECTOR_DISPLAY_ORDER) {
    sectors[entry.key] = entry.tickers
      .slice(0, STOCKS_PER_SECTOR_RAIL)
      .map((t) => toStockItem(t, allMeta.get(t)));
  }

  // ETF rails
  const etfs: Record<string, TickerItem[]> = {};
  for (const theme of ETF_THEMES) {
    etfs[theme.key] = theme.tickers.map((t) => toEtfItem(t, allMeta.get(t)));
  }

  // Commodities — self-hosted SVG logos in the company-logos bucket
  const commodities: TickerItem[] = COMMODITY_SYMBOLS.map((c) => {
    const m = allMeta.get(c.symbol.toUpperCase());
    return {
      symbol: c.symbol,
      ticker: c.symbol.split('/')[0],
      name: m?.name ?? c.name,
      logoUrl: m?.logo_url ?? COMMODITY_LOGO_URLS[c.symbol] ?? null,
    };
  });

  // Crypto — apply Coingecko logo overrides
  const crypto: TickerItem[] = CRYPTO_SYMBOLS.map((c) => {
    const m = allMeta.get(c.symbol.toUpperCase());
    return {
      symbol: c.symbol,
      ticker: c.symbol.split('/')[0],
      name: m?.name ?? c.name,
      logoUrl: m?.logo_url ?? CRYPTO_LOGO_URLS[c.symbol] ?? null,
    };
  });

  const forYou = await buildForYouRail(userId);

  // ── Hydrate every item with a price seed so cards never render empty ──
  // Collect every symbol that will appear on the page and resolve a single
  // map of price seeds (cache hits + chunked TwelveData fetches for misses).
  const allSymbols = [
    ...forYou.items.map((i) => i.symbol),
    ...Object.values(sectors).flat().map((i) => i.symbol),
    ...Object.values(etfs).flat().map((i) => i.symbol),
    ...commodities.map((i) => i.symbol),
    ...crypto.map((i) => i.symbol),
  ];
  const priceSeeds = await hydratePriceSeeds(allSymbols);

  const feed: DiscoverFeed = {
    forYou: { ...forYou, items: forYou.items.map((i) => applySeed(i, priceSeeds)) },
    sectors: Object.fromEntries(
      Object.entries(sectors).map(([k, list]) => [k, list.map((i) => applySeed(i, priceSeeds))])
    ),
    etfs: Object.fromEntries(
      Object.entries(etfs).map(([k, list]) => [k, list.map((i) => applySeed(i, priceSeeds))])
    ),
    commodities: commodities.map((i) => applySeed(i, priceSeeds)),
    crypto: crypto.map((i) => applySeed(i, priceSeeds)),
  };

  const response = NextResponse.json({ success: true, feed });
  if (!userId) {
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  } else {
    response.headers.set('Cache-Control', 'private, max-age=30');
  }
  return addSecurityHeaders(response);
}
