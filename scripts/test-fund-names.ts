/**
 * Fund holding names: SEC issuer fields and catalogue names both come out
 * readable. npm run test-fund-names
 */
import assert from 'node:assert/strict';
import { friendlyIssuerName } from '../lib/institutions/allocation';
const cases: [string, string][] = [
  ['BANK OF AMER CORP', 'Bank of America'],
  ['OCCIDENTAL PETE CORP', 'Occidental Pete'],
  ['AMERICAN EXPRESS CO', 'American Express'],
  ['Bank of America Corporation', 'Bank of America'],
  ['The Coca-Cola Company', 'Coca-Cola'],
  ['Alphabet Inc. Class A Common Stock', 'Alphabet'],
  ['NVIDIA Corporation', 'NVIDIA'],
  ['iShares Core S&P 500 ETF', 'iShares Core S&P 500 ETF'],
  ['Occidental Petroleum Corp.', 'Occidental Petroleum'],
  ['Chubb Limited', 'Chubb'],
  ['Apple Inc.', 'Apple'],
];
for (const [input, want] of cases) assert.equal(friendlyIssuerName(input), want, input);
console.log('names ok');
