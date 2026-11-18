/**
 * Earnings story helpers (lib/earnings/story.ts). Free, offline.
 *   npx tsx scripts/test-earnings-story.ts
 */
import assert from 'node:assert/strict';
import { storyReport, revenueGrowth, outlook } from '@/lib/earnings/story';
import type { EarningsCalendar } from '@/lib/finnhub/finnhub-client';

const row = (date: string, est: number | null, act: number | null, extra: Partial<EarningsCalendar> = {}): EarningsCalendar =>
  ({ date, epsEstimate: est, epsActual: act, hour: '', quarter: 3, year: 2027, revenueActual: null, revenueEstimate: null, symbol: 'NVDA', ...extra });
const history = [
  row('2025-11-19', 1.18, 1.24), row('2026-02-25', 1.45, 1.57), row('2026-05-20', 1.7, 1.87),
  row('2026-08-26', 2.09, 2.22), row('2026-11-17', 2.47, 2.68), row('2027-02-24', 2.8, null),
];

const s = storyReport(history, '2026-11-17', '2026-11-18');
assert.equal(s?.report.date, '2026-11-17');
assert.equal(Math.round(s!.usualSurprise!), 7, 'median of the 4 reports before (5.1, 6.2, 8.3, 10.0) is 7.25');
assert.equal(storyReport(history, '2026-11-18', '2026-11-18')?.report.date, '2026-11-17', 'a recap dated a day off is the same report');
assert.equal(storyReport(history, '2026-11-17', '2026-11-25'), null, 'older than STORY_DAYS is no story');
assert.equal(storyReport(history, '2026-11-17', '2026-11-16'), null, 'a recap from the future is no story');
assert.equal(storyReport([row('2026-11-17', 2.47, null)], '2026-11-17', '2026-11-18'), null, 'no actual yet is no story');
assert.equal(storyReport(history, undefined, '2026-11-18'), null);
assert.equal(storyReport(history.slice(2), '2026-11-17', '2026-11-18')?.usualSurprise, null, 'fewer than 3 earlier reports: no usual surprise');

assert.equal(Math.round(revenueGrowth({ revenue: 115.844e9, revenueYearAgo: 57.006e9, guidanceLow: null, guidanceHigh: null })!), 103);
assert.equal(revenueGrowth({ revenue: 115.8e9, revenueYearAgo: null, guidanceLow: null, guidanceHigh: null }), null);
const o = outlook({ revenue: 100, revenueYearAgo: null, guidanceLow: 110, guidanceHigh: 130 })!;
assert.equal(o.mid, 120);
assert.equal(Math.round(o.vsNow!), 20);
assert.equal(outlook({ revenue: 100, revenueYearAgo: null, guidanceLow: null, guidanceHigh: null }), null);

console.log('earnings story: all assertions passed');
