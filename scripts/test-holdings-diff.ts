/**
 * Assert-based check for the quarter-over-quarter diff. No framework.
 *   npx tsx scripts/test-holdings-diff.ts
 *
 * Exists because computeHoldingsDiff is the only branching logic in the 13F
 * feature, and it silently produces a plausible-but-wrong answer if the
 * classifier is keyed on the wrong field. The split case is asserted as the
 * KNOWN-WRONG result on purpose, so the documented limitation is pinned rather
 * than rediscovered as a bug later.
 */

import assert from 'node:assert/strict';
import { computeHoldingsDiff, buildStatusIndex, type DiffableHolding } from '../lib/institutions/compute-diff';

function h(cusip: string, shares: number, valueUsd: number): DiffableHolding {
  return { cusip, symbol: cusip, nameOfIssuer: cusip, valueUsd, shares, portfolioPct: null };
}

// prev -> curr, one holding per scenario
const previous = [
  h('KEEP', 1000, 100_000),   // untouched shares, value moves a lot
  h('GROW', 1000, 100_000),   // +20% shares
  h('TRIM', 1000, 100_000),   // -20% shares
  h('NOISE', 1000, 100_000),  // +0.5% shares, inside the band
  h('GONE', 1000, 100_000),   // sold out
  h('ZERO', 0, 0),            // degenerate prior row
  h('SPLIT', 1000, 100_000),  // 4:1 split, value flat
];
const current = [
  h('KEEP', 1000, 130_000),
  h('GROW', 1200, 120_000),
  h('TRIM', 800, 80_000),
  h('NOISE', 1005, 100_500),
  h('ZERO', 500, 50_000),
  h('SPLIT', 4000, 102_000),
  h('FRESH', 700, 70_000),    // new buy
];

const diff = computeHoldingsDiff(current, previous);
assert.ok(diff, 'diff should exist when a previous quarter is given');
const { statusFor, changeFor } = buildStatusIndex(diff);

// The whole point: value moved 30% while share count did not.
assert.equal(statusFor('KEEP'), 'unchanged', 'value-only move must not read as a trade');
assert.equal(statusFor('GROW'), 'increased');
assert.equal(statusFor('TRIM'), 'reduced');
assert.equal(statusFor('NOISE'), 'unchanged', '0.5% is inside the 1% band');
assert.equal(statusFor('GONE'), 'sold_out');
assert.equal(statusFor('FRESH'), 'new');
assert.equal(statusFor('ZERO'), 'unchanged', 'prior shares of 0 has no denominator');
assert.equal(statusFor('MISSING'), 'unchanged', 'unknown cusip falls back to unchanged');

assert.equal(Math.round(changeFor('GROW')!.sharesChangePct), 20);
assert.equal(Math.round(changeFor('TRIM')!.sharesChangePct), -20);
// valueChangePct rides along for display so a split is visible to a reader.
assert.equal(Math.round(changeFor('GROW')!.valueChangePct), 20);

// KNOWN LIMITATION, pinned deliberately: a 4:1 split reads as a 300% buy.
// If this assertion ever fails, split correction was added -- update the
// comment block at the bottom of compute-diff.ts too.
assert.equal(statusFor('SPLIT'), 'increased', 'splits are knowingly uncorrected');
assert.equal(Math.round(changeFor('SPLIT')!.sharesChangePct), 300);
assert.equal(Math.round(changeFor('SPLIT')!.valueChangePct), 2, 'flat value is the split tell');

// No prior quarter at all: the first quarter we track for a fund.
assert.equal(computeHoldingsDiff(current, null), null, 'no previous quarter means no diff');
const empty = buildStatusIndex(null);
assert.equal(empty.statusFor('ANY'), 'unchanged');
assert.equal(empty.changeFor('ANY'), undefined);

// Sorting: biggest share move first in each direction.
assert.ok(diff.increased[0].sharesChangePct >= diff.increased[diff.increased.length - 1].sharesChangePct);
assert.ok(diff.decreased[0].sharesChangePct <= diff.decreased[diff.decreased.length - 1].sharesChangePct);

console.log('holdings diff: all assertions passed');
