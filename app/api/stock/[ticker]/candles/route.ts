import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getStockCandles, withRateLimitRetry, TwelveDataRateLimitError, type StockCandles } from '@/lib/twelvedata/twelvedata-client';
import { slugToSymbol, inferAssetType, has24hTrading } from '@/lib/assets/asset-type';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { rget, rset, candleTtlSeconds } from '@/lib/cache/redis-cache';

// "Today" (ET) has no candles yet before pre-market opens at 4am, and TwelveData
// returns no_data for weekends/holidays too. Walk backward a few calendar days so
// the 1D chart falls back to the most recent completed session instead of going
// blank — once today's own pre-market candle exists, the first attempt succeeds
// and this never runs.
function etDateDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

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
  context: { params: Promise<{ ticker: string }> }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = slugToSymbol(ticker).toUpperCase();
  const assetType = inferAssetType(symbol);
  const { searchParams } = new URL(request.url);
  const range = (searchParams.get('range') ?? '1Y') as Range;
  // Extra leading history (calendar days) so indicators like a 200-period SMA
  // have warm-up data before the visible window. Ignored for 1D (intraday).
  const padDays = Math.max(0, Math.min(4000, parseInt(searchParams.get('padDays') ?? '0', 10) || 0));

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
  const from = is1D ? now - 24 * 60 * 60 : now - (config.daysBack + padDays) * 24 * 60 * 60;
  // 1W uses 15min bars — include pre/post market candles so today's extended-hours
  // move shows as part of the line instead of stopping at the prior regular close.
  // 1M (1h bars) is deliberately excluded: TwelveData rejects prepost for any
  // interval over 30min ("Pre/post data for this exchange is available only up
  // to 30min intervals") — confirmed in production logs as a hard 500 on every
  // 1M request once this was mistakenly included. Daily/weekly-bar ranges don't
  // need this either: a single end-of-day bar isn't meaningful to split into sessions.
  const includeExtendedHours = !isCrypto24h && range === '1W';
  const candleOptions = is1D && todayDateET
    ? { extendedHours: true, startDate: `${todayDateET} 04:00:00`, endDate: `${todayDateET} 23:59:00` }
    : includeExtendedHours
      ? { extendedHours: true }
      : undefined;

  // ── Server-side cache ─────────────────────────────────────────────────────
  // 1D bars: clients poll every 60 s, so we cache in Redis with a session-aware
  //   TTL (10 s regular, 30 s extended, 5 min closed). The short TTL keeps data
  //   fresh while absorbing the per-user poll burst across serverless instances.
  // Non-1D: cache in Supabase (infrequent reads, longer TTL)
  //   30 min for 1W/1M (15min/1h bars), 6 h for daily/weekly bars.
  const cacheHeader = is1D
    ? 'private, no-cache'
    : 'public, s-maxage=300, stale-while-revalidate=60';

  if (is1D) {
    // Crypto has no ET date concept — use a plain '24h' suffix so keys don't
    // collide across the midnight boundary for stocks.
    const rKey = `candles:1D:${symbol}:${todayDateET ?? '24h'}`;
    const cached = await rget<Record<string, unknown>>(rKey);
    if (cached) {
      return addSecurityHeaders(
        NextResponse.json(cached, { headers: { 'Cache-Control': cacheHeader } })
      );
    }
  }

  // Non-1D TTL scales with how often the underlying bar resolution actually
  // changes: 1W/1M use intraday bars (15min/1h) so they stay short; 6M/1Y/YTD
  // are daily bars that only gain a new point once a session closes; 5Y/MAX
  // are weekly bars, effectively static within a day.
  const cacheTtlSeconds = is1D
    ? null
    : (range === '1W' || range === '1M')
    ? 30 * 60
    : (range === '5Y' || range === 'MAX')
    ? 24 * 60 * 60
    : 12 * 60 * 60;
  const cacheKey = cacheTtlSeconds != null
    ? (padDays > 0 ? `candles:${symbol}:${range}:p${padDays}` : `candles:${symbol}:${range}`)
    : null;

  if (cacheKey) {
    const cachedBody = await getCached<Record<string, unknown>>(cacheKey);
    if (cachedBody) {
      return addSecurityHeaders(
        NextResponse.json(cachedBody, { headers: { 'Cache-Control': cacheHeader } })
      );
    }
  }

  try {
    // withRateLimitRetry also covers transient socket errors seen intermittently on
    // this route in production ("TypeError: terminated", "SocketError: other side
    // closed") — those aren't rate-limit hits, but retrying once clears them.
    let candles: StockCandles | null = null;

    if (is1D && todayDateET) {
      for (let daysBack = 0; daysBack < 6; daysBack++) {
        const dateET = daysBack === 0 ? todayDateET : etDateDaysAgo(daysBack);
        const attemptOptions = { extendedHours: true, startDate: `${dateET} 04:00:00`, endDate: `${dateET} 23:59:00` };
        try {
          const attempt = await withRateLimitRetry(() => getStockCandles(symbol, from, now, resolution, attemptOptions));
          if (attempt.s !== 'no_data' && attempt.t.length > 0) {
            candles = attempt;
            break;
          }
        } catch (attemptErr) {
          // TwelveData throws (rather than returning s:'no_data') for a date
          // range with nothing in it yet — e.g. "today" before pre-market
          // opens. Treat that the same as no_data and try the previous day.
          if (attemptErr instanceof TwelveDataRateLimitError) throw attemptErr;
        }
      }
    } else {
      candles = await withRateLimitRetry(() => getStockCandles(symbol, from, now, resolution, candleOptions));
    }

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

    // Fire-and-forget cache writes; never block the response.
    if (is1D) {
      const rKey = `candles:1D:${symbol}:${todayDateET ?? '24h'}`;
      void rset(rKey, responseBody, candleTtlSeconds());
    } else if (cacheKey && cacheTtlSeconds != null) {
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

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 120 });
