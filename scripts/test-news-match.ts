/**
 * Checks Home's headline-to-company matcher (lib/dashboard/news-match.ts).
 * Run: npx tsx scripts/test-news-match.ts
 */
import assert from 'node:assert/strict';
import { matchFollowed, type FollowedCompany } from '../lib/dashboard/news-match';

const followed: FollowedCompany[] = [
  { symbol: 'COST', name: 'Costco Wholesale Corp' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'T', name: 'AT&T Inc.' },
  { symbol: 'BTC/USD', name: 'Bitcoin' },
];
const sym = (h: string) => matchFollowed(h, followed)?.symbol ?? null;

assert.equal(sym('Should You Invest $1,000 in Costco Stock in October?'), 'COST');
assert.equal(sym('INTC, AMD, MU, SNDK, SOXX: Chips Slip Premarket'), 'AMD');
assert.equal(sym('Nvidia, Palantir, and Alphabet Are Sending Shockwaves'), 'NVDA');
assert.equal(sym('The Apple HomePad Pricing Vacuum'), 'AAPL');
assert.equal(sym('Bitcoin climbs past $120,000'), 'BTC/USD');
// "Advanced" alone is too generic to mean AMD, and a one-letter ticker never matches.
assert.equal(sym('Advanced packaging is the next bottleneck'), null);
assert.equal(sym('T-Mobile and Verizon cut prices'), null);
// Lowercase words are not tickers.
assert.equal(sym('Why amd shares are moving'), null);
// Not part of a longer word.
assert.equal(sym('Applebee owner reports earnings'), null);

console.log('ok - news-match');
