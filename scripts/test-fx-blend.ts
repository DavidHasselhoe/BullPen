/**
 * Self-check for lib/holdings/fx-blend.ts. Run: npx tsx scripts/test-fx-blend.ts
 * Replaying lots one at a time must give the same home-currency cost as
 * converting each lot at its own rate, and undoing the last lot must restore
 * the rate from before it.
 */
import assert from 'node:assert/strict';
import { blendFxRate } from '../lib/holdings/fx-blend';

// [quantity, USD price, USD/NOK on the day]: a real five-lot GOOGL position.
const lots: [number, number, number][] = [[3, 253.1299, 9.9442], [1, 304.5, 9.5709], [2, 336.45, 9.377], [10, 320, 9.6142], [5, 285, 9.2524]];

let qty = 0, avg = 0, fx: number | null = null;
const rates: (number | null)[] = [];
for (const [q, p, r] of lots) {
  fx = qty > 0 ? blendFxRate(qty * avg, fx, q * p, r) : r;
  avg = (qty * avg + q * p) / (qty + q);
  qty += q;
  rates.push(fx);
}
const perLotNok = lots.reduce((s, [q, p, r]) => s + q * p * r, 0);
assert.ok(Math.abs(qty * avg * fx! - perLotNok) < 1e-6, `blended cost ${qty * avg * fx!} != per-lot ${perLotNok}`);

// Undo the last lot: back to the rate after lot four.
const [lq, lp, lr] = lots[lots.length - 1];
const undone = blendFxRate(qty * avg, fx, -(lq * lp), lr);
assert.ok(Math.abs(undone! - rates[rates.length - 2]!) < 1e-9, 'undo did not restore the previous rate');

// Missing rates never invent one.
assert.equal(blendFxRate(100, null, 50, null), null);
assert.equal(blendFxRate(100, 10, 50, null), 10);
assert.equal(blendFxRate(100, null, 50, 9), 9);

console.log(`fx-blend ok: GOOGL NOK cost ${perLotNok.toFixed(2)} at blended ${fx!.toFixed(4)} (first lot alone said 9.9442)`);
