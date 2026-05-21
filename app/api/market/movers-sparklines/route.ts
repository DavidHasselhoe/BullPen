/**
 * GET /api/market/movers-sparklines?symbols=TSLA,ORCL,AMZN,...
 *
 * Returns 5-min intraday close prices for each symbol — one request instead of N.
 * Not auth-gated (price shape is public data). Response is shared via CDN cache for
 * 5 minutes so multiple users benefit from the same server-side fetch.
 *
 * Cost: 1 TwelveData credit per symbol per server-side fetch (shared across all users).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getStockCandles } from '@/lib/twelvedata/twelvedata-client';
import { slugToSymbol, inferAssetType, has24hTrading } from '@/lib/assets/asset-type';

const MAX_SYMBOLS = 15;

async function fetchSparkline(symbol: string): Promise<number[]> {
  const assetType = inferAssetType(symbol);
  const isCrypto = has24hTrading(assetType);
  const now = Math.floor(Date.now() / 1000);
  const from = now - 24 * 60 * 60;

  // Stocks: anchor to today's ET calendar date so pre/regular/AH bars are all included.
  // Crypto: plain 24h unix window — no ET timezone needed.
  const todayDateET = !isCrypto
    ? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    : undefined;
  const candleOptions = todayDateET
    ? { extendedHours: true, startDate: `${todayDateET} 04:00:00`, endDate: `${todayDateET} 23:59:00` }
    : undefined;

  const candles = await getStockCandles(symbol, from, now, '5', candleOptions);
  if (!candles || candles.s === 'no_data' || !candles.c?.length) return [];
  return candles.c;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const raw = new URL(request.url).searchParams.get('symbols') ?? '';
  const symbols = raw
    .split(',')
    .map((s) => slugToSymbol(s.trim()).toUpperCase())
    .filter((s) => s.length > 0 && s.length <= 10)
    .slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return addSecurityHeaders(NextResponse.json({ sparklines: {} }));
  }

  const settled = await Promise.allSettled(
    symbols.map(async (sym) => {
      const prices = await fetchSparkline(sym);
      return [sym, prices] as const;
    })
  );

  const sparklines: Record<string, number[]> = {};
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      const [sym, prices] = result.value;
      sparklines[sym] = prices;
    }
  }

  return addSecurityHeaders(
    NextResponse.json({ sparklines }, {
      headers: {
        // Shared edge cache: 5 min fresh, 2 min stale-while-revalidate.
        // All users hitting this within the same 5 min window get the same response.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120',
      },
    })
  );
}

// Generous limit — the endpoint is cheap due to CDN caching.
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 30 });
