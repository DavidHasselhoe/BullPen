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
import { computeHoldingsDiff, buildStatusIndex, holdingKey, type DiffableHolding } from '../lib/institutions/compute-diff';
import { buildAllocation, optionPositions } from '../lib/institutions/allocation';
import { parseInfoTable } from '../lib/institutions/parse-13f-xml';
import { normalizeShareClassSymbol } from '../lib/institutions/symbol-format';

// Share classes are dot-spelled everywhere else in the app; ISIN search can return a hyphen.
assert.equal(normalizeShareClassSymbol('BRK-B'), 'BRK.B');
assert.equal(normalizeShareClassSymbol('BF-A'), 'BF.A');
assert.equal(normalizeShareClassSymbol('MOG-A'), 'MOG.A');
assert.equal(normalizeShareClassSymbol('BRK.B'), 'BRK.B', 'already dotted is unchanged');
assert.equal(normalizeShareClassSymbol('NVDA'), 'NVDA', 'plain ticker unchanged');
assert.equal(normalizeShareClassSymbol('ABC-WS'), 'ABC-WS', 'only a single-letter class is rewritten');

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

// Options carry their underlying's CUSIP but are separate positions.
const nvda = h('NVDA', 1000, 100_000);
const nvdaPut = (shares: number, valueUsd: number): DiffableHolding => ({ ...h('NVDA', shares, valueUsd), putCall: 'PUT' });
const optDiff = computeHoldingsDiff([nvda, nvdaPut(2000, 200_000)], [nvda, nvdaPut(1000, 100_000)])!;
const opt = buildStatusIndex(optDiff);
assert.equal(opt.statusFor('NVDA'), 'unchanged', 'a bigger put is not more shares');
assert.equal(opt.statusFor(holdingKey(nvdaPut(0, 0))), 'increased');
assert.equal(optDiff.exited.length, 0);

// ...and never count toward the portfolio.
const withPut = [nvda, nvdaPut(5000, 500_000)];
assert.equal(buildAllocation(withPut).total, 100_000, 'put notional stays out of the total');
assert.equal(buildAllocation(withPut).top.length, 1);
assert.equal(optionPositions(withPut).length, 1);

// Parser: sub-account rows of one position sum; a put on the same CUSIP does not.
const infoRow = (value: number, shares: number, putCall = '') =>
  `<ns1:infoTable><ns1:nameOfIssuer>NVIDIA CORP</ns1:nameOfIssuer><ns1:cusip>67066G104</ns1:cusip>` +
  `<ns1:value>${value}</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>${shares}</ns1:sshPrnamt>` +
  `<ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>` +
  (putCall ? `<ns1:putCall>${putCall}</ns1:putCall>` : '') +
  `</ns1:infoTable>`;
const parsed = parseInfoTable(infoRow(100, 10) + infoRow(50, 5) + infoRow(900, 90, 'Put'));
assert.equal(parsed.length, 2, 'shares and the put are two rows');
assert.equal(parsed.find((p) => !p.putCall)!.shares, 15, 'sub-account rows still sum');
assert.equal(parsed.find((p) => p.putCall)!.putCall, 'PUT', 'put/call normalized to upper case');
assert.equal(parsed.find((p) => p.putCall)!.valueUsd, 900);
assert.equal(parsed.find((p) => !p.putCall)!.valueUsd, 150, 'a whole-dollar filing is left alone');

// A filer still writing <value> in thousands (Baupost's real Q2 2026 rows) is
// converted to dollars.
const plainRow = (cusip: string, value: number, shares: number) =>
  `<infoTable><nameOfIssuer>X</nameOfIssuer><cusip>${cusip}</cusip><value>${value}</value>` +
  `<shrsOrPrnAmt><sshPrnamt>${shares}</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>`;
const thousands = parseInfoTable(plainRow('023135106', 892310, 3743854) + plainRow('02079K107', 484744, 1371931));
assert.equal(thousands.find((p) => p.cusip === '023135106')!.valueUsd, 892_310_000, 'thousands-scale filing is converted');

console.log('holdings diff: all assertions passed');
