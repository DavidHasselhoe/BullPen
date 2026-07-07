/**
 * Landing-page hero quotes — one TwelveData /batch call shared by ALL visitors.
 *
 * The symbol list is fixed server-side (no user input), so the response is
 * cached in Redis and at the CDN edge. Cost ceiling: 4 credits per ~55 s
 * across the entire anonymous landing traffic, instead of 4 credits per
 * visitor per minute.
 */

import { NextResponse } from 'next/server';
import { getStockQuotes, TwelveDataRateLimitError } from '@/lib/market-data';
import { rget, rset } from '@/lib/cache/redis-cache';
import { logger } from '@/lib/utils/logger';

const SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'BTC/USD'];
const CACHE_KEY = 'landing:hero-quotes:v1';
const REDIS_TTL_SECONDS = 55; // hero polls every 60 s; keep one fetch per window

type QuotePayload = Record<string, { c: number; d: number; dp: number }>;

const CDN_HEADERS = {
  // Vercel edge absorbs repeat hits within 30 s; SWR keeps responses instant
  // while a single background revalidation refreshes the data.
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
};

export async function GET() {
  try {
    const cached = await rget<QuotePayload>(CACHE_KEY);
    if (cached) {
      return NextResponse.json({ success: true, quotes: cached }, { headers: CDN_HEADERS });
    }

    const quoteMap = await getStockQuotes(SYMBOLS);
    const quotes: QuotePayload = {};
    for (const [symbol, q] of quoteMap.entries()) {
      if (q.c > 0) quotes[symbol] = { c: q.c, d: q.d, dp: q.dp };
    }

    if (Object.keys(quotes).length > 0) {
      void rset(CACHE_KEY, quotes, REDIS_TTL_SECONDS);
    }

    return NextResponse.json({ success: true, quotes }, { headers: CDN_HEADERS });
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      // 200 with empty quotes — the hero falls back to its animated demo data,
      // and a non-error status avoids client retries amplifying the rate limit.
      return NextResponse.json({ success: false, quotes: {} }, { headers: CDN_HEADERS });
    }
    logger.error('[landing-quotes] Error', error);
    return NextResponse.json({ success: false, quotes: {} }, { status: 500 });
  }
}
