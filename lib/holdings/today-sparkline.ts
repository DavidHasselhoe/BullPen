import { getStockCandles, withRateLimitRetry, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset, candleTtlSeconds } from '@/lib/cache/redis-cache';
import { todayET } from '@/lib/dates/calendar-format';

export interface CandleData {
  t: number[];
  c: number[];
}

export interface SparklineHolding {
  symbol: string;
  quantity: number;
  /**
   * Previous regular-session close and current price, from the same
   * prepost-aware quote the Holdings page's day-change column reads
   * (app/holdings/page.tsx). Today's number on the card has to be measured
   * from the same baseline the page measures from — previous close — or the
   * two disagree, most visibly in pre-market, where a card baselined on the
   * first 04:00 print silently drops the whole overnight gap.
   */
  prevClose: number | null;
  currentPrice: number | null;
}

export interface TodaySparklineResult {
  /** Downsampled to ~32 points — the sparkline's y-values, ascending by time. */
  points: number[];
  /** Percent change of the whole portfolio today, vs previous close. */
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
 * Today's portfolio P/L, headline and curve.
 *
 * The headline pct/pnlUsd comes from quotes, holding by holding — the exact
 * same sum the Holdings page renders (Σ (price − prevClose) × qty over
 * Σ prevClose × qty). Candles only shape the curve, and a symbol with no
 * candles today (nothing traded yet in pre-market) still counts toward the
 * headline, which is why the card can no longer report a different number
 * than the page it was shared from.
 *
 * Returns null when no holding has a usable quote — the caller treats that as
 * "share button disabled," never as a fabricated 0%.
 */
export function computeTodaySparkline(
  holdings: SparklineHolding[],
  candlesBySymbol: Record<string, CandleData | null>
): TodaySparklineResult | null {
  let pnlUsd = 0;
  let basis = 0;
  for (const h of holdings) {
    if (!h.prevClose || h.prevClose <= 0 || !h.currentPrice) continue;
    pnlUsd += (h.currentPrice - h.prevClose) * h.quantity;
    basis += h.prevClose * h.quantity;
  }
  if (basis <= 0) return null;
  const pct = (pnlUsd / basis) * 100;

  const dollarPlByTime = new Map<number, number>();
  const basisByTime = new Map<number, number>();

  for (const h of holdings) {
    const candles = candlesBySymbol[h.symbol];
    if (!candles || candles.t.length === 0 || !h.prevClose || h.prevClose <= 0) continue;
    const { t, c } = candles;
    for (let i = 0; i < t.length; i++) {
      dollarPlByTime.set(t[i], (dollarPlByTime.get(t[i]) ?? 0) + (c[i] - h.prevClose) * h.quantity);
      basisByTime.set(t[i], (basisByTime.get(t[i]) ?? 0) + h.prevClose * h.quantity);
    }
  }

  const sortedTimes = Array.from(dollarPlByTime.keys()).sort((a, b) => a - b);
  const rawPoints = sortedTimes.map((t) => {
    const b = basisByTime.get(t) ?? 0;
    return b > 0 ? ((dollarPlByTime.get(t) ?? 0) / b) * 100 : 0;
  });
  // Land the curve on the headline. Each minute's basis only covers the
  // symbols that actually printed that minute, so the last candle point can
  // sit well off the quoted total — a line that ends somewhere other than the
  // number printed above it just looks broken.
  rawPoints.push(pct);

  return { points: downsample(rawPoints, MAX_SPARKLINE_POINTS), pct, pnlUsd };
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
 * "today's" number, so no data for today means no curve for that symbol.
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
