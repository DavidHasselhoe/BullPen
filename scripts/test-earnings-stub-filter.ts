/**
 * Assert-based check for stripFabricatedEpsStubs. No framework.
 *   npx tsx scripts/test-earnings-stub-filter.ts
 *
 * Pinned against the live case that found this bug 2026-09-09: TD's earnings
 * feed attached an identical eps_estimate=eps_actual=0.27 stub to PEP, AME,
 * VRSN, KMX and GME for 2026-09-08, a date none of them actually report on.
 * CASY's real, distinct result on the same day must survive untouched.
 */

import assert from 'node:assert/strict';
import { stripFabricatedEpsStubs, mergeNasdaqIntoEarningsDay, mergeCalendarIntoSymbolEarnings } from '../lib/market-data/calendar-days';
import type { NasdaqEarningsRow } from '../lib/market-data/nasdaq-earnings-calendar';
import type { EarningsCalendar } from '../lib/finnhub/finnhub-client';
import type { EarningsCalendarItem } from '../lib/twelvedata/twelvedata-client';

function row(symbol: string, estimate: number | null, actual: number | null, surprise: number | null): EarningsCalendarItem {
  return { symbol, date: '2026-09-08', eps_estimate: estimate, eps_actual: actual, surprise };
}

const stubbed = [
  row('PEP', 0.27, 0.27, 0),
  row('AME', 0.27, 0.27, 0),
  row('VRSN', 0.27, 0.27, 0),
  row('KMX', 0.27, 0.27, 0),
  row('GME', 0.27, 0.27, 0),
  row('CASY', 6.6, 5.77, -12.58), // real, distinct result -- must survive untouched
];

const cleaned = stripFabricatedEpsStubs(stubbed);
const bySymbol = new Map(cleaned.map((r) => [r.symbol, r]));

for (const sym of ['PEP', 'AME', 'VRSN', 'KMX', 'GME']) {
  const r = bySymbol.get(sym)!;
  assert.equal(r.eps_estimate, null, `${sym} eps_estimate should be stripped`);
  assert.equal(r.eps_actual, null, `${sym} eps_actual should be stripped`);
  assert.equal(r.surprise, null, `${sym} surprise should be stripped`);
}

const casy = bySymbol.get('CASY')!;
assert.equal(casy.eps_estimate, 6.6, 'CASY real estimate must survive');
assert.equal(casy.eps_actual, 5.77, 'CASY real actual must survive');

// A single company landing exactly on estimate (no unrelated match) is real, not a stub.
const singleInline = [row('MSFT', 4.24, 4.24, 0), row('CASY', 6.6, 5.77, -12.58)];
const singleCleaned = stripFabricatedEpsStubs(singleInline);
assert.equal(singleCleaned.find((r) => r.symbol === 'MSFT')!.eps_actual, 4.24, 'lone in-line result must not be stripped');

// Two real companies landing on the same penny estimate the same day is ordinary.
const twoInline = [row('FAST', 0.33, 0.33, 0), row('TFIN', 0.33, 0.33, 0)];
for (const r of stripFabricatedEpsStubs(twoInline)) {
  assert.equal(r.eps_actual, 0.33, `${r.symbol}: a pair of in-line results must not be stripped`);
}

// The same figure on different days is not one batch.
const acrossDays = [
  { ...row('AAA', 0.5, 0.5, 0), date: '2026-09-08' },
  { ...row('BBB', 0.5, 0.5, 0), date: '2026-09-09' },
  { ...row('CCC', 0.5, 0.5, 0), date: '2026-09-10' },
];
for (const r of stripFabricatedEpsStubs(acrossDays)) {
  assert.equal(r.eps_actual, 0.5, `${r.symbol}: matches on different days must not be grouped`);
}

console.log('stripFabricatedEpsStubs: all assertions passed');

// ── 2026-10-01: the cloned-beat variant (estimate != actual) ─────────────────
// TD's 2026-09-30 feed gave DHR, HIG, CM and 24 more the same 4.08 / 4.40.
const sep30 = (symbol: string, est: number | null, act: number | null): EarningsCalendarItem =>
  ({ symbol, date: '2026-09-30', eps_estimate: est, eps_actual: act, surprise: est && act ? 7.84 : null, time: 'After Hours' });
