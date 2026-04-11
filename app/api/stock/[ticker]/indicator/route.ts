import { NextRequest, NextResponse } from 'next/server';
import { getIndicator, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

const ALLOWED_INDICATORS = new Set(['sma', 'ema', 'rsi', 'macd', 'bbands']);

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
  const outputsizeMap: Record<string, number> = {
    '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095, '5Y': 1825, 'MAX': 5000,
  };
  const outputsize = outputsizeMap[range] ?? 365;

  const extraParams: Record<string, string | number> = { outputsize };

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
