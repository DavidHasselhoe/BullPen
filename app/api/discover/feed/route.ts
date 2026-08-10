/**
 * GET /api/discover/feed
 *
 * Everything the Discover page needs on load: the index strip, sector
 * performance across all four timeframes, and the three idea collections.
 *
 * Deliberately does NOT include sector constituents. The old version of this
 * page hydrated ~132 ticker cards up front to fill eleven auto-scrolling rails,
 * almost none of which were ever read. Constituents now load from
 * /api/discover/sector/[key] when a row is actually expanded, so the page-load
 * payload is roughly a tenth of what it was.
 *
 * Credit cost per cache window, shared across all users:
 *   4  — index quotes (Redis 60 s)
 *   11 — sector ETF quotes (Redis 60 s)
 *   11 — sector daily history (Supabase cache 6 h)
 *   ~6 — quality-screen price hydration (Redis 15 min)
 *   ≤300 — 52-week universe, mostly served from the shared `seed:` cache the
 *          heatmap and price streams already fill (Redis 15 min)
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getSessionForApiRoute, addSecurityHeaders } from '@/lib/security/api-security';
import { getStockQuotes, withRateLimitRetry, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { getSectorPerformance } from '@/lib/discover/sector-performance';
import { getQualityAtDiscount, getFiftyTwoWeekExtremes } from '@/lib/discover/collections';
import {
  MARKET_INDICES,
  SECTOR_DISPLAY_ORDER,
  TRENDING_FALLBACK,
  type DiscoverFeed,
  type IndexQuote,
  type TickerItem,
} from '@/lib/discover/discover-config';

export const dynamic = 'force-dynamic';

// Version suffix: bump whenever the index list itself changes, so a deploy
// doesn't serve the previous set for another minute.
const INDEX_CACHE_KEY = 'discover:indices:v2';
const INDEX_TTL_SECONDS = 60;
const TRENDING_SIZE = 8;

// ── Company metadata ─────────────────────────────────────────────────────────

interface CompanyMeta { name: string; logo_url: string | null }

// `.returns<>()` / `as never` throughout this file: the generated Supabase
// `Database` type in this repo is degraded and doesn't carry every table or
// function, so untyped selects infer as `never` and RPC args as `undefined`.
// Same pattern as the deep-dive and picks routes.
async function fetchCompanyMeta(tickers: string[]): Promise<Map<string, CompanyMeta>> {
  if (tickers.length === 0) return new Map();
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const supabase = createServerClient();
  const { data } = await supabase
    .from('companies')
    .select('ticker, name, logo_url')
    .in('ticker', upper)
    .returns<Array<{ ticker: string; name: string; logo_url: string | null }>>();
  return new Map((data ?? []).map((c) => [c.ticker, { name: c.name, logo_url: c.logo_url }]));
}

// ── Index strip ──────────────────────────────────────────────────────────────

async function buildIndices(): Promise<IndexQuote[]> {
  const cached = await rget<IndexQuote[]>(INDEX_CACHE_KEY);
  if (cached) return cached;

  let quotes = new Map<string, { c: number; dp: number }>();
  try {
    quotes = await withRateLimitRetry(() => getStockQuotes(MARKET_INDICES.map((i) => i.symbol)));
  } catch (err) {
    console.error('[discover/feed] index quotes failed:', err);
  }

  const indices: IndexQuote[] = MARKET_INDICES.map((entry) => {
    const q = quotes.get(entry.symbol);
    return {
      symbol: entry.symbol,
      label: entry.label,
      hint: entry.hint,
      price: q && Number.isFinite(q.c) && q.c > 0 ? q.c : null,
      changePct: q && Number.isFinite(q.dp) ? q.dp : null,
    };
  });

  // Only cache a payload that actually resolved, so a transient failure isn't
  // pinned into the cache for a full minute.
  if (indices.some((i) => i.price != null)) void rset(INDEX_CACHE_KEY, indices, INDEX_TTL_SECONDS);
  return indices;
}

// ── Trending / For You ───────────────────────────────────────────────────────

async function buildTrending(userId: string | null): Promise<DiscoverFeed['collections']['trending']> {
  const supabase = createServerClient();

  if (userId) {
    const [holdingsRes, watchlistRes] = await Promise.all([
      supabase.from('user_holdings').select('symbol').eq('user_id', userId).returns<Array<{ symbol: string }>>(),
      supabase.from('user_watchlist').select('symbol').eq('user_id', userId).returns<Array<{ symbol: string }>>(),
    ]);

    const owned = new Set<string>();
    for (const row of holdingsRes.data ?? []) owned.add(row.symbol.toUpperCase());
    for (const row of watchlistRes.data ?? []) owned.add(row.symbol.toUpperCase());

    if (owned.size > 0) {
      // Surface names from the sectors the user already leans into, excluding
      // what they already hold or watch — the point is to show something new.
      const userSectors = SECTOR_DISPLAY_ORDER.filter((s) => s.tickers.some((t) => owned.has(t))).slice(0, 3);

      if (userSectors.length > 0) {
        const perSector = Math.ceil(TRENDING_SIZE / userSectors.length);
        const candidates = userSectors.flatMap((s) =>
          s.tickers.filter((t) => !owned.has(t)).slice(0, perSector)
        );
        const items = candidates.slice(0, TRENDING_SIZE);

        if (items.length > 0) {
          const meta = await fetchCompanyMeta(items);
          return {
            mode: 'personalized',
            explanation: `More from the sectors you follow: ${userSectors.slice(0, 2).map((s) => s.label).join(' and ')}`,
            items: items.map((t) => ({
              symbol: t,
              ticker: t,
              name: meta.get(t)?.name ?? t,
              logoUrl: meta.get(t)?.logo_url ?? null,
            })),
          };
        }
      }
    }
  }

  let tickers: string[] = [];
  try {
    const { data } = await supabase.rpc(
      'get_hot_picks',
      { time_period_hours: 24, limit_count: TRENDING_SIZE } as never,
    );
    if (Array.isArray(data)) {
      tickers = (data as Array<{ ticker?: string }>)
        .map((row) => (row.ticker ? String(row.ticker).toUpperCase() : ''))
        .filter(Boolean);
    }
  } catch {
    /* fall through to the hardcoded fallback */
  }
  if (tickers.length === 0) tickers = [...TRENDING_FALLBACK];

  const meta = await fetchCompanyMeta(tickers);
  return {
    mode: 'trending',
    explanation: 'What other BullPen users are looking at today',
    items: tickers.map((t) => ({
      symbol: t,
      ticker: t,
      name: meta.get(t)?.name ?? t,
      logoUrl: meta.get(t)?.logo_url ?? null,
    })),
  };
}

