/**
 * US market holidays and the session date, against the hand-verified
 * `exchange_holidays` rows for NYSE (2026-2028). Free, no API calls.
 *
 *   npm run test-trading-day
 */
import assert from 'node:assert/strict';
import { usMarketHolidays, sessionDateET } from '../lib/market-data/trading-day';

// SELECT date FROM exchange_holidays WHERE exchange_code='NYSE' AND type='closed', 2026-10-07.
const VERIFIED = '2026-01-01,2026-01-19,2026-02-16,2026-04-03,2026-05-25,2026-06-19,2026-07-03,2026-09-07,2026-11-26,2026-12-25,2027-01-01,2027-01-18,2027-02-15,2027-03-26,2027-05-31,2027-06-18,2027-07-05,2027-09-06,2027-11-25,2027-12-24,2028-01-17,2028-02-21,2028-04-14,2028-05-29,2028-06-19,2028-07-04,2028-09-04,2028-11-23,2028-12-25';

const computed = [2026, 2027, 2028].flatMap((y) => [...usMarketHolidays(y)]).sort();
assert.deepEqual(computed, VERIFIED.split(','));

// An ET wall-clock time, as a Date (EDT is UTC-4 for these dates).
const et = (s: string) => new Date(`${s}-04:00`);

// Labor Day 2026 (Mon Sep 7): still Friday's session, all day.
assert.equal(sessionDateET(et('2026-09-07T12:00:00')), '2026-09-04');
// Tuesday after: a new session from 4:00 ET, Friday's before it.
assert.equal(sessionDateET(et('2026-09-08T03:59:00')), '2026-09-04');
assert.equal(sessionDateET(et('2026-09-08T04:00:00')), '2026-09-08');
// Good Friday 2027 (Mar 26) rolls back to Thursday.
assert.equal(sessionDateET(et('2027-03-26T10:00:00')), '2027-03-25');
// An ordinary weekday and a weekend, unchanged.
assert.equal(sessionDateET(et('2026-10-07T07:31:00')), '2026-10-07');
assert.equal(sessionDateET(et('2026-10-11T12:00:00')), '2026-10-09');
// Crypto trades through holidays.
assert.equal(sessionDateET(et('2026-09-07T12:00:00'), true), '2026-09-07');

console.log('trading day: ok');
