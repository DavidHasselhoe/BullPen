import { NextRequest, NextResponse } from 'next/server';
import {
  getMarketMovers,
  getTopMoversForSymbols,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { logger } from '@/lib/utils/logger';
import { humanizeError } from '@/lib/errors/humanize';
import { rget, rset } from '@/lib/cache/redis-cache';
import { createServerClient } from '@/lib/supabase/client';

// Custom-symbol movers are keyed by a sorted, deduped symbol list + limit.
// 30 s TTL: fresh enough for a live dashboard, cheap enough for concurrent users.
const MOVERS_TTL = 30;

function moversKey(symbols: string[], limit: number): string {
  return `movers:${limit}:${[...new Set(symbols)].sort().join(',')}`;
}

/**
 * Fill in company name and logo from our own tables.
 *
 * Deliberately non-fatal: movers without a name still render as a ticker, which
 * is what happened before this existed, so a slow or failing lookup must not
 * cost the whole response.
 */
async function withCompanyDetails<T extends { symbol: string; name?: string | null }>(
  movers: T[]
): Promise<Array<T & { logo_url?: string | null }>> {
  const tickers = [...new Set(movers.map((m) => m.symbol.toUpperCase()))];
  if (tickers.length === 0) return movers;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('companies')
      .select('ticker, name, logo_url')
      .in('ticker', tickers);
    const rows = new Map(
      ((data ?? []) as Array<{ ticker: string; name: string | null; logo_url: string | null }>)
        .map((r) => [r.ticker.toUpperCase(), r])
    );
    return movers.map((m) => {
      const row = rows.get(m.symbol.toUpperCase());
      return {
        ...m,
        // A stored name that is just the ticker is not a name (see the
        // screener_stats name=ticker problem); keep whatever the feed gave.
        name: m.name && m.name !== m.symbol ? m.name : row?.name && row.name !== row.ticker ? row.name : m.name,
        logo_url: row?.logo_url ?? null,
      };
    });
  } catch {
    return movers;
  }
}

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10), 20);
    const symbolsParam = searchParams.get('symbols');
    const symbols = symbolsParam
      ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : null;

    let gainers: Awaited<ReturnType<typeof getTopMoversForSymbols>>['gainers'];
    let losers: Awaited<ReturnType<typeof getTopMoversForSymbols>>['losers'];

    if (symbols && symbols.length > 0) {
      // Custom symbol set (holdings / watchlist) — cache in Redis so concurrent
      // users with the same portfolio don't each hit TwelveData independently.
      const key = moversKey(symbols, limit);
      const cached = await rget<{ gainers: typeof gainers; losers: typeof losers }>(key);
      if (cached) {
        ({ gainers, losers } = cached);
      } else {
        ({ gainers, losers } = await getTopMoversForSymbols(symbols, limit));
        void rset(key, { gainers, losers }, MOVERS_TTL);
      }
    } else {
      // All-markets path — CDN already caches via s-maxage=60 below, no Redis needed.
      ({ gainers, losers } = await getMarketMovers('stocks', limit));
    }

    // Names and logos ship with the movers. The card used to wait for this
    // response and then POST /api/companies/batch to resolve them, a second
    // round trip that could not start until this one finished. TwelveData's
    // mover rows often carry a name already; this fills the rest and adds the
    // logos, which it never had.
    const enriched = await withCompanyDetails([...gainers, ...losers]);
    const byTicker = new Map(enriched.map((m) => [m.symbol, m]));

    return addSecurityHeaders(
      NextResponse.json(
        {
          success: true,
          movers: {
            gainers: gainers.map((g) => byTicker.get(g.symbol) ?? g),
            losers: losers.map((l) => byTicker.get(l.symbol) ?? l),
          },
        },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
      )
    );
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: humanizeError(error), code: 'rate_limited' },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      );
    }
    logger.error('Error fetching top movers', error);
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: humanizeError(error) },
        { status: 500 }
      )
    );
  }
}

// 30 req/min — /market_movers uses 100 credits but is cached 5 min server-side
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 30 });

export const maxDuration = 120;
