/**
 * Checks the deep dive's story logic: Q4 derived from the 10-K, a broken run
 * of quarters refused, and bad news ranked ahead of the beat.
 *
 * npm run test-deep-dive-story
 */
import assert from 'node:assert/strict';
import { quarterlySeries, growthBefore } from '../lib/edgar/revenue-history';
import { buildStoryPoints, typicalSurprise } from '../lib/instagram/content/deep-dive-story';
import type { EarningsDeepDiveData } from '../lib/instagram/content/schema';

const q = (start: string, end: string, val: number, filed = '2026-01-01') => ({ start, end, val, filed });

// Calendar-year company, 2024-2025, Q4 only inside the 10-K's full year.
const facts = [
  q('2024-01-01', '2024-03-31', 100), q('2024-04-01', '2024-06-30', 100), q('2024-07-01', '2024-09-30', 100),
  q('2024-01-01', '2024-12-31', 400),
  q('2025-01-01', '2025-03-31', 110), q('2025-04-01', '2025-06-30', 120), q('2025-07-01', '2025-09-30', 130),
  q('2025-01-01', '2025-12-31', 500),
  q('2026-01-01', '2026-03-31', 150), q('2026-04-01', '2026-06-30', 168),
  // A restated comparative filed later wins over the original.
  q('2025-04-01', '2025-06-30', 120, '2025-08-01'),
];
const series = quarterlySeries(facts);
assert.equal(series.get('2024-12-31'), 100, 'Q4 2024 = full year minus three quarters');
assert.equal(series.get('2025-12-31'), 140, 'Q4 2025 = 500 - 110 - 120 - 130');

// Reporting Q3 2026 on Oct 29: the history is Q3 2025 .. Q2 2026.
const h = growthBefore(series, '2026-10-29', 4);
assert.ok(h, 'history found');
assert.deepEqual(h.map((x) => x.periodEnd), ['2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30']);
assert.deepEqual(h.map((x) => Math.round(x.yoyPercent)), [30, 40, 36, 40]);

// The quarter right before the report is missing: refuse rather than show a stale run.
assert.equal(growthBefore(series, '2027-01-29', 4), null, 'stale history refused');

const base = {
  epsStatus: 'beat', revenueStatus: 'beat', epsSurprisePercent: 11, revenueYoyGrowthPercent: 26,
  guidanceRevenueLow: 73e9, guidanceRevenueHigh: 76e9, guidanceConsensus: 73.6e9,
  secondaryMetricLabel: 'Free Cash Flow', secondaryMetricValue: -2.12e9,
  capexActual: 34.9e9, capexPriorYear: 19.4e9, revenueActual: 64.6e9,
  revenueGrowthHistory: [{ periodEnd: '2026-06-30', yoyPercent: 22 }],
  epsSurpriseHistory: [12, 15, 9],
} as unknown as EarningsDeepDiveData;

const points = buildStoryPoints(base);
assert.match(points[0], /Capital spending rose 80% .*more than the cash/, 'capex outrunning cash leads');
assert.ok(points.indexOf(points.find((p) => /sped up/.test(p))!) > 0, 'good news after bad');

// AVGO: guidance midpoint exactly on consensus is in line, never "above".
const avgo = buildStoryPoints({ ...base, capexActual: null, guidanceRevenueLow: 34.8e9, guidanceRevenueHigh: 34.8e9, guidanceConsensus: 34.8e9 } as EarningsDeepDiveData);
assert.ok(!avgo.some((p) => /outlook came in (above|below)/.test(p)), 'in-line guidance is not called above');

// A small beat from a company that usually beats big is bad news.
const small = buildStoryPoints({ ...base, capexActual: null, epsSurprisePercent: 3, epsSurpriseHistory: [20, 25, 30] } as EarningsDeepDiveData);
assert.ok(small.some((p) => /smaller than its usual 25% beat/.test(p)));

// MRVL: capex tripled, but $127M on $2.7B of revenue is not the story.
const trivial = buildStoryPoints({ ...base, capexActual: 127e6, capexPriorYear: 47e6, revenueActual: 2.74e9 } as EarningsDeepDiveData);
assert.ok(!trivial.some((p) => /Capital spending/.test(p)), 'immaterial capex ignored');

// MRVL: a softer next-quarter gross margin is bad news even on a beat.
const softer = buildStoryPoints({ ...base, capexActual: null, grossMarginActualPercent: 59.4, grossMarginGuidancePercent: 58.5 } as EarningsDeepDiveData);
assert.match(softer[0], /gross margin to slip to 58.5% from 59.4%/);

// META: -13%, +9%, +8% is a typical +8% beat (median), not a "usual 1%" (mean).
assert.equal(typicalSurprise([-13, 8.9, 8.2]), 8.2);

console.log('deep dive story: all checks passed');
