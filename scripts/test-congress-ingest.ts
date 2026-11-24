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
import { normalizeSymbol, buildRows, isNameResolvable, dropVendorDuplicates, cleanFiledName, namesAgree, isNonCommonFiling, nextPageVerdict, isNeverTickered } from '../lib/congress/ingest-trades';
import { tradeDirection, isFiledLate, formatAmountRange, moveBeforeDisclosure } from '../lib/congress/types';
import { groupOverlap, isNewTrade, overlapVisit } from '../lib/congress/overlap-groups';
import type { ActivityTrade } from '../lib/congress/insights';
import { biggestRuns, buildFiling, earlierFilingDays, latestFilingDay, sizeLevel } from '../lib/congress/filing';
import { findGap } from '../lib/congress/gap-search';

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

// A bond is never its issuer's stock: the vendor's ORCL on an Oracle 2033 note,
// or NYT on a New York City muni, must not reach a page as a stock trade.
for (const type of ['Bond', 'Municipal Bond', 'Municipal Security', 'Treasury', 'Bond/Note', 'Structured Note']) {
  assert.equal(isNeverTickered(type), true, `${type} keeps no vendor ticker`);
}
for (const type of ['Stock', 'ETF', 'Other', 'Option', null]) {
  assert.equal(isNeverTickered(type), false, `${type} keeps its ticker`);
}

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

// The vendor puts the asset class in the ticker slot (counted 2026-10-02).
for (const p of ['ETF', 'LP', 'FUND', 'OPTION', 'TREAS', 'TRUST']) assert.equal(normalizeSymbol(p), null, `${p} is not a ticker`);

// Filed names carry owner, account and share-type wording around the issuer.
assert.equal(cleanFiledName('(Spouse) Netflix, Inc. - Common Stock'), 'Netflix, Inc.');
assert.equal(cleanFiledName('Diageo plc Common Stock [Hern Family Foundation]'), 'Diageo plc');
assert.equal(cleanFiledName('UNITEDHEALTH GROUP INCORPORATE CMN'), 'UNITEDHEALTH GROUP');
assert.equal(cleanFiledName('2000166537 JT Organon & Co. Common Stock'), 'Organon & Co.');
assert.equal(cleanFiledName('Estée Lauder Companies, Inc.'), 'Estee Lauder Companies, Inc.');

// namesAgree takes normalised keys (norm_company_name output). Every pair
// below is a real vendor ticker against the filed name.
assert.equal(namesAgree('NETAPP', 'NETFLIX'), false, 'Lamborn NetApp filed as NFLX');
assert.equal(namesAgree('NET APP', 'NET ELEMENT'), false, 'NetApp filed as NETE');
assert.equal(namesAgree('DOLLAR GENERAL', 'GEN DIGITAL'), false, 'Khanna Dollar General filed as GEN');
assert.equal(namesAgree('VERISIGN', 'VERIZON COMMUNICATIONS'), false, 'VeriSign filed as VZ');
assert.equal(namesAgree('PACCAR', 'PACKAGING CORPORATION OF AMERICA'), false, 'PACCAR filed as PKG');
assert.equal(namesAgree('UNITED STATES STEEL', 'UTSTARCOM'), false);
assert.equal(namesAgree('VANGUARD MID CAP ETF', 'VANGUARD TOTAL STOCK MARKET INDEX FUND ETF'), false, 'filed as VTI');
assert.equal(namesAgree('JP MORGAN CHASE &', 'JPMORGAN CHASE &'), true);
assert.equal(namesAgree('MC DONALDS', 'MCDONALDS'), true);
assert.equal(namesAgree('BHP GROUP LIMITED', 'BHP'), true);
assert.equal(namesAgree('CVS', 'CVS HEALTH'), true);
assert.equal(namesAgree('TE CONNECTIVITY LTD NEW SWITZERLAND', 'TE CONNECTIVITY'), true);
assert.equal(namesAgree('FERGUSON', 'FERGUSON ENTERPRISES'), true);
assert.equal(namesAgree('CONSUMER STAPLES SELECT SECTOR SPDR', 'STATE STREET CONSUMER STAPLES SELECT SECTOR SPDR ETF'), true);
assert.equal(namesAgree('AMERICAN EXPRESS', 'AMERICA'), false, 'a prefix must end on a word');
// 2026-10-06, live on Pelosi's page: a place name is not a company name.
assert.equal(namesAgree('THERMO ELECTRON', 'THERMO FISHER SCIENTIFIC'), true, 'renamed company keeps its ticker (TMO)');
assert.equal(namesAgree('TAIWAN AL', 'TAIWAN SEMICONDUCTOR MANUFACTURING'), false, 'Pelosi Taiwan Al filed as TSM');
assert.equal(namesAgree('EXXONMOBIL HLDGS', 'EXXONMOBIL HOLDINGS'), true, 'abbreviated second word (Trump filing)');
assert.equal(namesAgree('KINDER MORGAN', 'KINDER MORGAN'), true);
// Preferred series and private LLCs are never a plain common ticker.
assert.equal(isNonCommonFiling('Toronto Dominion Bank Ser P'), true, 'Hern TD preferred filed as TD');
assert.equal(isNonCommonFiling('Forge Investments, LLC'), true);
assert.equal(isNonCommonFiling('Wells Fargo & Co 4.75% PFD Series Z'), true);
assert.equal(isNonCommonFiling('Liberty Media Corp Series A Liberty SiriusXM'), false, 'tracking stock, not preferred');
assert.equal(isNonCommonFiling('Bloom Energy Corporation Class A Common Stock'), false);
assert.equal(isNonCommonFiling('GE VERNOVA LLC CMN'), false, 'listed LLC');
assert.equal(isNonCommonFiling('Enterprise Product Partners L.P. (via HGI, LLC)'), false, 'LLC is the account, in parentheses');
assert.equal(namesAgree('TAIWAN SEMI', 'TAIWAN SEMICONDUCTOR MANUFACTURING'), true, 'shortened second word');
assert.equal(isNonCommonFiling('Vertiv Holdings, LLC Class A'), false, 'listed LLC');
assert.equal(isNonCommonFiling('AllianceBernstein Holding L.P. Units'), false, 'listed LP units are common');

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

