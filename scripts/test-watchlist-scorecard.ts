/**
 * Checks the watchlist scorecard arithmetic (lib/watchlist/scorecard.ts).
 * Run: npx tsx scripts/test-watchlist-scorecard.ts
 */
import assert from 'node:assert/strict';
import { listScore, pickReturn, todaySummary, type SinceAddedEntry } from '../lib/watchlist/scorecard';

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

console.log('watchlist scorecard: all checks passed');
