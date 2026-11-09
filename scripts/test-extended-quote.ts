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
const post = parseQuoteResponse({ ...base, extended_timestamp: 1790801700 }, 'CEG', true, new Date(1790801700_000));
assert.equal(post.c, 261);
assert.equal(post.pc, 264.58);
assert.equal(post.dp.toFixed(2), '-1.35');

// Pre-market next morning (8:00am ET Oct 1): `close` is already the previous close.
const pre = parseQuoteResponse({
  ...base, close: '253.97', previous_close: '264.58', extended_price: '258',
  extended_timestamp: 1790856000,
}, 'CEG', true, new Date(1790856000_000));
assert.equal(pre.pc, 253.97);
assert.equal(pre.dp.toFixed(2), '1.59');

// Without prepost the regular session stands.
const reg = parseQuoteResponse({ ...base, extended_timestamp: 1790801700 }, 'CEG', false, new Date(1790801700_000));
assert.equal(reg.c, 253.97);
assert.equal(reg.dp.toFixed(2), '-4.01');

// The morning after, before the stock's first pre-market trade, the latest
// extended print is still last night's. Real CEG numbers: Monday 10-05 closed
// 267.62, Tuesday 10-06 closed 300.40 (+12.25%), 293.99 at 7:57pm after hours.
const tue = {
  ...base, close: '300.39999', previous_close: '267.62', change: '32.78',
  percent_change: '12.24871', datetime: '2026-10-06', timestamp: 1791293400,
  extended_price: '293.99', extended_timestamp: 1791331020,
};
// Tuesday evening: the day is Tuesday, regular session and after hours together.
assert.equal(parseQuoteResponse(tue, 'CEG', true, new Date(1791331080_000)).dp.toFixed(2), '9.85');
// 2:00am Wednesday, before pre-market: still the last session.
assert.equal(parseQuoteResponse(tue, 'CEG', true, new Date(1791352800_000)).dp.toFixed(2), '9.85');
// 7:31am Wednesday, pre-market: today is Wednesday, measured from Tuesday's close.
const wed = parseQuoteResponse(tue, 'CEG', true, new Date(1791372660_000));
assert.equal(wed.pc.toFixed(2), '300.40');
assert.equal(wed.dp.toFixed(2), '-2.13');

// One minute after the bell /quote can still be the last session's row. Real
// NBIS numbers: Thursday 11-05 closed -14.94%, seen at 9:31am ET on Friday 11-06.
const nbis = {
  ...base, symbol: 'NBIS', close: '120.37', previous_close: '141.52', change: '-21.15',
  percent_change: '-14.94', datetime: '2026-11-05', is_market_open: true,
  extended_price: undefined, extended_change: undefined, extended_percent_change: undefined,
};
const friday931 = new Date('2026-11-06T14:31:35Z');
const atBell = parseQuoteResponse(nbis, 'NBIS', false, friday931);
assert.equal(atBell.priorSession, true);
// Flat today, measured from the last close, so the first live tick is right too.
assert.deepEqual([atBell.c, atBell.d, atBell.dp, atBell.pc], [120.37, 0, 0, 120.37]);
// 8:00am ET, no pre-market trade: flat for anyone asking about today...
const friday8 = new Date('2026-11-06T13:00:00Z');
assert.equal(parseQuoteResponse({ ...nbis, is_market_open: false }, 'NBIS', true, friday8).dp, 0);
// ...but a plain quote before the open is still the last session, as Discover expects.
assert.equal(parseQuoteResponse({ ...nbis, is_market_open: false }, 'NBIS', false, friday8).dp, -14.94);
// Once today's row arrives it is an ordinary quote.
assert.equal(parseQuoteResponse({ ...nbis, datetime: '2026-11-06' }, 'NBIS', false, friday931).priorSession, undefined);
// A Friday close read on Sunday is still the current session.
assert.equal(parseQuoteResponse({ ...nbis, datetime: '2026-11-06' }, 'NBIS', false, new Date('2026-11-08T15:00:00Z')).priorSession, undefined);
// A pre-market trade is today's move, whatever the row's date says (the Oct 1 case above).
assert.equal(pre.priorSession, undefined);
// A listing whose day runs ahead of New York, and crypto, are never flagged.
assert.equal(parseQuoteResponse({ ...nbis, datetime: '2026-11-07' }, 'NBIS', false, friday931).priorSession, undefined);
assert.equal(parseQuoteResponse({ ...nbis, currency: undefined, datetime: '2026-11-01' }, 'BTC/USD', false, friday931).priorSession, undefined);

console.log('extended quote: ok');
