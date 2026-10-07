/**
 * When a cached Why Today answer gets rewritten. Free, no API calls.
 *
 *   npm run test-why-today-staleness
 */
import assert from 'node:assert/strict';
import { isStale } from '../lib/ai/why-today';

const at = (changePct: number) => ({ text: '', changePct, generatedAt: '' });

// A big day keeps its story: CEG explained at +6% still fits at +9%...
assert.equal(isStale(at(6), 9), false);
// ...but not once the move has more than grown by half.
assert.equal(isStale(at(6), 9.5), true);
assert.equal(isStale(at(12.25), 17), false);
assert.equal(isStale(at(12.25), 18.5), true);

// Small moves keep the 3-point floor.
assert.equal(isStale(at(2.5), 5.4), false);
assert.equal(isStale(at(2.5), 5.6), true);

// A reversal is always a new story, once it is big enough to explain at all.
assert.equal(isStale(at(7.7), -3.1), true);
assert.equal(isStale(at(2.5), -0.4), false);

console.log('why today staleness: ok');