// The overlap panel shows each person's LATEST trade per stock. The first
// version showed the oldest (a Map keeps the last value it sees, and the rows
// arrive newest first), so bought-then-sold read "bought".
{
  const tr = (slug: string, symbol: string, tradeType: string, transactionDate: string): ActivityTrade => ({
    slug, displayName: slug, party: null, chamber: null, symbol, tradeType, amountRange: '', amountLow: null, amountHigh: null,
    transactionDate, disclosureDate: null, priceAtTrade: null, priceAtDisclosure: null,
  });
  const groups = groupOverlap([
    tr('khanna', 'MSFT', 'Sale', '2026-09-28'),
    tr('pelosi', 'NVDA', 'Purchase', '2026-10-02'),
    tr('khanna', 'MSFT', 'Buy', '2026-08-01'),
    tr('hern', 'MSFT', 'Purchase', '2026-09-01'),
    tr('khanna', 'MSFT', 'Exchange', '2026-07-01'),
  ], new Set(['MSFT']));
  assert.deepEqual(groups.map((g) => g.symbol), ['NVDA', 'MSFT'], 'stocks ordered by their newest trade, whatever the input order');
  const msft = groups[1];
  assert.equal(msft.held, true);
  assert.equal(msft.latestDate, '2026-09-28');
  assert.deepEqual(msft.people.map((p) => p.slug), ['khanna', 'hern'], 'people newest first');
  assert.equal(msft.people[0].latest.tradeType, 'Sale', 'bought then sold shows the sale');
  assert.equal(msft.people[0].count, 3);
  assert.equal(msft.sellers, 1);
  assert.equal(msft.buyers, 1);
  assert.equal(msft.newCount, 0, 'no newSince (first visit): nothing is new');

  // New since the last visit: by ingest time, not trade date. A late filing of
  // an old trade is still new, and the stock carrying it leads.
  const since = '2026-10-10T12:00:00.000Z';
  const late = { ...tr('hern', 'MSFT', 'Purchase', '2026-07-15'), addedAt: '2026-10-13 14:00:12.123456+00' };
  const old = { ...tr('pelosi', 'NVDA', 'Purchase', '2026-10-02'), addedAt: '2026-10-06T09:00:00Z' };
  const withNew = groupOverlap([old, late, tr('khanna', 'MSFT', 'Sale', '2026-09-28')], new Set(), since);
  assert.deepEqual(withNew.map((g) => g.symbol), ['MSFT', 'NVDA'], 'a stock with new trades leads, though NVDA traded later');
  assert.equal(withNew[0].newCount, 1);
  assert.equal(withNew[0].people.find((p) => p.slug === 'hern')?.newCount, 1);
  assert.equal(withNew[0].people[0].slug, 'hern', 'within a stock, the person with news leads');
  assert.equal(withNew[0].latestDate, '2026-09-28', 'the stock date is still its newest trade');
  assert.equal(withNew[1].newCount, 0, 'ingested before the last visit');
  assert.equal(isNewTrade({ addedAt: null }, since), false, 'no ingest time: never claimed as new');
  assert.equal(isNewTrade({ addedAt: '2026-10-13T00:00:00Z' }, null), false);

  // Visits: the line holds through a reload, moves after a 2-hour gap.
  const at = (iso: string) => new Date(iso);
  const first = overlapVisit(null, null, at('2026-10-14T10:00:00Z'));
  assert.equal(first.newSince, null, 'first ever load: nothing new');
  assert.equal(first.store.congress_overlap_seen_at, '2026-10-14T10:00:00.000Z');
  const reload = overlapVisit('2026-10-14T10:00:00.000Z', '2026-10-07T08:00:00.000Z', at('2026-10-14T10:20:00Z'));
  assert.equal(reload.newSince, '2026-10-07T08:00:00.000Z', 'a reload keeps the visit line');
  assert.equal(reload.store.congress_overlap_since, '2026-10-07T08:00:00.000Z');
  const next = overlapVisit('2026-10-14T10:20:00.000Z', '2026-10-07T08:00:00.000Z', at('2026-10-14T15:00:00Z'));
  assert.equal(next.newSince, '2026-10-14T10:20:00.000Z', 'after a gap, the last load becomes the line');
  assert.equal(next.store.congress_overlap_seen_at, '2026-10-14T15:00:00.000Z');
}

