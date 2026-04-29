import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getStockCandles } from '@/lib/twelvedata/twelvedata-client';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';

type Range = '1D' | '1W' | '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'MAX';
type Interval = '5min' | '15min' | '1h' | '4h' | '1day' | '1week';

interface RangeConfig {
  interval: Interval;
  daysBack: number;
}

const RANGE_CONFIG: Record<Range, RangeConfig> = {
  '1D':  { interval: '5min',  daysBack: 1 },
  '1W':  { interval: '15min', daysBack: 7 },
  '1M':  { interval: '1h',    daysBack: 31 },
  '6M':  { interval: '1day',  daysBack: 183 },
  '1Y':  { interval: '1day',  daysBack: 365 },
  '3Y':  { interval: '1week', daysBack: 365 * 3 },
  '5Y':  { interval: '1week', daysBack: 365 * 5 },
  '10Y': { interval: '1week', daysBack: 365 * 10 },
  'MAX': { interval: '1week', daysBack: 365 * 20 },
};

// Map our interval strings to TwelveData resolution codes
const INTERVAL_TO_RESOLUTION: Record<Interval, '1' | '5' | '15' | '60' | 'D' | 'W'> = {
  '5min':  '5',
  '15min': '15',
  '1h':    '60',
  '4h':    '60', // fall back to 1h for 4h
  '1day':  'D',
  '1week': 'W',
};

async function handler(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();
  const { searchParams } = new URL(request.url);
  const range = (searchParams.get('range') ?? '1Y') as Range;

  const config = RANGE_CONFIG[range] ?? RANGE_CONFIG['1Y'];
  const now = Math.floor(Date.now() / 1000);
  const resolution = INTERVAL_TO_RESOLUTION[config.interval];

  // For 1D: use today's actual ET calendar date and include extended hours so
  // pre-market (4am–9:30am) and after-hours (4pm–8pm) candles are returned.
  // Using daysBack=1 would compute a UTC date which gives yesterday's data.
  const is1D = range === '1D';
  const todayET = is1D
    ? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // "YYYY-MM-DD"
    : undefined;
  const from = is1D ? now : now - config.daysBack * 24 * 60 * 60;
  const candleOptions = is1D
    ? { extendedHours: true, startDate: todayET, endDate: todayET }
    : undefined;

  try {
    const candles = await getStockCandles(symbol, from, now, resolution, candleOptions);

    if (!candles || candles.s === 'no_data' || candles.t.length === 0) {
      return addSecurityHeaders(
        NextResponse.json({ success: true, candles: null, message: 'No data available' })
      );
    }

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        candles: {
          t: candles.t,
          o: candles.o,
          h: candles.h,
          l: candles.l,
          c: candles.c,
          v: candles.v,
          session: candles.session,
        },
        range,
        interval: config.interval,
      })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
      );
    }
    console.error(`[candles] Error for ${symbol}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch candles' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 120 });
