/**
 * The day's change on an extended-hours quote is from the previous regular
 * close, before the open and after the close alike. Real CEG numbers from
 * 2026-09-30: closed 253.97 (-4.01% from 264.58), 261.00 after hours.
 *
 *   npx tsx scripts/test-extended-quote.ts
 */
import assert from 'node:assert/strict';
import { parseQuoteResponse } from '../lib/twelvedata/twelvedata-client';

const base = {
  symbol: 'CEG', currency: 'USD', high: '263.71', low: '247.24', open: '262.06',
  close: '253.97', previous_close: '264.58', change: '-10.61', percent_change: '-4.010124',
  datetime: '2026-09-30', timestamp: 1790775000, is_market_open: false,
  extended_price: '261', extended_change: '7.03', extended_percent_change: '2.76804',
};

// After the close: 4:55pm ET the same day.
const post = parseQuoteResponse({ ...base, extended_timestamp: 1790801700 }, 'CEG', true);
assert.equal(post.c, 261);
assert.equal(post.pc, 264.58);
assert.equal(post.dp.toFixed(2), '-1.35');

// Pre-market next morning (8:00am ET Oct 1): `close` is already the previous close.
const pre = parseQuoteResponse({
  ...base, close: '253.97', previous_close: '264.58', extended_price: '258',
  extended_timestamp: 1790856000,
}, 'CEG', true);
assert.equal(pre.pc, 253.97);
assert.equal(pre.dp.toFixed(2), '1.59');

// Without prepost the regular session stands.
const reg = parseQuoteResponse({ ...base, extended_timestamp: 1790801700 }, 'CEG', false);
assert.equal(reg.c, 253.97);
assert.equal(reg.dp.toFixed(2), '-4.01');

console.log('extended quote: ok');
