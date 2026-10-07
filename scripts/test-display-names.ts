/** npx tsx scripts/test-display-names.ts — asserts displayCompanyName on real catalogue names. */
import assert from 'node:assert/strict';
import { displayCompanyName } from '../lib/market-data/company-name';

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
  // Share-class and depositary wording on foreign and dual-class listings (search_index, 2026-10-07).
  ['Nebius Group N.V. Class A Ordinary Shares', 'Nebius'],
  ['AstraZeneca PLC American Depositary Shares', 'AstraZeneca'],
  ['PDD Holdings Inc. American Depositary Receipt', 'PDD'],
  ['argenx SE American Depositary Receipt', 'argenx'],
  ['BioNTech SE American Depositary Share', 'BioNTech'],
  ['Genmab A/S American Depositary Shares', 'Genmab'],
  ['Embraer S.A. Sponsored American Depositary Receipt', 'Embraer'],
  ['Fresenius Medical Care AG - Depositary Receipt', 'Fresenius Medical Care'],
  ['Harmony Gold Mining Company Limited - Depositary Receipt (Common Stock)', 'Harmony Gold Mining'],
  ['CRH plc Ordinary Shares', 'CRH'],
  ['Brookfield Asset Management Ltd. Class A Limited Voting Shares', 'Brookfield Asset Management'],
  ['BRP Inc. Subordinate Voting Shares', 'BRP'],
  ['Brookfield Infrastructure Corporation Class A Shares', 'Brookfield Infrastructure'],
  ['Alamos Gold Inc. Class A Common Shares', 'Alamos Gold'],
  ['eToro Group Ltd. Class A Common Shares', 'eToro'],
  // "shares" inside a word, or a fund literally named "... Shares", stays.
  ['Huntington Bancshares Incorporated Common Stock', 'Huntington Bancshares'],
  ['First Financial Bankshares Inc.', 'First Financial Bankshares'],
  ['SPDR Gold Shares', 'SPDR Gold Shares'],
];
for (const [raw, want] of cases) assert.equal(displayCompanyName(raw), want, raw);
console.log(`ok, ${cases.length} cases`);
