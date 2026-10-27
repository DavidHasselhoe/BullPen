/**
 * Self-check for lib/finance/technicals.ts. Run: npm run test-technicals
 */
import assert from 'node:assert/strict';
import { computeTechnicals } from '../lib/finance/technicals';

// 300 bars oscillating between ~90 and ~110 with a 40-bar period, so swing
// lows sit near 90 and swing highs near 110, several times each.
const n = 300;
const c = Array.from({ length: n }, (_, i) => 100 + 10 * Math.sin((i / 40) * 2 * Math.PI));
const bars = {
  t: c.map((_, i) => 1_700_000_000 + i * 86_400),
  o: c,
  h: c.map((x) => x + 0.5),
  l: c.map((x) => x - 0.5),
  c,
  v: c.map(() => 1_000),
};

const t = computeTechnicals(bars, 100, [20, 150, 400]);

assert.deepEqual(t.unavailableLengths, [400], 'a 400 SMA needs more than 300 bars');
assert.equal(t.movingAverages.length, 2);
const sma150 = t.movingAverages.find((m) => m.length === 150)!;
const expected = c.slice(-150).reduce((s, x) => s + x, 0) / 150;
assert.ok(Math.abs(sma150.value - expected) < 0.01, `SMA150 ${sma150.value} vs ${expected}`);

assert.equal(t.support.length, 1, 'all swing lows cluster into one level');
assert.ok(Math.abs(t.support[0].level - 89.5) < 0.5, `support near 89.5, got ${t.support[0].level}`);
assert.ok(t.support[0].touches >= 5, 'the low was tested every cycle');
assert.ok(Math.abs(t.resistance[0].level - 110.5) < 0.5, `resistance near 110.5, got ${t.resistance[0].level}`);
assert.ok(t.support[0].distancePct > 0 && t.resistance[0].distancePct < 0);

assert.ok(t.rsi14 != null && t.rsi14 >= 0 && t.rsi14 <= 100);
assert.equal(t.high52w.value, 110.5);

console.log('test-technicals: ok');
