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
import { normalizeSymbol, buildRows } from '../lib/congress/ingest-trades';

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

console.log('congress ingest checks passed');
