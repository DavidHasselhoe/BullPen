/**
 * The track-record maths, isolated from data loading so it can be checked on
 * its own. This is the part of the feature that has to be right — everything
 * else is plumbing around it.
 *
 * The invariant worth stating plainly, because getting it wrong is the classic
 * way a mediocre track record is made to look good: **adding a new pick must
 * not move the historical line.** Each pick's notional $100 enters the value
 * and the cost basis on the same day, so a fresh pick contributes exactly 0%
 * on its entry date and can only shift the line by actually moving afterwards.
 *
 * Inputs are deliberately plain — a shared date axis plus per-pick prices
 * already aligned to it — so `scripts/verify-picks-math.ts` can drive these
 * with synthetic prices and assert the invariant holds.
 */

import { DOLLARS_PER_PICK, type NormalizedPoint, type SeriesPoint } from './types';

/** Cap the normalized curve so the payload stays small on a long record. */
const MAX_NORMALIZED_POINTS = 200;

export interface SeriesPick {
  /** Price paid: the open of the first regular session on/after the pick date. */
  entryPrice: number;
  /** SPY's open on that same session. */
  benchmarkEntryPrice: number;
  /** Index into the shared date axis where this pick's money went in. */
  entryIndex: number;
  /**
   * Closes aligned to the shared axis, forward-filled, null before the symbol's
   * first bar. A closed position holds flat at its close price from closeDate on.
   */
  closes: Array<number | null>;
  closePrice?: number | null;
  closeDate?: string | null;
}

function priceAt(p: SeriesPick, i: number, axis: string[]): number | null {
  if (p.closePrice != null && p.closeDate != null && axis[i] >= p.closeDate) {
    return p.closePrice;
  }
  return p.closes[i];
}

/**
 * Calendar-time cumulative return of the simulated equal-dollar portfolio,
 * alongside SPY bought on the identical schedule.
 */
export function buildSeries(
  picks: SeriesPick[],
  axis: string[],
  benchmarkCloses: Array<number | null>,
): SeriesPoint[] {
  if (picks.length === 0) return [];

  const out: SeriesPoint[] = [];
  const firstEntry = Math.min(...picks.map((p) => p.entryIndex));

  for (let i = firstEntry; i < axis.length; i++) {
    const spy = benchmarkCloses[i];
    if (spy == null) continue;

    let value = 0;
    let benchValue = 0;
    let contributed = 0;
    let liveCount = 0;

    for (const p of picks) {
      if (p.entryIndex > i) continue;          // not bought yet on this day
      const price = priceAt(p, i, axis);
      if (price == null) continue;

      value += DOLLARS_PER_PICK * (price / p.entryPrice);
      benchValue += DOLLARS_PER_PICK * (spy / p.benchmarkEntryPrice);
      contributed += DOLLARS_PER_PICK;
      liveCount++;
    }

    if (contributed === 0) continue;

    out.push({
      t: Math.floor(new Date(`${axis[i]}T21:00:00Z`).getTime() / 1000),
      picksPct: (value / contributed - 1) * 100,
      benchmarkPct: (benchValue / contributed - 1) * 100,
      liveCount,
    });
  }

  return out;
}

/**
 * "How does a typical pick behave after we flag it" — every pick's line starts
 * at 0% on its own entry day, averaged across the picks that have reached that
 * age. `n` shrinks as the axis extends and is returned so the UI can print it:
 * at day 300 the average may rest on three picks, and that has to be visible.
 */
export function buildNormalized(picks: SeriesPick[], axis: string[]): NormalizedPoint[] {
  if (picks.length === 0) return [];

  const byDay = new Map<number, number[]>();

  for (const p of picks) {
    const entryMs = new Date(`${axis[p.entryIndex]}T00:00:00Z`).getTime();
    for (let i = p.entryIndex; i < axis.length; i++) {
      const price = priceAt(p, i, axis);
      if (price == null) continue;
      const day = Math.round((new Date(`${axis[i]}T00:00:00Z`).getTime() - entryMs) / 86_400_000);
      const pct = (price / p.entryPrice - 1) * 100;
      const list = byDay.get(day);
      if (list) list.push(pct);
      else byDay.set(day, [pct]);
    }
  }

  const days = [...byDay.keys()].sort((a, b) => a - b);
  if (days.length === 0) return [];

  const stride = Math.max(1, Math.ceil(days.length / MAX_NORMALIZED_POINTS));
  const sampled = new Set<number>();
  for (let i = 0; i < days.length; i += stride) sampled.add(days[i]);
  // Always include the final day so the curve ends where the record actually does.
  sampled.add(days[days.length - 1]);

  return [...sampled]
    .sort((a, b) => a - b)
    .map((day) => {
      const values = byDay.get(day)!;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return {
        day,
        avgPct: values.reduce((a, b) => a + b, 0) / values.length,
        medianPct: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
        n: values.length,
      };
    });
}
