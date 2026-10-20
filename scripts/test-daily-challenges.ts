/**
 * Asserts for lib/academy/daily-challenges.ts: topic rotation covers every
 * course on consecutive days, and the shuffled-option guard catches
 * "option B" style references. Run: npm run test-daily-challenges
 */
import assert from 'node:assert/strict';
import { topicForDate, POSITIONAL } from '../lib/academy/daily-challenges';

const courses = Array.from({ length: 24 }, (_, i) => ({ title: `C${i}`, difficulty: 'beginner', lessons: ['L0', 'L1', 'L2'] }));
const days = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 9, 20 + i)).toISOString().slice(0, 10));
assert.equal(new Set(days.map((d) => topicForDate(d, courses).course)).size, 24, '24 days hit all 24 courses');
assert.deepEqual(topicForDate('2026-10-20', courses), topicForDate('2026-10-20', courses), 'deterministic per date');
assert.notEqual(topicForDate('2026-10-20', courses).lesson, topicForDate('2026-11-13', courses).lesson, 'next lap moves to the next lesson');

for (const bad of ['Option B does all three', 'the second answer is right', 'Answer 3 is wrong', 'the last choice']) assert.ok(POSITIONAL.test(bad), bad);
for (const ok of ['A stock is ownership', 'Options give you the right to buy', 'The answer is support']) assert.ok(!POSITIONAL.test(ok), ok);

console.log('daily-challenges checks pass');
