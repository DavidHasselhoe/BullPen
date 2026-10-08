/**
 * GET /api/discover/sector/[key]
 *
 * The constituents behind one row of the Discover sector chart, loaded only
 * when that row is actually expanded. Cached in Redis for 5 minutes and shared
 * across users, so the twelfth person to open Technology today pays nothing.
 *
 * Returned already sorted by today's move — the useful order when you've just
 * clicked into a sector because it was leading or lagging.
 *
 * Public, no auth required — /discover itself has no AuthGate, and this
 * handler never touched the session anyway (was previously wrapped in
 * withAuth regardless, 401-ing every anonymous expand).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getStockQuotes, withRateLimitRetry, TwelveDataRateLimitError, type StockQuote } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { SECTOR_BY_KEY, STOCKS_PER_SECTOR, type TickerItem } from '@/lib/discover/discover-config';

const CACHE_TTL_SECONDS = 5 * 60;

/**
 * Quotes for every ticker, or as many as two tries get. getStockQuotes drops a
 * symbol it couldn't parse (a per-symbol 429 included) without throwing, so the
 * missing ones get one more batch of their own.
 */
async function fetchQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
  const quotes = await withRateLimitRetry(() => getStockQuotes(tickers)).catch(() => new Map<string, StockQuote>());
  const missing = tickers.filter((t) => !quotes.has(t));
  if (missing.length === 0) return quotes;
  const retried = await withRateLimitRetry(() => getStockQuotes(missing)).catch(() => new Map<string, StockQuote>());
  for (const [t, q] of retried) quotes.set(t, q);
  return quotes;
}

async function handler(_request: NextRequest, context: unknown): Promise<NextResponse> {
  const { key } = await (context as { params: Promise<{ key: string }> }).params;

  const sector = SECTOR_BY_KEY.get(key);
  if (!sector) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Unknown sector' }, { status: 404 })
    );
  }

  const cacheKey = `discover:sector:${key}:v2`;
  const cached = await rget<TickerItem[]>(cacheKey);
  if (cached) {
    return addSecurityHeaders(NextResponse.json({ success: true, key, items: cached, cached: true }));
  }

  const tickers = sector.tickers.slice(0, STOCKS_PER_SECTOR);

  try {
    const supabase = createServerClient();
    const [logoRes, names, quotes] = await Promise.all([
      // `.returns<>()`: the generated Database type here is degraded, so an
      // untyped select infers its rows as `never`.
      supabase
        .from('companies')
        .select('ticker, logo_url')
        .in('ticker', tickers)
        .returns<Array<{ ticker: string; logo_url: string | null }>>(),
      // `companies` misses most large caps (ABBV, JNJ showed their ticker as
      // their name) and shouts the rest ("ELI LILLY & Co").
      getDisplayNames(tickers).catch(() => new Map<string, string>()),
      fetchQuotes(tickers),
    ]);

    const logos = new Map((logoRes.data ?? []).map((c) => [c.ticker, c.logo_url]));

    const items: TickerItem[] = tickers
      .map((ticker) => {
        const q = quotes.get(ticker);
        return {
          symbol: ticker,
          ticker,
          name: names.get(ticker) ?? ticker,
          logoUrl: logos.get(ticker) ?? null,
          sector: sector.label,
          previousClose: q && Number.isFinite(q.c) && q.c > 0 ? q.c : null,
          changePercent: q && Number.isFinite(q.dp) ? q.dp : null,
        };
      })
      // Biggest movers first — you opened this sector because it moved.
      .sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));

    // Only a complete answer is shared. A failed quote batch used to be cached
    // here as eleven dashes for five minutes, for everyone who opened the sector.
    if (quotes.size === tickers.length) void rset(cacheKey, items, CACHE_TTL_SECONDS);
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

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
