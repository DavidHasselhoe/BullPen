import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase/client';
import { getSessionForApiRoute, addSecurityHeaders } from '@/lib/security/api-security';
import {
  SECTOR_DISPLAY_ORDER,
  STOCKS_PER_SECTOR_RAIL,
  ETF_THEMES,
  COMMODITY_SYMBOLS,
  CRYPTO_SYMBOLS,
  type TickerItem,
  type DiscoverFeed,
} from '@/lib/discover/discover-config';

export const dynamic = 'force-dynamic';

interface ScreenerRowSlim {
  ticker: string;
  name: string;
  logo_url: string | null;
  sector: string | null;
  market_cap: number | null;
  dividend_yield: number | null;
}

// ── Shared screener_stats loader, cached for 60s across all users ─────────────
const loadScreenerStats = unstable_cache(
  async () => {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('screener_stats')
      .select('ticker, name, logo_url, sector, market_cap, dividend_yield')
      .order('market_cap', { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ScreenerRowSlim[];
  },
  ['discover-feed-screener-stats'],
  { revalidate: 60 }
);

function rowToItem(r: ScreenerRowSlim): TickerItem {
  return {
    symbol: r.ticker,
    ticker: r.ticker,
    name: r.name,
    logoUrl: r.logo_url,
    sector: r.sector,
    marketCap: r.market_cap,
    dividendYield: r.dividend_yield,
  };
}

// ── For ETFs/commodities/crypto we need name+logo — fetch from companies table ─
async function fetchCompanyMeta(
  tickers: string[]
): Promise<Map<string, { name: string; logo_url: string | null }>> {
  if (tickers.length === 0) return new Map();
  const supabase = createServerClient();
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const { data } = await supabase
    .from('companies')
    .select('ticker, name, logo_url')
    .in('ticker', upper);
  return new Map((data ?? []).map((c) => [c.ticker, { name: c.name, logo_url: c.logo_url }]));
}

// ── For You: derive 2-3 sectors from user's holdings + watchlist ──────────────
async function buildForYouRail(
  userId: string | null,
  stocksBySector: Map<string, ScreenerRowSlim[]>,
  allRows: ScreenerRowSlim[]
): Promise<DiscoverFeed['forYou']> {
  if (!userId) {
    // Anonymous → top trending fallback
    return {
      mode: 'trending',
      items: allRows.slice(0, 12).map(rowToItem),
      explanation: 'Most-watched stocks today',
    };
  }

  const supabase = createServerClient();

  // Holdings + watchlist symbols (deduped, uppercase)
  const [holdingsRes, watchlistRes] = await Promise.all([
    supabase.from('user_holdings').select('symbol').eq('user_id', userId),
    supabase.from('user_watchlist').select('symbol').eq('user_id', userId),
  ]);

  const userSymbols = new Set<string>();
  for (const row of holdingsRes.data ?? []) userSymbols.add((row.symbol as string).toUpperCase());
  for (const row of watchlistRes.data ?? []) userSymbols.add((row.symbol as string).toUpperCase());

  if (userSymbols.size === 0) {
    return {
      mode: 'trending',
      items: allRows.slice(0, 12).map(rowToItem),
      explanation: 'Most-watched stocks today',
    };
  }

  // Tally sectors from owned/watched tickers
  const sectorCounts = new Map<string, number>();
  const tickerToRow = new Map(allRows.map((r) => [r.ticker, r]));
  for (const sym of userSymbols) {
    const row = tickerToRow.get(sym);
    if (row?.sector) sectorCounts.set(row.sector, (sectorCounts.get(row.sector) ?? 0) + 1);
  }

  if (sectorCounts.size === 0) {
    return {
      mode: 'trending',
      items: allRows.slice(0, 12).map(rowToItem),
      explanation: 'Most-watched stocks today',
    };
  }

  // Pick top 3 sectors
  const topSectors = [...sectorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s]) => s);

  // Round-robin pick from each top sector, skipping symbols user already owns
  const candidates: ScreenerRowSlim[] = [];
  const perSector = Math.ceil(12 / topSectors.length);
  for (const sector of topSectors) {
    const sectorRows = stocksBySector.get(sector) ?? [];
    const fresh = sectorRows.filter((r) => !userSymbols.has(r.ticker)).slice(0, perSector);
    candidates.push(...fresh);
  }

  // Sector display label lookup (use friendly label from config)
  const sectorLabel = (key: string) =>
    SECTOR_DISPLAY_ORDER.find((s) => s.key === key)?.label ?? key;
  const explanation =
    `Based on your ${topSectors.map(sectorLabel).slice(0, 2).join(' + ')} holdings`;

  return {
    mode: 'personalized',
    items: candidates.slice(0, 12).map(rowToItem),
    explanation,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  const session = await getSessionForApiRoute();
  const userId = session?.userId ?? null;

  let allRows: ScreenerRowSlim[];
  try {
    allRows = await loadScreenerStats();
  } catch (err) {
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Failed to load stats' },
        { status: 500 }
      )
    );
  }

  // Group rows by sector once
  const stocksBySector = new Map<string, ScreenerRowSlim[]>();
  for (const row of allRows) {
    if (!row.sector) continue;
    const list = stocksBySector.get(row.sector) ?? [];
    list.push(row);
    stocksBySector.set(row.sector, list);
  }

  // Build sector rails
  const sectors: Record<string, TickerItem[]> = {};
  for (const entry of SECTOR_DISPLAY_ORDER) {
    const rows = (stocksBySector.get(entry.key) ?? []).slice(0, STOCKS_PER_SECTOR_RAIL);
    sectors[entry.key] = rows.map(rowToItem);
  }

  // Build ETF/commodity/crypto rails — need name + logo from companies table
  const allNonStockTickers = [
    ...ETF_THEMES.flatMap((t) => t.tickers),
    ...COMMODITY_SYMBOLS.map((c) => c.symbol),
    ...CRYPTO_SYMBOLS.map((c) => c.symbol),
  ];
  const meta = await fetchCompanyMeta(allNonStockTickers);

  const etfs: Record<string, TickerItem[]> = {};
  for (const theme of ETF_THEMES) {
    etfs[theme.key] = theme.tickers.map((t) => {
      const m = meta.get(t.toUpperCase());
      return {
        symbol: t,
        ticker: t,
        name: m?.name ?? t,
        logoUrl: m?.logo_url ?? null,
      };
    });
  }

  const commodities: TickerItem[] = COMMODITY_SYMBOLS.map((c) => {
    const m = meta.get(c.symbol.toUpperCase());
    return {
      symbol: c.symbol,
      // For pair symbols, the display ticker is the base part (XAU/USD → XAU)
      ticker: c.symbol.split('/')[0],
      name: m?.name ?? c.name,
      logoUrl: m?.logo_url ?? null,
    };
  });

  const crypto: TickerItem[] = CRYPTO_SYMBOLS.map((c) => {
    const m = meta.get(c.symbol.toUpperCase());
    return {
      symbol: c.symbol,
      ticker: c.symbol.split('/')[0],
      name: m?.name ?? c.name,
      logoUrl: m?.logo_url ?? null,
    };
  });

  // For You rail (uses user holdings + watchlist when signed in)
  const forYou = await buildForYouRail(userId, stocksBySector, allRows);

  const feed: DiscoverFeed = { forYou, sectors, etfs, commodities, crypto };

  const response = NextResponse.json({ success: true, feed });
  // Edge-cache anonymous responses; user-specific responses are still cheap (~1 query)
  if (!userId) {
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  } else {
    response.headers.set('Cache-Control', 'private, max-age=30');
  }
  return addSecurityHeaders(response);
}
