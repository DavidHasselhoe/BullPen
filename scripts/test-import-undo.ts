/**
 * Checks that reverseWeightedAverage is the exact inverse of the
 * weighted-average update in addOrUpdateHolding. If these two ever drift,
 * undoing an import silently rewrites a user's cost basis, which is the
 * kind of bug nobody notices until their gain/loss is wrong.
 *
 *   npx tsx scripts/test-import-undo.ts
 */

import assert from 'node:assert/strict';
import { reverseWeightedAverage } from '../lib/import/undo-import';

/** The forward math executeReplay drives, copied from addOrUpdateHolding. */
function applyBuy(heldQty: number, heldAvg: number | null, lotQty: number, lotPrice: number) {
  const newQuantity = heldQty + lotQty;
  let newAvg = heldAvg;
  if (lotPrice > 0 && lotQty > 0) {
    newAvg = heldQty > 0 && heldAvg != null ? (heldQty * heldAvg + lotQty * lotPrice) / newQuantity : lotPrice;
  }
  return { quantity: newQuantity, avgPrice: newAvg };
}

const cases: Array<[string, number, number | null, number, number]> = [
  // label, starting qty, starting avg, lot qty, lot price
  ['top-up on an existing position', 10, 100, 5, 130],
  ['buying into a big loser', 250, 48.2, 1000, 12.75],
  ['fractional shares', 0.5031, 412.88, 1.2077, 388.4],
  ['lot priced above the average', 3, 20, 7, 95],
  ['lot priced below the average', 80, 55.5, 20, 9.99],
];

for (const [label, startQty, startAvg, lotQty, lotPrice] of cases) {
  const after = applyBuy(startQty, startAvg, lotQty, lotPrice);
  const restored = reverseWeightedAverage(after.quantity, after.avgPrice, lotQty, lotPrice);
  assert.ok(restored != null, `${label}: expected an average back`);
  assert.ok(
    Math.abs(restored - (startAvg as number)) < 1e-9,
    `${label}: expected ${startAvg}, got ${restored}`
  );
  assert.ok(Math.abs(after.quantity - lotQty - startQty) < 1e-9, `${label}: quantity did not round-trip`);
}

// A position the import opened from nothing empties out completely. There is
// no previous average to restore, so the current one is kept rather than
// dividing by zero.
const opened = applyBuy(0, null, 12, 44.5);
assert.equal(opened.avgPrice, 44.5);
assert.equal(reverseWeightedAverage(opened.quantity, opened.avgPrice, 12, 44.5), 44.5);

// Numbers that never matched the lot (a hand-edited average) must not produce
// a negative cost basis — the stale average is the safer answer.
assert.equal(reverseWeightedAverage(10, 5, 5, 200), 5);

// A null average stays null rather than becoming a number out of nowhere.
assert.equal(reverseWeightedAverage(10, null, 5, 50), null);

console.log(`reverseWeightedAverage: ${cases.length + 3} checks passed`);
