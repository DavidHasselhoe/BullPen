import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getSessionForApiRoute, addSecurityHeaders } from '@/lib/security/api-security';
import {
  SECTOR_DISPLAY_ORDER,
  STOCKS_PER_SECTOR_RAIL,
  ETF_THEMES,
  ETF_ISSUER_DOMAINS,
  COMMODITY_SYMBOLS,
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

  // Commodities — rely on initials fallback; no logo override
  const commodities: TickerItem[] = COMMODITY_SYMBOLS.map((c) => {
    const m = allMeta.get(c.symbol.toUpperCase());
    return {
      symbol: c.symbol,
      ticker: c.symbol.split('/')[0],
      name: m?.name ?? c.name,
      logoUrl: m?.logo_url ?? null,
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
  const feed: DiscoverFeed = { forYou, sectors, etfs, commodities, crypto };

  const response = NextResponse.json({ success: true, feed });
  if (!userId) {
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  } else {
    response.headers.set('Cache-Control', 'private, max-age=30');
  }
  return addSecurityHeaders(response);
}
