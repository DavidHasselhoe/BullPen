/**
 * Assert-based check for dropMisdatedEarnings. No framework.
 *   npm run test-earnings-misdated
 *
 * Pinned against the live case that found it 2026-09-24: TwelveData had JPM
 * on Oct 12 and BAC on Oct 13, Nasdaq had JPM on Oct 13 and BAC on Oct 14,
 * and the calendar showed both of each.
 */

import assert from 'node:assert/strict';
import { dropMisdatedEarnings } from '../lib/market-data/calendar-days';
import type { EarningsCalendarItem } from '../lib/twelvedata/twelvedata-client';

const td = (symbol: string, date: string, time = 'Pre Market'): EarningsCalendarItem => ({ symbol, date, time, eps_estimate: null });
const nq = (symbol: string, date: string, legacy = false): EarningsCalendarItem =>
  legacy ? { symbol, date, time: 'BMO', eps_estimate: 1 } : { symbol, date, time: 'Pre Market', eps_estimate: 1, nasdaq_confirmed: true };

const byDate = new Map<string, EarningsCalendarItem[]>([
  ['2026-10-12', [td('JPM', '2026-10-12'), td('ORCL', '2026-10-12')]],
  // Legacy cached Nasdaq row (no flag yet), recognised by its BMO timing.
  ['2026-10-13', [nq('JPM', '2026-10-13', true), nq('GS', '2026-10-13'), td('BAC', '2026-10-13', 'After Hours')]],
  ['2026-10-14', [nq('BAC', '2026-10-14'), td('WFC', '2026-10-14'), nq('WFC', '2026-10-14')]],
  // Same symbol a whole quarter later is a different report, not a duplicate.
  ['2026-10-30', [td('GS', '2026-10-30')]],
]);

dropMisdatedEarnings(byDate);
const syms = (d: string) => byDate.get(d)!.map((r) => r.symbol).sort();

assert.deepEqual(syms('2026-10-12'), ['ORCL'], 'TD-only JPM on Oct 12 dropped, unconfirmed ORCL with no rival date kept');
assert.deepEqual(syms('2026-10-13'), ['GS', 'JPM'], 'TD-only BAC on Oct 13 dropped');
assert.deepEqual(syms('2026-10-14'), ['BAC', 'WFC', 'WFC'], 'same-day rows are not this pass\'s concern');
assert.deepEqual(syms('2026-10-30'), ['GS'], 'outside the window: kept');

console.log('misdated earnings checks passed');
