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
import { stripFabricatedEpsStubs } from '../lib/market-data/calendar-days';
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

console.log('stripFabricatedEpsStubs: all assertions passed');