// ─── Refresh paging: when to fetch another page (nextPageVerdict) ───────────
{
  const p = { rows: 200, requested: 200, knownInPage: 0, spent: 100, nextCost: 1015, budget: 4000 };
  assert.equal(nextPageVerdict(p), 'more', 'a full page of new trades means the filing goes on');
  assert.equal(nextPageVerdict({ ...p, knownInPage: 1 }), 'caught-up', 'one stored trade: everything older is stored');
  assert.equal(nextPageVerdict({ ...p, knownInPage: 1, rows: 3 }), 'caught-up', 'caught up wins over a short page');
  assert.equal(nextPageVerdict({ ...p, rows: 120 }), 'end', 'a short page is the end of their history');
  assert.equal(nextPageVerdict({ ...p, spent: 3000 }), 'ceiling', 'the next page would cross the budget');
  assert.equal(nextPageVerdict({ ...p, spent: 2985 }), 'more', 'exactly at the budget is still allowed');
  assert.equal(nextPageVerdict({ ...p, rows: 0, requested: 20 }), 'end', 'an empty page never loops');
}

// ─── Latest filing, grouped per stock (lib/congress/filing.ts) ──────────────
{
  let n = 0;
  const row = (symbol: string, tradeType: string, range: string, date: string, addedAt: string) => ({
    id: String(++n), symbol, assetDescription: symbol, companyName: `${symbol} Inc`, assetType: 'Stock', tradeType,
    amountRange: range, amountLow: null, amountHigh: null, transactionDate: date, disclosureDate: null,
    daysToDisclose: null, sector: null, priceAtTrade: null, priceAtDisclosure: null, addedAt,
  });
  const backfill = '2026-09-25T10:00:00Z';
  const today = '2026-11-24T14:01:00Z';
  const trades = [
    row('OLD', 'Buy', '$1,001 - $15,000', '2026-07-24', backfill),
    row('NVDA', 'Sell', '$1,001 - $15,000', '2026-09-24', today),
    row('NVDA', 'Buy', '$1,001 - $15,000', '2026-09-09', today),
    row('NVDA', 'Buy', '$1,001 - $15,000', '2026-09-10', today),
    row('CMCSA', 'Sell', '$1,000,001 - $5,000,000', '2026-09-23', today),
    row('MCD', 'Sell', '$1,001 - $15,000', '2026-09-24', today),
    row('MCD', 'Sell', '$1,000,001 - $5,000,000', '2026-09-23', today),
    row('TJX', 'Buy', '$250,001 - $500,000', '2026-09-15', today),
    row('TJX', 'Buy', '$250,001 - $500,000', '2026-09-16', today),
    row('D', 'Buy', '$15,001 - $50,000', '2026-09-10', today),
  ];

  assert.equal(sizeLevel(trades[0]), 0);
  assert.equal(sizeLevel(trades[9]), 1);
  assert.equal(sizeLevel(trades[7]), 2);
  assert.equal(sizeLevel(trades[4]), 3);
  assert.equal(sizeLevel({ amountLow: null, amountHigh: null, amountRange: 'Undisclosed' }), null);

  assert.equal(latestFilingDay(trades), '2026-11-24', 'the newest arrival day');
  assert.equal(latestFilingDay(trades.slice(0, 1)), null, 'a backfill alone is not a filing');
  assert.deepEqual(earlierFilingDays(trades, '2026-11-24'), [], 'only the backfill came before');
  const mid = row('MID', 'Buy', '$1,001 - $15,000', '2026-10-01', '2026-10-13T09:00:00Z');
  assert.deepEqual(earlierFilingDays([...trades, mid], '2026-11-24'), ['2026-10-13'], 'between the backfill and the latest');

  const f = buildFiling(trades, '2026-11-24', new Set(['NVDA']), new Set(['D']))!;
  assert.equal(f.count, 9, 'the backfill row is not in the filing');
  assert.equal(f.small, 4);
  assert.equal(f.firstDate, '2026-09-09');
  assert.equal(f.lastDate, '2026-09-24');
  assert.deepEqual(f.stocks.map((s) => s.symbol), ['NVDA', 'D', 'MCD', 'CMCSA', 'TJX'], 'owned, watched, then biggest, then newest');
  const nvda = f.stocks[0];
  assert.equal(nvda.relation, 'owned');
  assert.equal(nvda.buys, 2);
  assert.equal(nvda.sells, 1);
  assert.deepEqual(nvda.trades.map((t) => t.transactionDate), ['2026-09-09', '2026-09-10', '2026-09-24'], 'oldest first');
  assert.equal(f.stocks.find((s) => s.symbol === 'MCD')!.biggest.amountRange, '$1,000,001 - $5,000,000', "a stock's biggest trade, not its first");
  assert.deepEqual(f.biggest.map((t) => t.symbol), ['CMCSA', 'MCD', 'TJX'], 'one per stock, largest first');
  const runs = biggestRuns(f.biggest);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0].trades.map((t) => t.symbol), ['CMCSA', 'MCD'], 'same direction and bracket fold together');
  assert.equal(runs[1].direction, 'buy');
}

