/**
 * Self-check for the market movers definition in lib/market-data/index-movers.ts.
 * Pure ranking only, no API calls: npm run test-index-movers
 */

import assert from 'node:assert/strict';
import { moversTtlSeconds, rankMovers, rankPremarket } from '../lib/market-data/index-movers';

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

// Pre-market: only names that traded since 4:00 today count. 2026-10-12 08:15 New York.
const preNow = Date.UTC(2026, 9, 12, 12, 15) / 1000;
const lastNight = Date.UTC(2026, 9, 9, 23, 0) / 1000; // Friday 19:00 New York, after hours
const pq = (dp: number, et?: number, c = 100, pc = 100) => ({ c, pc, dp, et });
const pre = rankPremarket(new Map([
  ['UP', pq(6.1, preNow)],
  ['DOWN', pq(-4.4, preNow)],
  ['SMALL', pq(0.3, preNow)],
  ['FRIDAY', pq(9.0, lastNight)], // has not traded this morning: last night's print is not a pre-market move
  ['REGULAR', pq(5.0)], // no extended print at all
]), '2026-10-12', 5);
assert.deepEqual(pre.gainers, ['UP', 'SMALL']);
assert.deepEqual(pre.losers, ['DOWN']);
assert.equal(pre.traded.length, 3);
// Freshness. At the open a list can still be yesterday's: retry each minute,
// but never on a holiday or past the first half hour (each retry is ~515 credits).
const ttl = (o: Partial<Parameters<typeof moversTtlSeconds>[0]>) =>
  moversTtlSeconds({ session: 'regular', etHHMM: 931, tradingDay: true, listSession: 'last', untilOpen: 70000, ...o });
assert.equal(ttl({}), 60, 'open, still yesterday: ask again in a minute');
assert.equal(ttl({ listSession: 'live' }), 300, 'open, today in: the usual 5 minutes');
assert.equal(ttl({ tradingDay: false }), 300, 'holiday: never the per-minute retry');
assert.equal(ttl({ etHHMM: 1000 }), 300, 'after 10:00: back to 5 minutes, whatever the list');
assert.equal(ttl({ session: 'extended', etHHMM: 1605, listSession: 'live' }), 300, 'closing print settling');
assert.equal(ttl({ session: 'closed', etHHMM: 2200, listSession: 'live', untilOpen: 41000 }), 41000, 'closed: until the next open');
assert.equal(ttl({ session: 'closed', untilOpen: 9e6 }), 4 * 24 * 60 * 60, 'capped at four days');

console.log('index movers: all checks passed');
