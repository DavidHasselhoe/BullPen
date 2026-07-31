import { getStockCandles, withRateLimitRetry, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset, candleTtlSeconds } from '@/lib/cache/redis-cache';
import { todayET } from '@/lib/dates/calendar-format';

export interface CandleData {
  t: number[];
  c: number[];
}

export interface SparklineHolding {
  symbol: string;
  avgPrice: number;
  quantity: number;
  /** Unix ms — date_purchased ?? created_at, whichever the holding row has. */
  startMs: number;
}

export interface TodaySparklineResult {
  /** Downsampled to ~32 points — the sparkline's y-values, ascending by time. */
  points: number[];
  /** Percent change of the whole portfolio today, from the same series (last point). */
  pct: number;
  /** USD change of the whole portfolio today. */
  pnlUsd: number;
}

const MAX_SPARKLINE_POINTS = 32;

function downsample(points: number[], maxPoints: number): number[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * step)]);
}

/**
 * Reconstructs today's portfolio P/L curve from each holding's 1D candles.
 * Returns null when there's nothing to show yet (no candles for any symbol,
 * or the reconstructed basis is zero) — the caller treats that as "share
 * button disabled," never as a fabricated 0%.
 */
export function computeTodaySparkline(
  holdings: SparklineHolding[],
  candlesBySymbol: Record<string, CandleData | null>
): TodaySparklineResult | null {
  const dollarPlByTime = new Map<number, number>();
  const basisByTime = new Map<number, number>();
  let sawAnyCandles = false;

  for (const h of holdings) {
    const candles = candlesBySymbol[h.symbol];
    if (!candles || candles.t.length === 0) continue;
    sawAnyCandles = true;

    const { t, c } = candles;
    const periodStartMs = t[0] * 1000;
    // Position opened after today's window started (rare for "today," but
    // matches the same rule PortfolioSummaryWidget's weekly version uses):
    // baseline off the actual purchase price, not today's opening tick.
    const boughtDuringPeriod = h.startMs > periodStartMs;
    const basePrice = boughtDuringPeriod ? h.avgPrice : c[0];

    for (let i = 0; i < t.length; i++) {
      if (t[i] * 1000 < h.startMs) continue;
      dollarPlByTime.set(t[i], (dollarPlByTime.get(t[i]) ?? 0) + (c[i] - basePrice) * h.quantity);
      basisByTime.set(t[i], (basisByTime.get(t[i]) ?? 0) + basePrice * h.quantity);
    }
  }

  if (!sawAnyCandles) return null;

  const sortedTimes = Array.from(dollarPlByTime.keys()).sort((a, b) => a - b);
  const rawPoints = sortedTimes.map((t) => {
    const basis = basisByTime.get(t) ?? 0;
    return basis > 0 ? ((dollarPlByTime.get(t) ?? 0) / basis) * 100 : 0;
  });

  const lastTime = sortedTimes[sortedTimes.length - 1];
  const finalDollarPl = dollarPlByTime.get(lastTime) ?? 0;
  const finalBasis = basisByTime.get(lastTime) ?? 0;
  if (finalBasis <= 0) return null;

  return {
    points: downsample(rawPoints, MAX_SPARKLINE_POINTS),
    pct: (finalDollarPl / finalBasis) * 100,
    pnlUsd: finalDollarPl,
  };
}

/**
 * Today's 1D candles for one symbol, US-equities-only (crypto/24h assets are
 * out of scope for this first slice — see spec Non-goals). Reads/writes the
 * SAME Redis key the existing `/api/stock/[ticker]/candles?range=1D` route
 * uses, so a user who just looked at their Holdings page (where the Share
 * button lives) gets a free cache hit here instead of a second TwelveData
 * call for the same data.
 *
 * Deliberately does NOT walk backward across days on a miss (unlike the
 * candles route's chart-continuity fallback) — a share card's entire point is
 * "today's" number, so no data for today means "nothing to share yet," not
 * "silently substitute yesterday and call it today."
 */
export async function getTodayCandlesForSymbol(symbol: string): Promise<CandleData | null> {
  const dateET = todayET();
  const rKey = `candles:1D:${symbol}:${dateET}`;

  const cached = await rget<{ candles?: CandleData | null }>(rKey);
  if (cached?.candles) return cached.candles;

  const now = Math.floor(Date.now() / 1000);
  const from = now - 24 * 60 * 60;

  try {
    const result = await withRateLimitRetry(() =>
      getStockCandles(symbol, from, now, '1', {
        extendedHours: true,
        startDate: `${dateET} 04:00:00`,
        endDate: `${dateET} 23:59:00`,
      })
    );
    if (result.s === 'no_data' || result.t.length === 0) return null;

    const candles: CandleData = { t: result.t, c: result.c };
    void rset(rKey, { candles }, candleTtlSeconds());
    return candles;
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) return null;
    throw err;
  }
}
