import { NextRequest, NextResponse } from 'next/server';
import { getIndicator, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

const ALLOWED_INDICATORS = new Set(['sma', 'ema', 'rsi', 'macd', 'bbands']);

/** Must match candle chart resolution in `app/api/stock/[ticker]/candles/route.ts` so overlays align. */
const RANGE_TO_INDICATOR: Record<string, { interval: string; outputsize: number }> = {
  '1W': { interval: '15min', outputsize: 500 },
  '1M': { interval: '1h', outputsize: 500 },
  '6M': { interval: '1day', outputsize: 200 },
  '1Y': { interval: '1day', outputsize: 400 },
  '3Y': { interval: '1week', outputsize: 200 },
  '5Y': { interval: '1week', outputsize: 300 },
  '10Y': { interval: '1week', outputsize: 520 },
  MAX: { interval: '1week', outputsize: 5000 },
};

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const { searchParams } = request.nextUrl;

  const type = (searchParams.get('type') ?? '').toLowerCase();
  if (!ALLOWED_INDICATORS.has(type)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: `Unknown indicator: ${type}` }, { status: 400 })
    );
  }

  const range = searchParams.get('range') ?? '1Y';
  const { interval, outputsize } = RANGE_TO_INDICATOR[range] ?? RANGE_TO_INDICATOR['1Y'];

  const extraParams: Record<string, string | number> = { interval, outputsize };

  if (type === 'sma' || type === 'ema') {
    extraParams.time_period = parseInt(searchParams.get('time_period') ?? '50', 10);
  }
  if (type === 'rsi') {
    extraParams.time_period = parseInt(searchParams.get('time_period') ?? '14', 10);
  }
  if (type === 'bbands') {
    extraParams.time_period = parseInt(searchParams.get('time_period') ?? '20', 10);
  }

  try {
    const result = await getIndicator(symbol, type, extraParams);
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, symbol, type, data: result.values, meta: result.meta },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
