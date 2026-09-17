/**
 * The 13F deadline calculator, checked against the deadlines our own ingested
 * filings actually landed on (five quarters, 15 funds, 79 filings). Feb 2026
 * is the case that matters: Feb 14 was a Saturday and Feb 16 was Presidents'
 * Day, so the deadline was Tuesday Feb 17 — and 11 funds filed that day.
 *
 * Run: npx tsx scripts/test-filing-schedule.ts
 */
import assert from 'node:assert/strict';
import {
  deadlineForPeriod,
  nextFilingDeadline,
  daysUntil,
  isInFilingWindow,
} from '../lib/institutions/filing-schedule';

// Observed deadlines, from the filed_date every fund converged on.
const OBSERVED: Array<[string, string]> = [
  ['2025-06-30', '2025-08-14'], // Thursday, no roll
  ['2025-09-30', '2025-11-14'], // Friday, no roll
  ['2025-12-31', '2026-02-17'], // Sat → Mon is Presidents' Day → Tue
  ['2026-03-31', '2026-05-15'], // Friday, no roll
  ['2026-06-30', '2026-08-14'], // Friday, no roll
];

for (const [period, expected] of OBSERVED) {
  assert.equal(deadlineForPeriod(period), expected, `deadline for ${period}`);
}

// Upcoming: Nov 14 2026 is a Saturday, so Q3 2026 is due Monday Nov 16.
assert.equal(deadlineForPeriod('2026-09-30'), '2026-11-16');
// Feb 14 2027 is a Sunday and Feb 15 is Presidents' Day → Tuesday Feb 16.
assert.equal(deadlineForPeriod('2026-12-31'), '2027-02-16');

// Picks the next quarter still ahead.
const mid = nextFilingDeadline(new Date('2026-09-17T12:00:00Z'));
assert.deepEqual(mid, { periodOfReport: '2026-09-30', deadline: '2026-11-16' });

// On the deadline day itself, that day is still the answer: funds file through
// the close of business, so a page must not jump to the next quarter at 00:00.
const onTheDay = nextFilingDeadline(new Date('2026-11-16T09:00:00Z'));
assert.equal(onTheDay.deadline, '2026-11-16');

// The day after, it rolls to the next quarter.
assert.equal(nextFilingDeadline(new Date('2026-11-17T09:00:00Z')).periodOfReport, '2026-12-31');

assert.equal(daysUntil('2026-11-16', new Date('2026-09-17T23:00:00Z')), 60);
assert.equal(daysUntil('2026-11-16', new Date('2026-11-16T09:00:00Z')), 0);
assert.equal(daysUntil('2026-01-01', new Date('2026-09-17T09:00:00Z')), 0, 'past dates floor at 0');

// The window: quiet two months out, open either side of the deadline.
assert.equal(isInFilingWindow(new Date('2026-09-17T12:00:00Z')), false, 'two months out');
assert.equal(isInFilingWindow(new Date('2026-11-09T12:00:00Z')), true, 'a week before');
assert.equal(isInFilingWindow(new Date('2026-11-16T12:00:00Z')), true, 'deadline day');
assert.equal(isInFilingWindow(new Date('2026-11-18T12:00:00Z')), true, 'stragglers after');
assert.equal(isInFilingWindow(new Date('2026-12-05T12:00:00Z')), false, 'well clear again');

console.log('13F filing schedule OK — matches all five observed quarters');