const clones = ['DHR', 'HIG', 'CM', 'AEYE'].map((s) => sep30(s, 4.08, 4.4));
for (const r of stripFabricatedEpsStubs(clones)) {
  assert.equal(r.eps_actual, null, `${r.symbol}: a cloned beat must be stripped too`);
}

const nasdaq: NasdaqEarningsRow[] = [
  { symbol: 'MU', time: null, epsEstimate: 31.41, epsActual: 33.19, surprisePercent: 5.67 },
  { symbol: 'AEYE', time: 'AMC', epsEstimate: 0.1, epsActual: 0.12, surprisePercent: 20 },
  { symbol: 'FDS', time: 'BMO', epsEstimate: 4.35, epsActual: 4.52, surprisePercent: 3.91 },
];
const merged = mergeNasdaqIntoEarningsDay(
  [...clones, sep30('MU', null, 2.86), sep30('FDS', 4.35, 4.52)],
  nasdaq,
  '2026-09-30',
);
const m = new Map(merged.map((r) => [r.symbol, r]));
for (const sym of ['DHR', 'HIG', 'CM']) assert.ok(!m.has(sym), `${sym}: a clone Nasdaq does not list is dropped`);
assert.equal(m.get('AEYE')!.eps_actual, 0.12, 'a clone Nasdaq lists keeps the row with Nasdaq\'s numbers');
assert.equal(m.get('MU')!.eps_actual, 33.19, 'Nasdaq\'s actual beats TD\'s');
assert.equal(m.get('MU')!.eps_estimate, 31.41);
assert.equal(m.get('FDS')!.eps_actual, 4.52, 'a real lone TD row survives');

// Nasdaq down (empty answer): clones are blanked, not dropped, since nothing confirms either way.
const offline = mergeNasdaqIntoEarningsDay(clones, [], '2026-09-30');
assert.equal(offline.length, 4, 'without Nasdaq, clones are kept');
assert.ok(offline.every((r) => r.eps_actual == null), 'without Nasdaq, clones lose their numbers');

// ── Stock page: the calendar fills what the per-symbol feed lags on ─────────
const hist = (date: string, quarter: number, year: number, est: number, act: number | null): EarningsCalendar =>
  ({ date, epsEstimate: est, epsActual: act, hour: 'After Hours', quarter, year, revenueActual: null, revenueEstimate: null, symbol: 'MU' });
const muHistory = [hist('2026-06-24', 3, 2026, 20.69, 25.11), hist('2026-03-18', 2, 2026, 9.16, 12.2)];
const muCalendar: EarningsCalendarItem[] = [
  { symbol: 'MU', date: '2026-09-30', eps_estimate: 31.41, eps_actual: 33.19, time: '', nasdaq_confirmed: true },
  { symbol: 'MU', date: '2026-06-25', eps_estimate: 20.7, eps_actual: 25.11, time: 'AMC', nasdaq_confirmed: true },
  { symbol: 'MU', date: '2026-12-01', eps_estimate: 9.99, eps_actual: null, time: 'After Hours' }, // TD-only: ignored
];
const page = mergeCalendarIntoSymbolEarnings(muHistory, muCalendar, 'MU');
assert.equal(page.length, 3, 'one new report added, the matching one merged, the TD-only one skipped');
const sep = page.find((r) => r.date === '2026-09-30')!;
assert.equal(sep.epsActual, 33.19);
assert.equal(sep.quarter, 4, 'the new report is the quarter after the one before it');
assert.equal(sep.year, 2026);
assert.equal(sep.unconfirmed, true, 'not yet matched to a filing');
const jun = page.find((r) => r.quarter === 3)!;
assert.equal(jun.date, '2026-06-25', 'Nasdaq\'s date wins for the same report');
assert.equal(jun.hour, 'AMC');

console.log('mergeNasdaqIntoEarningsDay + mergeCalendarIntoSymbolEarnings: all assertions passed');
