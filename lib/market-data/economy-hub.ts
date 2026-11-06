/**
 * Context the economy hub puts beside each number, computed from the stored
 * history only: nothing here is an estimate. Client-safe.
 */

import type { HistoryRow, MetricKey } from './economic-results';

export type Extreme =
  /** e.g. "Highest since March 2024": the last time it was at least this high. */
  | { dir: 'high' | 'low'; since: string }
  /** Never this high (or low) in the stored history, which spans `years`. */
  | { dir: 'high' | 'low'; years: number };

/**
 * How far back the last comparable reading must be before "highest since" is
 * worth saying: a year of months, a year of quarters, a quarter of weeks.
 * "Highest since four months ago" tells a beginner little, or sounds alarming.
 */
export const EXTREME_MIN_BACK: Record<string, number> = { cpi: 12, pce: 12, jobs: 12, gdp: 4, claims: 13 };

/**
 * How unusual the newest value is against its own history. Null when it did
 * not move, or when the last comparable reading is under `minBack` periods back.
 */
export function extremeSince(rows: HistoryRow[], key: MetricKey, minBack = 3): Extreme | null {
  const pts = rows.filter((r) => r.values[key] != null).map((r) => ({ period: r.period, v: r.values[key]! }));
  if (pts.length < minBack + 1) return null;
  const cur = pts.at(-1)!;
  const prev = pts.at(-2)!;
  if (cur.v === prev.v) return null;
  const dir = cur.v > prev.v ? 'high' : 'low';
  for (let i = pts.length - 3; i >= 0; i--) {
    if (dir === 'high' ? pts[i].v >= cur.v : pts[i].v <= cur.v) {
      return i <= pts.length - 1 - minBack ? { dir, since: pts[i].period } : null;
    }
  }
  const years = Math.floor((Date.parse(cur.period) - Date.parse(pts[0].period)) / (365.25 * 86_400_000));
  return years >= 2 ? { dir, years } : null;
}

// Runnable check: npx tsx lib/market-data/economy-hub.ts
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('economy-hub.ts')) {
  const rows = (vals: number[]) => vals.map((v, i) => ({ period: `20${10 + i}-01-01`, values: { gdp: v } }));
  const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
  eq(extremeSince(rows([5, 1, 2, 3, 4]), 'gdp'), { dir: 'high', since: '2010-01-01' });
  eq(extremeSince(rows([1, 2, 3, 4, 5]), 'gdp'), { dir: 'high', years: 4 });
  eq(extremeSince(rows([1, 2, 5, 3, 4]), 'gdp'), null); // last >= was 2 back
  eq(extremeSince(rows([1, 2, 3, 4, 4]), 'gdp'), null); // unchanged
  eq(extremeSince(rows([0, 9, 8, 7, 1]), 'gdp'), { dir: 'low', since: '2010-01-01' });
  eq(extremeSince(rows([5, 1, 2, 3, 4]), 'gdp', 4), { dir: 'high', since: '2010-01-01' });
  eq(extremeSince(rows([1, 5, 2, 3, 4]), 'gdp', 4), null); // only 3 back
  console.log('economy-hub ok');
}
