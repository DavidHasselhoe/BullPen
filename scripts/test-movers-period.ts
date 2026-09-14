/**
 * Assert-based check for when the weekly and monthly movers post, and what
 * they measure. No framework.
 *   npm run test-movers-period
 */

import assert from 'node:assert/strict';
import { isLastTradingDayOf, periodChange, periodMoves } from '../lib/instagram/movers-period';

const none = new Set<string>();
// 2026 NYSE full-day closures that sit next to a period end.
const closed = new Set(['2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']);

// Weekly: Friday, or Thursday when Friday is closed.
assert.equal(isLastTradingDayOf('week', '2026-09-11', none), true, 'a normal Friday');
assert.equal(isLastTradingDayOf('week', '2026-09-10', none), false, 'Thursday before a trading Friday');
assert.equal(isLastTradingDayOf('week', '2026-07-02', closed), true, 'Thursday before the Jul 3 closure');
assert.equal(isLastTradingDayOf('week', '2026-07-03', closed), false, 'a closure never posts');
assert.equal(isLastTradingDayOf('week', '2026-09-12', none), false, 'Saturday');

// Monthly: whatever weekday ends the month, month length included.
assert.equal(isLastTradingDayOf('month', '2026-02-27', none), true, 'Feb 2026 ends on Sat the 28th, so Fri the 27th');
assert.equal(isLastTradingDayOf('month', '2026-02-26', none), false);
assert.equal(isLastTradingDayOf('month', '2026-08-31', none), true, 'Aug 2026 ends on a Monday');
assert.equal(isLastTradingDayOf('month', '2026-09-30', none), true, 'Sep 2026 ends on a Wednesday');
assert.equal(isLastTradingDayOf('month', '2026-04-30', none), true, 'Apr 30 2026 is a Thursday');
assert.equal(isLastTradingDayOf('week', '2026-04-30', none), false, 'but its week runs on into May');
assert.equal(isLastTradingDayOf('month', '2026-12-31', closed), true, 'Dec 31 2026 is a Thursday');
assert.equal(isLastTradingDayOf('month', '2028-02-29', none), true, 'leap year: Feb 29 2028 is a Tuesday');

// Weekly change: last close before Monday to the period's final close.
const closes = [
  { date: '2026-09-03', close: 90 },
  { date: '2026-09-04', close: 100 }, // prior Friday, the weekly base (Mon Sep 7 was closed)
  { date: '2026-09-08', close: 104 },
  { date: '2026-09-11', close: 110 },
];
assert.equal(Math.round(periodChange(closes, 'week', '2026-09-11')!.changePercent), 10);
assert.equal(periodChange(closes, 'week', '2026-09-11')!.price, 110);

// Monthly change: base is the last close of the previous month.
assert.equal(periodChange(closes, 'month', '2026-09-11'), null, 'no August close, no monthly change');
const withAugust = [{ date: '2026-08-31', close: 88 }, ...closes];
assert.equal(Math.round(periodChange(withAugust, 'month', '2026-09-11')!.changePercent), 25);

// No bar for the period's last day means no ranking on a stale price.
assert.equal(periodChange(closes, 'week', '2026-09-10'), null);

// periodMoves drops symbols without both ends, e.g. a mid-period listing.
const moves = periodMoves(
  new Map([['AAA', withAugust], ['NEW', [{ date: '2026-09-11', close: 5 }]]]),
  'month',
  '2026-09-11'
);
assert.deepEqual(moves.map((m) => m.symbol), ['AAA']);

console.log('movers period: all assertions passed');
