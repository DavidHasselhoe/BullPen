/**
 * Checks on the congressional-trade normalisation, which is where the real
 * bugs live: the vendor's unresolved-ticker sentinel, and the rule that a
 * filed amount bracket is never collapsed into a single number.
 *
 *   npm run test-congress-ingest
 *
 * No network, no DB, no API key — pure mapping logic.
 */

import assert from 'node:assert/strict';
import { normalizeSymbol, buildRows, isNameResolvable, dropVendorDuplicates } from '../lib/congress/ingest-trades';
import { tradeDirection, isFiledLate, formatAmountRange, moveBeforeDisclosure } from '../lib/congress/types';

// Both ends always survive. Nothing here may ever average them into one
// figure: a filing discloses a bracket, so a midpoint is a number nobody filed.
assert.equal(formatAmountRange(500001, 1000000, 'x'), '$500K - $1M');
assert.equal(formatAmountRange(15001, 50000, 'x'), '$15K - $50K');
assert.equal(formatAmountRange(1000001, 5000000, 'x'), '$1M - $5M');

// The vendor drops amount_high on some rows while still stating it in the
// filed string (31 of the first 200 stored trades). Without this fallback
// those rendered raw and un-compacted beside their formatted neighbours.
assert.equal(
  formatAmountRange(1000001, null, '$1,000,001 - $5,000,000'),
  '$1M - $5M',
  'a missing numeric bound is recovered from the filed string',
);
assert.equal(formatAmountRange(null, null, '$250,001 - $500,000'), '$250K - $500K');

// A genuinely open-ended top bracket keeps its openness rather than inventing
// a ceiling.
assert.equal(formatAmountRange(50000001, null, '$50,000,001 +'), '$50M+');

// Unparseable input degrades to the filed string rather than to nothing.
assert.equal(formatAmountRange(null, null, 'Undisclosed'), 'Undisclosed');

// The vendor uses four words for two directions and mixes them within one
// member. Matching only 'buy'/'sell' made the Sells filter read 0 for a
// member with 33 disclosed sales, so every spelling seen in live data is
// pinned here.
assert.equal(tradeDirection('Buy'), 'buy');
assert.equal(tradeDirection('Purchase'), 'buy');
assert.equal(tradeDirection('Sell'), 'sell');
assert.equal(tradeDirection('Sale'), 'sell');
assert.equal(tradeDirection('sale (partial)'), 'sell', 'qualified sales still count as sells');
assert.equal(tradeDirection('Sale (Full)'), 'sell');
assert.equal(tradeDirection('Exchange'), 'other');
assert.equal(tradeDirection('Unknown'), 'other');
assert.equal(tradeDirection('  BUY  '), 'buy', 'padding and case must not matter');

// 45 days is the STOCK Act deadline, so it is the boundary that decides
// whether a row is flagged late.
assert.equal(isFiledLate(45), false, '45 days is on time');
assert.equal(isFiledLate(46), true);
assert.equal(isFiledLate(null), false, 'unknown lag is not an accusation');

// The vendor returns the literal string 'N/A' for an asset it could not
// resolve. Storing that verbatim renders a fake ticker on a real
// politician's row, which is the single worst output this feature has.
assert.equal(normalizeSymbol('N/A'), null, "'N/A' must not become a ticker");
assert.equal(normalizeSymbol('n/a'), null, 'lowercase sentinel must be caught');
assert.equal(normalizeSymbol('  N/A  '), null, 'padded sentinel must be caught');
assert.equal(normalizeSymbol(''), null);
assert.equal(normalizeSymbol(null), null);
assert.equal(normalizeSymbol('be'), 'BE', 'real tickers uppercase');
assert.equal(normalizeSymbol(' nvda '), 'NVDA');

const PID = '00000000-0000-0000-0000-000000000000';

const good = {
  id: 1,
  ticker: 'BE',
  trade_type: 'Buy',
  asset_type: 'Stock',
  asset_description: 'Bloom Energy Corporation Class A',
  amount_range: '$500,001 - $1,000,000',
  amount_low: 500001,
  amount_high: 1000000,
  transaction_date: '2026-07-28',
  disclosure_date: '2026-08-21',
  days_to_disclose: 24,
  sector: 'Industrials',
  industry: 'Electrical Equipment',
  source: 'house.gov',
};

const rows = buildRows(
  [
    good,
    { ...good, id: 2, ticker: 'N/A', asset_description: 'U.S. Treasury Bill', asset_type: 'Bond' },
    { ...good, id: 3, transaction_date: null }, // unusable: no trade date
    { ...good, id: 4, amount_range: null }, // unusable: no filed bracket
    { ...good, id: 5, trade_type: null }, // unusable: no direction
  ],
  PID,
);

