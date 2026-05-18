import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getStockCandles } from '@/lib/twelvedata/twelvedata-client';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { slugToSymbol, inferAssetType, has24hTrading } from '@/lib/assets/asset-type';
import { getCached, setCached } from '@/lib/cache/market-data-cache';

type Range = '1D' | '1W' | '1M' | '6M' | '1Y' | 'YTD' | '5Y' | 'MAX';
type Interval = '1min' | '5min' | '15min' | '1h' | '4h' | '1day' | '1week';

interface RangeConfig {
  interval: Interval;
  daysBack: number;
}

const RANGE_CONFIG: Record<Exclude<Range, 'YTD'>, RangeConfig> = {
  '1D':  { interval: '1min',  daysBack: 1 },
  '1W':  { interval: '15min', daysBack: 7 },
  '1M':  { interval: '1h',    daysBack: 31 },
  '6M':  { interval: '1day',  daysBack: 183 },
  '1Y':  { interval: '1day',  daysBack: 365 },
  '5Y':  { interval: '1week', daysBack: 365 * 5 },
  'MAX': { interval: '1week', daysBack: 365 * 20 },
};

// Map our interval strings to TwelveData resolution codes
const INTERVAL_TO_RESOLUTION: Record<Interval, '1' | '5' | '15' | '60' | 'D' | 'W'> = {
  '1min':  '1',
  '5min':  '5',
  '15min': '15',
  '1h':    '60',
  '4h':    '60',
  '1day':  'D',
  '1week': 'W',
};

async function handler(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = slugToSymbol(ticker).toUpperCase();
  const assetType = inferAssetType(symbol);
  const { searchParams } = new URL(request.url);
  const range = (searchParams.get('range') ?? '1Y') as Range;

  const now = Math.floor(Date.now() / 1000);
  // YTD: from Jan 1 of the current year at midnight UTC
  const ytdDaysBack = range === 'YTD'
    ? Math.ceil((Date.now() - new Date(new Date().getUTCFullYear(), 0, 1).getTime()) / 86_400_000)
    : 0;
  const config: RangeConfig = range === 'YTD'
    ? { interval: '1day', daysBack: ytdDaysBack }
    : (RANGE_CONFIG[range as Exclude<Range, 'YTD'>] ?? RANGE_CONFIG['1Y']);
  const resolution = INTERVAL_TO_RESOLUTION[config.interval];

  // For 1D stocks: use today's actual ET calendar date and include extended hours so
  // pre-market (4am–9:30am) and after-hours (4pm–8pm) candles are returned.
  // For crypto (24h market): use a plain 24h unix window — no ET date math needed.
  const is1D = range === '1D';
  const isCrypto24h = has24hTrading(assetType);
  const todayDateET = is1D && !isCrypto24h
    ? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // "YYYY-MM-DD"
    : undefined;
  const from = is1D ? now - 24 * 60 * 60 : now - config.daysBack * 24 * 60 * 60;
  const candleOptions = is1D && todayDateET
    ? { extendedHours: true, startDate: `${todayDateET} 04:00:00`, endDate: `${todayDateET} 23:59:00` }
    : undefined;

  // ── Server-side cache ─────────────────────────────────────────────────────
  // 1D bars are polled every 60 s by the client (extended-hours move) — skip
  // server cache there. For everything else, cache the response in Supabase:
  //   30 min for short intraday ranges (1W/1M use 15min/1h bars)
  //   6 h   for daily/weekly bars (6M, 1Y, YTD, 5Y, MAX — these don't change intraday)
  const cacheTtlSeconds = is1D
    ? null
    : (range === '1W' || range === '1M')
    ? 30 * 60
    : 6 * 60 * 60;
  const cacheKey = cacheTtlSeconds != null ? `candles:${symbol}:${range}` : null;

  const cacheHeader = is1D
    ? 'private, no-cache'
    : 'public, s-maxage=300, stale-while-revalidate=60';

  if (cacheKey) {
    const cachedBody = await getCached<Record<string, unknown>>(cacheKey);
    if (cachedBody) {
      return addSecurityHeaders(
        NextResponse.json(cachedBody, { headers: { 'Cache-Control': cacheHeader } })
      );
    }
  }

  try {
    const candles = await getStockCandles(symbol, from, now, resolution, candleOptions);

    if (!candles || candles.s === 'no_data' || candles.t.length === 0) {
      // Don't cache empty results — could be transient (weekend crypto edge, fresh listing)
      return addSecurityHeaders(
        NextResponse.json({ success: true, candles: null, message: 'No data available' })
      );
    }

    const responseBody = {
      success: true as const,
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
    };

    // Fire-and-forget cache write; never block the response.
    if (cacheKey && cacheTtlSeconds != null) {
      void setCached(cacheKey, symbol, 'candles', responseBody, cacheTtlSeconds);
    }

    return addSecurityHeaders(
      NextResponse.json(responseBody, { headers: { 'Cache-Control': cacheHeader } })
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