// ─── Finding a hole in stored trades (lib/congress/gap-search.ts) ───────────
async function gapChecks() {
  // A vendor list of `total` rows where rows in [holeStart, holeEnd) are missing.
  const list = (total: number, holeStart: number, holeEnd: number) => {
    const seen: number[] = [];
    const probe = async (o: number) => { seen.push(o); return o >= total ? null : !(o >= holeStart && o < holeEnd); };
    return { probe, seen };
  };

  // Trump's shape: 500 stored, a hole, then the earlier 500-row batch.
  const a = list(2000, 500, 1137);
  assert.deepEqual(await findGap(a.probe, { upperBound: 1000 }), { start: 500, end: 1137, toHistoryEnd: false });
  assert.ok(a.seen.length < 30, `found in ${a.seen.length} probes, each one billed`);
  assert.equal(new Set(a.seen).size, a.seen.length, 'no row is probed twice');
  const known = list(2000, 500, 1137);
  await findGap(known.probe, { start: 500, upperBound: 1000 });
  assert.ok(known.seen.length <= 15, `a known start sizes in ${known.seen.length} probes`);

  // A dry run's start is checked, not trusted.
  assert.deepEqual(await findGap(list(2000, 500, 1137).probe, { start: 500, upperBound: 1000 }), { start: 500, end: 1137, toHistoryEnd: false });
  await assert.rejects(findGap(list(2000, 520, 1137).probe, { start: 500, upperBound: 1000 }), /not missing/, 'the list moved down');
  await assert.rejects(findGap(list(2000, 480, 1137).probe, { start: 500, upperBound: 1000 }), /not stored/, 'the list moved up');

  // A hole running to the end of history, and no hole at all.
  assert.deepEqual(await findGap(list(900, 500, 900).probe, { upperBound: 1000 }), { start: 500, end: 900, toHistoryEnd: true });
  assert.equal(await findGap(list(600, 600, 600).probe, { upperBound: 1000 }), null, 'stored to the end: nothing to fill');
  assert.equal(await findGap(list(2000, 0, 0).probe, { upperBound: 1000 }), null, 'stored past the bound: nothing to fill');
  assert.equal(await findGap(list(2000, 0, 40).probe, { upperBound: 1000 }), null, 'a fresh filing on top is the refresh\'s job');
  // A hole exactly one step long still lands on its end.
  assert.deepEqual(await findGap(list(2000, 500, 700).probe, { upperBound: 1000 }), { start: 500, end: 700, toHistoryEnd: false });
}

gapChecks().then(
  () => console.log('congress ingest checks passed'),
  (err) => { console.error(err); process.exit(1); },
);
