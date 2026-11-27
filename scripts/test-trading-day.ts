/**
 * US market holidays and the session date, against the hand-verified
 * `exchange_holidays` rows for NYSE (2026-2028). Free, no API calls.
 *
 *   npm run test-trading-day
 */
import assert from 'node:assert/strict';
import { usMarketHolidays, sessionDateET, isPreMarketET, secondsUntilNextOpenET, tradingMinutesET } from '../lib/market-data/trading-day';
import { getSessionState } from '../hooks/use-trading-session';
import { calculateMarketStatus } from '../lib/market/market-status';
import type { Exchange, ExchangeHoliday } from '../lib/types/database';

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

// Pre-market window and next regular open (movers cache).
const at = (iso: string) => new Date(iso);
// Mon 2026-10-12 08:00 EDT (12:00Z) is pre-market; open in 90 minutes.
assert.equal(isPreMarketET(at('2026-10-12T12:00:00Z')), true);
assert.equal(secondsUntilNextOpenET(at('2026-10-12T12:00:00Z')), 90 * 60);
// Mon 10:00 EDT is regular, not pre-market.
assert.equal(isPreMarketET(at('2026-10-12T14:00:00Z')), false);
// Fri 2026-10-09 17:00 EDT (21:00Z): next open Mon 9:30 EDT = 64.5h.
assert.equal(secondsUntilNextOpenET(at('2026-10-09T21:00:00Z')), 64.5 * 3600);
// Wed 2026-11-25 17:00 EST (22:00Z): Thanksgiving Thu is skipped, open Fri 9:30 EST = 40.5h.
assert.equal(secondsUntilNextOpenET(at('2026-11-25T22:00:00Z')), 40.5 * 3600);
// Sat is never pre-market; DST: Fri 2026-10-30 17:00 EDT to Mon 2026-11-02 9:30 EST = 65.5h.
assert.equal(isPreMarketET(at('2026-10-10T12:00:00Z')), false);
assert.equal(secondsUntilNextOpenET(at('2026-10-30T21:00:00Z')), 65.5 * 3600);

// Session clock for the alert crons: 9:35 EST on a Monday, null on Thanksgiving and a Saturday.
assert.equal(tradingMinutesET(at('2026-11-09T14:35:00Z')), 575);
assert.equal(tradingMinutesET(at('2026-11-26T15:00:00Z')), null);
assert.equal(tradingMinutesET(at('2026-11-07T15:00:00Z')), null);
// Summer: 9:35 EDT is 13:35Z.
assert.equal(tradingMinutesET(at('2026-07-15T13:35:00Z')), 575);

// Client session state: Thanksgiving at 11:00 EST is closed, not 'regular'.
assert.equal(getSessionState(at('2026-11-26T16:00:00Z')), 'closed');
assert.equal(getSessionState(at('2026-11-25T16:00:00Z')), 'regular');

// Market-status next open skips holidays (the Home "opens in" line).
const NYSE = { code: 'NYSE', name: 'NYSE', country: 'US', timezone: 'America/New_York', open_time: '09:30:00', close_time: '16:00:00', midday_close_time: null, midday_open_time: null } as unknown as Exchange;
const HOLIDAYS = [
  { id: '1', exchange_code: 'NYSE', date: '2026-11-26', type: 'closed', early_close_time: null, description: 'Thanksgiving' },
  { id: '2', exchange_code: 'NYSE', date: '2026-11-27', type: 'early_close', early_close_time: '13:00:00', description: 'Day after Thanksgiving' },
  { id: '3', exchange_code: 'NYSE', date: '2026-09-07', type: 'closed', early_close_time: null, description: 'Labor Day' },
] as unknown as ExchangeHoliday[];
const fri930 = at('2026-11-27T14:30:00Z');
// Wed evening: opens Fri, and says why.
let s = calculateMarketStatus(NYSE, HOLIDAYS, at('2026-11-25T22:00:00Z'));
assert.equal(s.nextOpenTime?.toISOString(), fri930.toISOString());
assert.equal(s.holidayName, 'Thanksgiving');
// On the holiday itself.
s = calculateMarketStatus(NYSE, HOLIDAYS, at('2026-11-26T16:00:00Z'));
assert.equal(s.isOpen, false);
assert.equal(s.isHoliday, true);
assert.equal(s.holidayName, 'Thanksgiving');
assert.equal(s.nextOpenTime?.toISOString(), fri930.toISOString());
// Half day: open, named, closes at 13:00 EST.
s = calculateMarketStatus(NYSE, HOLIDAYS, at('2026-11-27T16:00:00Z'));
assert.equal(s.isOpen, true);
assert.equal(s.isEarlyClose, true);
assert.equal(s.holidayName, 'Day after Thanksgiving');
assert.equal(s.nextCloseTime?.toISOString(), '2026-11-27T18:00:00.000Z');
// Half day before the open: not "closed for" anything, just opening soon.
s = calculateMarketStatus(NYSE, HOLIDAYS, at('2026-11-27T12:40:00Z'));
assert.equal(s.isOpen, false);
assert.equal(s.holidayName, null);
assert.equal(s.nextOpenTime?.toISOString(), fri930.toISOString());
// Sunday before Labor Day: opens Tuesday 9:30 EDT.
s = calculateMarketStatus(NYSE, HOLIDAYS, at('2026-09-06T16:00:00Z'));
assert.equal(s.nextOpenTime?.toISOString(), '2026-09-08T13:30:00.000Z');
assert.equal(s.holidayName, 'Labor Day');
// A plain weeknight: no holiday name, opens tomorrow.
s = calculateMarketStatus(NYSE, HOLIDAYS, at('2026-11-24T22:00:00Z'));
assert.equal(s.holidayName, null);
assert.equal(s.nextOpenTime?.toISOString(), '2026-11-25T14:30:00.000Z');
// Before the open on a trading day: today's open.
s = calculateMarketStatus(NYSE, HOLIDAYS, at('2026-11-24T12:00:00Z'));
assert.equal(s.nextOpenTime?.toISOString(), '2026-11-24T14:30:00.000Z');

console.log('trading day: ok');
