/** npx tsx scripts/test-display-names.ts — asserts displayCompanyName on real catalogue names. */
import assert from 'node:assert/strict';
import { displayCompanyName } from '../lib/market-data/display-names';

const cases: Array<[string, string]> = [
  ['Eli Lilly and Company', 'Eli Lilly'],
  ['ELI LILLY & Co', 'ELI LILLY'],
  ['Merck & Co., Inc.', 'Merck'],
  ['JPMorgan Chase & Co.', 'JPMorgan Chase'],
  ['Meta Platforms Inc. Class A Common Stock', 'Meta Platforms'],
  ['ExxonMobil Holdings Corporation Common Stock', 'ExxonMobil'],
  ['The Goldman Sachs Group, Inc.', 'Goldman Sachs'],
  ['The Coca-Cola Company', 'Coca-Cola'],
  ['Johnson & Johnson', 'Johnson & Johnson'],
  ['S&P Global Inc.', 'S&P Global'],
  ['Accenture PLC Class A', 'Accenture'],
  ['Berkshire Hathaway Inc. Class B', 'Berkshire Hathaway'],
  ['International Business Machines Corporation', 'International Business Machines'],
  ['Oracle Corporation', 'Oracle'],
  ['Walmart Inc.', 'Walmart'],
  ['Inc.', 'Inc.'],
];
for (const [raw, want] of cases) assert.equal(displayCompanyName(raw), want, raw);
console.log(`ok, ${cases.length} cases`);
