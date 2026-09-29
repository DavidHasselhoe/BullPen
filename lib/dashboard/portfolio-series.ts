/** Client-safe: the portfolio line on Home, over a chosen period. */

export type SeriesRange = '1D' | '1W' | '1M' | '1Y';
export const SERIES_RANGES: SeriesRange[] = ['1D', '1W', '1M', '1Y'];

export interface SeriesInput {
  candles: { t: number[]; c: number[] };
  quantity: number;
  /** When the position was opened (ms epoch). Bars before it don't count. */
  openedAt: number;
  avgPrice: number;
  /** The previous close. On 1D it is the baseline, so the line ends at the day's change. */
  prevClose?: number | null;
}

export interface SeriesPoint {
  t: number;
  pl: number;
  plPct: number;
}

/**
 * Portfolio P/L over a period, summed across positions on one timeline.
 *
 * Each position's last known price carries forward to timestamps where it has
 * no bar of its own: pre-market minute bars are gappy, and crypto trades at
 * hours stocks don't. Summing only the positions that happen to have a bar at
 * a given minute made the line spike every time one skipped.
 *
 * Baseline per position: the purchase price if it was opened inside the
 * period, else the previous close on 1D, else the period's first bar.
 */
export function buildPortfolioSeries(inputs: SeriesInput[], range: SeriesRange) {
  const legs = inputs
    .filter((i) => i.candles.t.length > 0 && i.quantity > 0)
    .map((i) => {
      const openedInside = i.openedAt > i.candles.t[0] * 1000;
      const base = openedInside
        ? i.avgPrice
        : range === '1D' && i.prevClose && i.prevClose > 0
          ? i.prevClose
          : i.candles.c[0];
      return { ...i, base, idx: -1 };
    });

  const times = [...new Set(legs.flatMap((l) => l.candles.t))].sort((a, b) => a - b);
  const points: SeriesPoint[] = [];
  for (const t of times) {
    let pl = 0;
    let basis = 0;
    for (const l of legs) {
      if (t * 1000 < l.openedAt) continue;
      while (l.idx + 1 < l.candles.t.length && l.candles.t[l.idx + 1] <= t) l.idx++;
      const price = l.idx >= 0 ? l.candles.c[l.idx] : l.base;
      pl += (price - l.base) * l.quantity;
      basis += l.base * l.quantity;
    }
    if (basis > 0) points.push({ t, pl, plPct: (pl / basis) * 100 });
  }

  const last = points[points.length - 1];
  return { points, changeUSD: last?.pl ?? null, changePct: last?.plPct ?? null };
}