/** Fill in name/logo for screener-sourced items that `companies` knows better. */
async function enrich(items: TickerItem[]): Promise<TickerItem[]> {
  if (items.length === 0) return items;
  const meta = await fetchCompanyMeta(items.map((i) => i.ticker));
  return items.map((item) => {
    const m = meta.get(item.ticker.toUpperCase());
    return {
      ...item,
      name: m?.name ?? item.name,
      logoUrl: item.logoUrl ?? m?.logo_url ?? null,
    };
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const session = await getSessionForApiRoute();
  const userId = session?.userId ?? null;

  try {
    // Every branch is independently cached and independently failable — one
    // slow or broken source degrades its own section rather than the page.
    const [indicesResult, sectorsResult, trendingResult, qualityResult, extremesResult] =
      await Promise.allSettled([
        buildIndices(),
        getSectorPerformance(),
        buildTrending(userId),
        getQualityAtDiscount(),
        getFiftyTwoWeekExtremes(),
      ]);

    const settle = <T,>(r: PromiseSettledResult<T>, fallback: T, label: string): T => {
      if (r.status === 'fulfilled') return r.value;
      console.error(`[discover/feed] ${label} failed:`, r.reason);
      return fallback;
    };

    const extremes = settle(extremesResult, { near52High: [], near52Low: [] }, '52-week extremes');

    const [qualityDiscount, near52High, near52Low] = await Promise.all([
      enrich(settle(qualityResult, [], 'quality screen')),
      enrich(extremes.near52High),
      enrich(extremes.near52Low),
    ]);

    const feed: DiscoverFeed = {
      indices: settle(indicesResult, [], 'indices'),
      sectors: settle(
        sectorsResult,
        { '1D': [], '1W': [], '1M': [], YTD: [] },
        'sector performance',
      ),
      collections: {
        trending: settle(
          trendingResult,
          { mode: 'trending' as const, explanation: '', items: [] },
          'trending',
        ),
        qualityDiscount,
        near52High,
        near52Low,
      },
    };

    const response = NextResponse.json({ success: true, feed });
    // The personalized branch makes the payload user-specific; only the signed-out
    // shape is safe to share at the CDN edge.
    response.headers.set(
      'Cache-Control',
      userId ? 'private, max-age=60' : 'public, s-maxage=60, stale-while-revalidate=120',
    );
    return addSecurityHeaders(response);
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    console.error('[discover/feed] failed:', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load the feed' }, { status: 500 })
    );
  }
}
