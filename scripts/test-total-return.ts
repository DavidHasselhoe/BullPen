/**
 * Self-check for lib/holdings/total-return.ts: npm run test-total-return
 */

import assert from 'node:assert/strict';
import { totalReturn } from '../lib/holdings/total-return';

// Two open positions: $1,200 worth that cost $1,000, and $500 that cost $600.
const open = [
  { marketValue: 1200, unrealizedPL: 200 },
  { marketValue: 500, unrealizedPL: -100 },
  { marketValue: undefined, unrealizedPL: undefined }, // unpriced: ignored, not counted as zero
];
// One sale: 5 shares bought at $40, sold at $50.
const sales = [{ realized_pl: 50, avg_cost_basis: 40, quantity_sold: 5, trading_currency: 'USD' }];

const r = totalReturn(open, sales, 1);
assert.equal(r.unrealized, 100);
assert.equal(r.realized, 50);
assert.equal(r.total, 150);
assert.equal(r.invested, 1000 + 600 + 200);
assert.equal(r.pct, (150 / 1800) * 100);

// Sales convert at the given rate, the way the chart converts its line.
const nok = totalReturn([], sales, 10);
assert.equal(nok.realized, 500);
assert.equal(nok.invested, 2000);

// A EUR listing's sale is in EUR: to USD first (1 EUR = 1.25 USD here), then to NOK.
const eurSale = [{ realized_pl: 50, avg_cost_basis: 40, quantity_sold: 5, trading_currency: 'EUR' }];
const rates = { base: 'NOK', date: '', rates: { USD: 0.1, EUR: 0.08 } }; // 1 NOK = 0.1 USD = 0.08 EUR
const eur = totalReturn([], eurSale, 10, rates);
assert.equal(Math.round(eur.realized), 625); // 50 EUR = 62.5 USD = 625 NOK
assert.equal(Math.round(eur.invested), 2500);
// Without rates it falls back to the old reading (EUR as USD) rather than failing.
assert.equal(totalReturn([], eurSale, 10).realized, 500);

// Nothing invested: no division by zero.
assert.equal(totalReturn([], [], 1).pct, 0);

console.log('total return: all checks passed');