assert.equal(rows.length, 2, 'rows missing date/bracket/direction must be dropped');
assert.deepEqual(
  rows.map((r) => r.dc_trade_id),
  [1, 2],
  'the two usable rows are kept, in order',
);

// A bond with no ticker is still a real disclosure — kept, with symbol NULL,
// not discarded and not given a placeholder ticker.
assert.equal(rows[1].symbol, null);
assert.equal(rows[1].asset_description, 'U.S. Treasury Bill');

// The bracket survives as a bracket. If anyone ever adds an "estimated
// value" midpoint field, this is the assertion that should stop them.
assert.equal(rows[0].amount_low, 500001);
assert.equal(rows[0].amount_high, 1000000);
assert.equal(rows[0].amount_range, '$500,001 - $1,000,000');
assert.ok(
  !Object.keys(rows[0]).some((k) => /estimate|midpoint|avg|mean/i.test(k)),
  'no averaged/estimated amount field may be written — the filed range is the fact',
);

// The disclosure lag is stored as filed, not recomputed.
assert.equal(rows[0].days_to_disclose, 24);

// The vendor's UI shows 'OTHER' for Trump's unresolved rows; never store it as a ticker.
assert.equal(normalizeSymbol('OTHER'), null);

// Preferreds and notes share the issuer's name but are not its common stock,
// so they must never be name-resolved (real descriptions from Trump's filings).
assert.equal(isNameResolvable('JPMORGAN CHASE & CO PERP NN 6.8750%'), false);
assert.equal(isNameResolvable('ALLY FINL INC PERP -D NT 7.1000%'), false);
assert.equal(isNameResolvable('COREBRIDGE FINL INC PERP -A 6.8750%'), false);
assert.equal(isNameResolvable('HOME DEPOT INC'), true);
assert.equal(isNameResolvable('META PLATFORMS INC CLASS A'), true);
assert.equal(isNameResolvable('UNITEDHEALTH GROUP INC'), true, 'UNIT must match whole words only');

// Move before disclosure: the real Pelosi BE case that motivated migration 156.
{
  const m = moveBeforeDisclosure({ priceAtTrade: 166.84, priceAtDisclosure: 201.45 });
  assert.ok(m != null && Math.abs(m - 20.74) < 0.01, `BE move ${m}`);
  assert.equal(moveBeforeDisclosure({ priceAtTrade: null, priceAtDisclosure: 201.45 }), null, 'no invented baseline');
  assert.equal(moveBeforeDisclosure({ priceAtTrade: 0, priceAtDisclosure: 5 }), null, 'no divide by zero');
}

// The vendor's double ingestion: Pelosi's Jan 16 2026 GOOGL buy arrived as
// both 'Buy' (54114) and 'Purchase' (133052), and Tuberville's sales as both
// 'Sale' and a re-ingested 'Sell' with a later disclosure date.
{
  const base = {
    politician_id: PID,
    symbol: 'GOOGL',
    amount_range: '$500,001 - $1,000,000',
    transaction_date: '2026-01-16',
    disclosure_date: '2026-01-23',
  };
  const buy = { ...base, dc_trade_id: 54114, trade_type: 'Buy' };
  const purchase = { ...base, dc_trade_id: 133052, trade_type: 'Purchase' };

  assert.deepEqual(dropVendorDuplicates([buy, purchase], []).map((r) => r.dc_trade_id), [54114], 'same batch');
  assert.deepEqual(dropVendorDuplicates([purchase], [buy]), [], 'copy of an already-stored row');
  assert.deepEqual(dropVendorDuplicates([buy], [buy]).length, 1, 're-sent stored row is left for the upsert to ignore');

  const twice = { ...buy, dc_trade_id: 54116 };
  assert.equal(dropVendorDuplicates([buy, twice], []).length, 2, 'same-vocabulary repeats are real trades');

  const sale = { ...base, dc_trade_id: 1, trade_type: 'Sale', disclosure_date: '2025-05-15' };
  const sell = { ...base, dc_trade_id: 2, trade_type: 'Sell', disclosure_date: '2026-08-05' };
  assert.deepEqual(dropVendorDuplicates([sell, sale], []).map((r) => r.dc_trade_id), [1], 'earliest disclosure wins');

  assert.equal(dropVendorDuplicates([buy, { ...purchase, symbol: 'GOOG' }], []).length, 2, 'different ticker is a different trade');
  assert.equal(dropVendorDuplicates([{ ...buy, symbol: null }, { ...purchase, symbol: null }], []).length, 2);
}

console.log('congress ingest checks passed');
