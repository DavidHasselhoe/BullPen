/**
 * Assert-based check for the risk analysis prompt. No framework.
 *   npm run test-risk-analysis-prompt
 *
 * Pins the two things that matter: each holding line carries the reported
 * data we hold (so the model scores from data, not memory), and the first run
 * after an ungrounded analysis isn't anchored to that analysis's guessed score.
 */

import assert from 'node:assert/strict';
import {
  buildHistoryContext,
  buildPrompt,
  describeFundamentals,
  NO_FUNDAMENTALS,
  type HoldingFundamentals,
  type HoldingInput,
} from '../lib/ai/risk-analysis-prompt';

const apple: HoldingFundamentals = {
  sector: 'Technology',
  industry: 'Consumer Electronics',
  marketCap: 3_120_000_000_000,
  beta: 1.214,
  healthScore: 74,
  healthGrade: 'B',
  categories: [
    { name: 'Profitability', score: 26, max: 30 },
    { name: 'Financial Strength', score: 9, max: 25 },
    { name: 'Valuation', score: null, max: 20 },
  ],
};

// Full data: sector, cap, beta, grade and only the categories that have a score.
const line = describeFundamentals(apple);
assert.equal(
  line,
  'sector: Technology / Consumer Electronics, market cap: $3.1T, beta: 1.21, health: B 74/100 (Profitability 26/30, Financial Strength 9/25)'
);
assert.ok(!line.includes('Valuation'), 'a category with no score is left out, not shown as 0');
assert.equal(describeFundamentals(undefined), NO_FUNDAMENTALS);
assert.equal(
  describeFundamentals({ ...apple, sector: null, industry: null, marketCap: null, beta: null, healthScore: null, healthGrade: null }),
  NO_FUNDAMENTALS,
  'a row with nothing usable reads the same as no row'
);
assert.ok(describeFundamentals({ ...apple, marketCap: 48_500_000_000 }).includes('market cap: $48.5B'));

// Prompt: data after "|" per holding, looked up by upper-cased symbol.
const holdings: HoldingInput[] = [
  { symbol: 'aapl', company_name: 'Apple', allocation: 60, marketValue: 6000, quantity: 20 },
  { symbol: 'BTC/USD', company_name: 'Bitcoin', allocation: 40, marketValue: 4000, quantity: 0.05 },
];
const fundamentals = new Map([['AAPL', apple]]);
const prompt = buildPrompt(holdings, 'USD', fundamentals, { score: 74, grade: 'B', coveredCount: 1, totalCount: 2 });
assert.ok(prompt.includes('aapl (Apple), allocation: 60.0%, value: $6000, shares: 20 | sector: Technology'));
assert.ok(prompt.includes(`BTC/USD (Bitcoin), allocation: 40.0%, value: $4000, shares: 0.05 | ${NO_FUNDAMENTALS}`));
assert.ok(prompt.includes('over the 1 of 2 holdings with data, higher is better): B 74/100.'));
assert.ok(!buildPrompt(holdings, 'USD', fundamentals, null).includes('business quality'), 'no quality line without a score');
assert.ok(buildPrompt(holdings, 'NOK', fundamentals, null).includes('All portfolio values are in NOK. Market caps are in USD.'));

// History: an ungrounded prior score is not an anchor.
const snapshot = [{ symbol: 'aapl', quantity: 20 }, { symbol: 'BTC/USD', quantity: 0.05 }];
const anchored = buildHistoryContext({ score: 55, level: 'Elevated', snapshot, grounded: true }, holdings);
assert.ok(anchored.includes('Keep the overall score and risk level the same'));
const regrounded = buildHistoryContext({ score: 55, level: 'Elevated', snapshot, grounded: false }, holdings);
assert.ok(!regrounded.includes('Keep the overall score'), 'a guessed score must not be locked in');
assert.ok(regrounded.includes('now uses reported fundamentals'));
const changed = buildHistoryContext(
  { score: 55, level: 'Elevated', snapshot: [{ symbol: 'aapl', quantity: 10 }], grounded: false },
  holdings
);
assert.ok(changed.includes('added: BTC/USD') && changed.includes('resized: aapl (10 -> 20 shares)'));
assert.equal(buildHistoryContext(null, holdings), '');

console.log('risk analysis prompt: all assertions passed');
