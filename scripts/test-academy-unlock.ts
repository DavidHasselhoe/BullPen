/**
 * Checks the Academy order-lock rule (lib/academy/unlock.ts).
 * Run: npx tsx scripts/test-academy-unlock.ts
 */
import assert from 'node:assert/strict';
import { isProgressionLocked, type UnlockCourse } from '../lib/academy/unlock';

const c = (id: string, unit: string, extra: Partial<UnlockCourse> = {}): UnlockCourse => ({
  id, unit_label: unit, requires_pro: false, is_optional: false, ...extra,
});
const path: UnlockCourse[] = [
  c('stock', 'Foundations'),
  c('moves', 'Foundations'),
  c('etfs', 'Foundations', { is_optional: true }),
  c('valuation', 'Valuation', { requires_pro: true }),
  c('statements', 'Valuation', { requires_pro: true }),
  c('taxes', 'Money Matters'),
  c('accounts', 'Money Matters'),
];
const at = (id: string) => path.findIndex((x) => x.id === id);
const locked = (id: string, done: string[], lessons = 0) => isProgressionLocked(path, at(id), new Set(done), lessons);

// New account: only the gateway and the optional course are open.
assert.equal(locked('stock', []), false);
assert.equal(locked('moves', []), true);
assert.equal(locked('etfs', []), false, 'optional is never locked by order');
assert.equal(locked('taxes', []), true, 'chapters wait on the gateway');
// Gateway done: every chapter's first course opens, later ones still chain.
assert.equal(locked('taxes', ['stock']), false);
assert.equal(locked('accounts', ['stock']), true);
assert.equal(locked('accounts', ['stock', 'taxes']), false);
assert.equal(locked('valuation', ['stock']), false, 'Pro chapter opener (Pro is gated separately)');
assert.equal(locked('statements', ['stock']), true);
// Progress from a lesson done elsewhere always opens its course.
assert.equal(locked('accounts', [], 1), false);

console.log('ok - academy unlock');
