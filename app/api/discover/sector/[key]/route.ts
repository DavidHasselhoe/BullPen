/**
 * GET /api/discover/sector/[key]
 *
 * The constituents behind one row of the Discover sector chart, loaded only
 * when that row is actually expanded. Cached in Redis for 5 minutes and shared
 * across users, so the twelfth person to open Technology today pays nothing.
 *
 * Returned already sorted by today's move — the useful order when you've just
 * clicked into a sector because it was leading or lagging.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getStockQuotes, withRateLimitRetry, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { SECTOR_BY_KEY, STOCKS_PER_SECTOR, type TickerItem } from '@/lib/discover/discover-config';

const CACHE_TTL_SECONDS = 5 * 60;

async function handler(
  _request: NextRequest,
  context: unknown,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _session: { userId: string }
): Promise<NextResponse> {
  const { key } = await (context as { params: Promise<{ key: string }> }).params;

  const sector = SECTOR_BY_KEY.get(key);
  if (!sector) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Unknown sector' }, { status: 404 })
    );
  }

  const cacheKey = `discover:sector:${key}:v1`;
  const cached = await rget<TickerItem[]>(cacheKey);
  if (cached) {
    return addSecurityHeaders(NextResponse.json({ success: true, key, items: cached, cached: true }));
  }

  const tickers = sector.tickers.slice(0, STOCKS_PER_SECTOR);

  try {
    const supabase = createServerClient();
    const [metaRes, quotes] = await Promise.all([
      // `.returns<>()`: the generated Database type here is degraded, so an
      // untyped select infers its rows as `never`.
      supabase
        .from('companies')
        .select('ticker, name, logo_url')
        .in('ticker', tickers)
        .returns<Array<{ ticker: string; name: string; logo_url: string | null }>>(),
      withRateLimitRetry(() => getStockQuotes(tickers)).catch(() => new Map()),
    ]);

    const meta = new Map(
      (metaRes.data ?? []).map((c) => [c.ticker, { name: c.name, logoUrl: c.logo_url }])
    );

    const items: TickerItem[] = tickers
      .map((ticker) => {
        const q = quotes.get(ticker);
        const m = meta.get(ticker);
        return {
          symbol: ticker,
          ticker,
          name: m?.name ?? ticker,
          logoUrl: m?.logoUrl ?? null,
          sector: sector.label,
          previousClose: q && Number.isFinite(q.c) && q.c > 0 ? q.c : null,
          changePercent: q && Number.isFinite(q.dp) ? q.dp : null,
        };
      })
      // Biggest movers first — you opened this sector because it moved.
      .sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));

    void rset(cacheKey, items, CACHE_TTL_SECONDS);
    return addSecurityHeaders(NextResponse.json({ success: true, key, items }));
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    console.error(`[discover/sector/${key}] failed:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load sector' }, { status: 500 })
    );
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 60 } });
