/**
 * Daily-bar technical read for Bull: moving averages, RSI, 52-week range, and
 * support/resistance levels found from swing points. Pure, so the getTechnicals
 * tool and scripts/test-technicals.ts run the same math.
 */

import { sma, rsi, type OHLCV } from './indicators';

export const DEFAULT_SMA_LENGTHS = [20, 50, 100, 150, 200];

/** Bars on each side a swing high/low must beat to count as a pivot. */
const PIVOT_SPAN = 5;
/** Pivots within this fraction of a level's average join that level. */
const LEVEL_TOLERANCE = 0.02;
/** One trading year of bars for pivots and the 52-week range. */
const YEAR_BARS = 252;

export interface Level {
  level: number;
  distancePct: number;
  touches: number;
  lastTouched: number;
}

export interface Technicals {
  price: number;
  movingAverages: { length: number; value: number; pctFromPrice: number; slope: 'rising' | 'falling' | 'flat' }[];
  /** Lengths asked for that need more history than the bars cover. */
  unavailableLengths: number[];
  rsi14: number | null;
  high52w: { value: number; at: number; pctFromPrice: number };
  low52w: { value: number; at: number; pctFromPrice: number };
  support: Level[];
  resistance: Level[];
}

const round = (n: number) => Math.round(n * 100) / 100;
const pctFrom = (price: number, level: number) => round(((price - level) / level) * 100);

export function computeTechnicals(bars: OHLCV, price: number, smaLengths = DEFAULT_SMA_LENGTHS): Technicals {
  const n = bars.c.length;

  const movingAverages: Technicals['movingAverages'] = [];
  const unavailableLengths: number[] = [];
  for (const length of smaLengths) {
    const series = sma(bars.c, length);
    const value = series[n - 1];
    if (value == null) { unavailableLengths.push(length); continue; }
    // Slope over the last 20 bars; under half a percent either way reads as flat.
    const prior = series[n - 21];
    const change = prior != null ? (value - prior) / prior : 0;
    movingAverages.push({
      length,
      value: round(value),
      pctFromPrice: pctFrom(price, value),
      slope: change > 0.005 ? 'rising' : change < -0.005 ? 'falling' : 'flat',
    });
  }

  const rsiSeries = rsi(bars.c, 14);
  const rsi14 = rsiSeries[n - 1] != null ? round(rsiSeries[n - 1]!) : null;

  const start = Math.max(0, n - YEAR_BARS);
  let hi = start;
  let lo = start;
  for (let i = start; i < n; i++) {
    if (bars.h[i] > bars.h[hi]) hi = i;
    if (bars.l[i] < bars.l[lo]) lo = i;
  }

  // A swing high or low that held for PIVOT_SPAN bars either side. Highs and
  // lows share one pool: an old ceiling that broke often turns into a floor.
  const pivots: { price: number; at: number }[] = [];
  for (let i = start + PIVOT_SPAN; i < n - PIVOT_SPAN; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - PIVOT_SPAN; j <= i + PIVOT_SPAN; j++) {
      if (j === i) continue;
      if (bars.h[j] >= bars.h[i]) isHigh = false;
      if (bars.l[j] <= bars.l[i]) isLow = false;
    }
    if (isHigh) pivots.push({ price: bars.h[i], at: bars.t[i] });
    if (isLow) pivots.push({ price: bars.l[i], at: bars.t[i] });
  }

  // ponytail: greedy one-pass clustering on sorted prices, fine for ~50 pivots a year.
  pivots.sort((a, b) => a.price - b.price);
  const clusters: { sum: number; count: number; last: number }[] = [];
  for (const p of pivots) {
    const c = clusters[clusters.length - 1];
    if (c && Math.abs(p.price - c.sum / c.count) / (c.sum / c.count) <= LEVEL_TOLERANCE) {
      c.sum += p.price;
      c.count++;
      c.last = Math.max(c.last, p.at);
    } else {
      clusters.push({ sum: p.price, count: 1, last: p.at });
    }
  }
  const levels: Level[] = clusters.map((c) => {
    const level = c.sum / c.count;
    return { level: round(level), distancePct: pctFrom(price, level), touches: c.count, lastTouched: c.last };
  });

  return {
    price: round(price),
    movingAverages,
    unavailableLengths,
    rsi14,
    high52w: { value: round(bars.h[hi]), at: bars.t[hi], pctFromPrice: pctFrom(price, bars.h[hi]) },
    low52w: { value: round(bars.l[lo]), at: bars.t[lo], pctFromPrice: pctFrom(price, bars.l[lo]) },
    support: levels.filter((l) => l.level < price).sort((a, b) => b.level - a.level).slice(0, 3),
    resistance: levels.filter((l) => l.level > price).sort((a, b) => a.level - b.level).slice(0, 3),
  };
}
