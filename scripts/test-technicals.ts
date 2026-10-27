/**
 * Self-check for lib/finance/technicals.ts. Run: npm run test-technicals
 */
import assert from 'node:assert/strict';
import { computeTechnicals, etDate as etDay } from '../lib/finance/technicals';

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
assert.equal(t.volume?.latestVsAvg, 1, 'flat volume is 1x its average');

// A long climb then a slide: the 50-day falls through the 200-day.
const c2 = Array.from({ length: n }, (_, i) => (i < 200 ? 100 + i * 0.5 : 200 - (i - 200) * 0.5));
const v2 = c2.map(() => 1_000);
// A 15% jump on 3x volume ten days ago, the session after an earnings report.
const jump = n - 10;
for (let i = jump; i < n; i++) c2[i] *= 1.15;
v2[jump] = 3_000;
const bars2 = { ...bars, o: c2, h: c2, l: c2, c: c2, v: v2 };
const t2 = computeTechnicals(bars2, c2[n - 1], undefined, [etDay(bars.t[jump - 1])]);

assert.equal(t2.crossover?.sma50Above200, false);
assert.equal(t2.crossover?.last?.type, 'death');
assert.equal(t2.bigMoves[0].at, bars.t[jump], 'the jump is the biggest move');
assert.ok(Math.abs(t2.bigMoves[0].changePct - 15) < 1.5, `jump ~15%, got ${t2.bigMoves[0].changePct}`);
assert.ok(t2.bigMoves[0].volumeVsAvg! > 2.5);
assert.equal(t2.bigMoves[0].onEarnings, true, 'moved the session after the report');
assert.equal(computeTechnicals(bars2, 1).bigMoves[0].onEarnings, null, 'no dates given means unknown');
// The newest known report is 100 days before the jump: a newer one may be missing.
const stale = computeTechnicals(bars2, 1, undefined, [etDay(bars.t[jump] - 100 * 86_400)]);
assert.equal(stale.bigMoves[0].onEarnings, null, 'past the known report dates means unknown');

console.log('test-technicals: ok');
