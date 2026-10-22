/**
 * Checks the watchlist scorecard arithmetic (lib/watchlist/scorecard.ts).
 * Run: npx tsx scripts/test-watchlist-scorecard.ts
 */
import assert from 'node:assert/strict';
import { closeOnOrBefore, listScore, pickReturn, scoreHistory, todaySummary, type SinceAddedEntry } from '../lib/watchlist/scorecard';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

const entries: SinceAddedEntry[] = [
  // Current pick: 100 -> live 120 (+20%), SPY 500 -> 550 (+10%).
  { symbol: 'AAA', addedAt: '2026-08-03T15:00:00Z', startClose: 100, benchStart: 500 },
  // Removed loser: 50 -> 40 (-20%), SPY 520 -> 520 (0%). Must still count.
  { symbol: 'BBB', addedAt: '2026-09-01T15:00:00Z', startClose: 50, benchStart: 520, removedAt: '2026-10-01T15:00:00Z', endClose: 40, benchEnd: 520 },
  // Added today: no anchor, left out.
  { symbol: 'CCC', addedAt: '2026-10-22T15:00:00Z', startClose: null, benchStart: null },
];
const prices: Record<string, number> = { AAA: 120, BBB: 999, CCC: 10 };

const a = pickReturn(entries[0], 120, 550)!;
near(a.pct, 20);
near(a.benchPct, 10);
// A removed pick ignores the live price.
near(pickReturn(entries[1], 999, 999)!.pct, -20);
assert.equal(pickReturn(entries[2], 10, 550), null);

const score = listScore(entries, (s) => prices[s], 550)!;
near(score.pct, 0); // (+20 - 20) / 2: dropping the loser does not hide it
near(score.benchPct, 5); // (+10 + 0) / 2
assert.equal(score.counted, 2);
assert.equal(score.removed, 1);
assert.equal(listScore([entries[2]], (s) => prices[s], 550), null);

const today = todaySummary([
  { symbol: 'X', changePercent: -2 },
  { symbol: 'Y', changePercent: 0 },
  { symbol: 'Z', changePercent: 5 },
])!;
near(today.avg, 1);
assert.deepEqual([today.up, today.down, today.flat], [1, 1, 1]);
assert.equal(today.best.symbol, 'Z');
assert.equal(today.worst.symbol, 'X');
assert.equal(todaySummary([]), null);

// History: the last point must equal the strip's simple average, not a chained return.
const series: Record<string, { date: string; close: number }[]> = {
  A: [{ date: '2026-09-01', close: 100 }, { date: '2026-09-02', close: 110 }, { date: '2026-09-03', close: 110 }, { date: '2026-09-04', close: 120 }],
  B: [{ date: '2026-09-02', close: 50 }, { date: '2026-09-03', close: 55 }, { date: '2026-09-04', close: 99 }],
};
const spy = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map((date) => ({ date, close: 500 }));
const hist = scoreHistory(
  [{ symbol: 'A', start: '2026-09-01' }, { symbol: 'B', start: '2026-09-02', end: '2026-09-03' }],
  (s) => series[s],
  spy,
);
assert.deepEqual(hist.map((p) => p.date), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
near(hist[0].pct, 0);
assert.deepEqual(hist[0].added, ['A']);
near(hist[1].pct, 5); // A +10, B joins at 0
assert.deepEqual(hist[1].added, ['B']);
near(hist[2].pct, 10); // both +10; a chained return would read about +14.8
near(hist[3].pct, 15); // A +20, B frozen at its exit (+10), not the later 99
near(hist[3].benchPct, 0);
// Added on Saturday 09-05: joins at 0% on Friday 09-04's close, not on Monday.
const weekend = scoreHistory([{ symbol: 'A', start: '2026-09-05' }], (s) => series[s], spy);
assert.equal(weekend[0].date, '2026-09-04');
near(weekend[0].pct, 0);
assert.deepEqual(weekend[0].added, ['A']);
// A weekend-trading pick (crypto) added Saturday also sits at 0% on Friday's close.
const crypto = scoreHistory(
  [{ symbol: 'C', start: '2026-09-05' }],
  () => [{ date: '2026-09-04', close: 10 }, { date: '2026-09-05', close: 11 }, { date: '2026-09-07', close: 12 }],
  [...spy, { date: '2026-09-08', close: 500 }],
);
assert.equal(crypto[0].date, '2026-09-04');
near(crypto[0].pct, 0);
near(crypto[1].pct, (12 / 11 - 1) * 100); // 09-08 measured from Saturday's close, as the strip does
assert.equal(closeOnOrBefore(spy, '2026-09-06'), 500);
assert.equal(closeOnOrBefore(spy, '2026-08-01'), null);
assert.deepEqual(scoreHistory([], (s) => series[s], spy), []);

console.log('watchlist scorecard: all checks passed');
