/**
 * Self-check for the market movers definition in lib/market-data/index-movers.ts.
 * Pure ranking only, no API calls: npm run test-index-movers
 */

import assert from 'node:assert/strict';
import { rankMovers } from '../lib/market-data/index-movers';

// 2026-09-29 15:00 New York, and a day earlier.
const today = Date.UTC(2026, 8, 29, 19) / 1000;
const yesterday = today - 86_400;

const q = (dp: number, t = today, c = 100, pc = 100) => ({ c, pc, dp, t });
const quotes = new Map([
  ['AAA', q(4.2)],
  ['BBB', q(9.9)],
  ['CCC', q(-3.1)],
  ['DDD', q(-7.5)],
  ['EEE', q(0.05)],
  ['OLD', q(40, yesterday)], // halted or stale: yesterday's % change must not rank today
  ['BAD', q(12, today, 0)], // no price
  ['NAN', q(Number.NaN)],
]);

const r = rankMovers(quotes, 3);
assert.equal(r.asOf, '2026-09-29');
assert.deepEqual(r.gainers, ['BBB', 'AAA', 'EEE']);
assert.deepEqual(r.losers, ['DDD', 'CCC']); // shorter, never padded with a gainer
assert.ok(!r.rows.some((x) => ['OLD', 'BAD', 'NAN'].includes(x.symbol)));
assert.equal(r.rows.length, 5);

// A late-evening New York quote still belongs to that New York day, not the UTC one.
const lateNY = Date.UTC(2026, 8, 30, 3, 30) / 1000; // 23:30 on the 29th in New York
assert.equal(rankMovers(new Map([['LATE', q(1, lateNY)]])).asOf, '2026-09-29');

console.log('index movers: all checks passed');
