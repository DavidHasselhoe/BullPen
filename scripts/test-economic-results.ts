/**
 * Checks the two pieces of economic-results logic that can silently print a
 * wrong number: the Fed statement parser and the BLS/BEA change maths.
 *
 *   npx tsx scripts/test-economic-results.ts
 */
import assert from 'node:assert/strict';
import { parseFomcStatement, computeMetrics } from '../lib/market-data/economic-results';

// Real sentences from the 2026 statements (dissents use "preferred to" and must not match).
assert.deepEqual(
  parseFomcStatement('<p>The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent. Voting against: Hammack, who preferred to raise the target range for the federal funds rate by 1/4 percentage point</p>'),
  { lower: 3.75, upper: 4 },
);
assert.deepEqual(
  parseFomcStatement('The Committee decided to raise the target range for the federal funds rate by 1/4 percentage point to 3-3/4 to 4 percent.'),
  { lower: 3.75, upper: 4 },
);
assert.deepEqual(
  parseFomcStatement('the Committee decided to lower the target range for the federal funds rate by 1/2 percentage point to 4-3/4 to 5 percent'),
  { lower: 4.75, upper: 5 },
);
assert.equal(parseFomcStatement('Hammack preferred to raise the target range for the federal funds rate by 1/4 percent'), null);

// CPI: 12-month change on the unadjusted index, 1-month change on the adjusted one.
// Index levels from BLS's September 2024 release: 2.4% y/y, 0.2% m/m.
const s = {
  CPIAUCNS: new Map([['2023-09-01', 307.789], ['2024-08-01', 314.796], ['2024-09-01', 315.301]]),
  CPIAUCSL: new Map([['2024-08-01', 314.121], ['2024-09-01', 314.686]]),
  CPILFENS: new Map(),
  CPILFESL: new Map(),
};
const m = computeMetrics('cpi', s, '2024-09-01');
assert.equal(m.find((x) => x.key === 'cpi_yoy')?.actual, 2.4);
assert.equal(m.find((x) => x.key === 'cpi_mom')?.actual, 0.2);
assert.equal(m.find((x) => x.key === 'core_cpi_yoy'), undefined, 'missing data is left out, not zero');

// Jobs: payrolls change in thousands, previous month as revised.
const j = computeMetrics('jobs', {
  PAYEMS: new Map([['2024-07-01', 158_700], ['2024-08-01', 158_800], ['2024-09-01', 159_054]]),
  UNRATE: new Map([['2024-08-01', 4.2], ['2024-09-01', 4.1]]),
}, '2024-09-01');
assert.deepEqual(j.find((x) => x.key === 'payrolls'), { key: 'payrolls', actual: 254, previous: 100 });
assert.deepEqual(j.find((x) => x.key === 'unemployment'), { key: 'unemployment', actual: 4.1, previous: 4.2 });

console.log('economic-results: all checks passed');
