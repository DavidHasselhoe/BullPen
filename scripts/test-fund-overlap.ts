/**
 * classifyMove: how a fund's share count, previous filing to latest, reads in
 * the "your stocks in tracked funds" panel.
 *
 *   npm run test-fund-overlap
 */
import assert from 'node:assert/strict';
import { classifyMove } from '../lib/institutions/fund-overlap';

assert.equal(classifyMove(0, 0), null);
assert.deepEqual(classifyMove(0, 500), { status: 'new', pct: null });
assert.deepEqual(classifyMove(500, 0), { status: 'sold_out', pct: null });
// Inside the 1% noise band: odd lots and sub-manager reshuffles, not a decision.
assert.equal(classifyMove(1000, 1005), null);
assert.equal(classifyMove(1000, 995), null);
assert.equal(classifyMove(1000, 1010)?.status, 'increased');
assert.equal(classifyMove(1000, 750)?.status, 'reduced');
assert.equal(classifyMove(1000, 750)?.pct, -25);

console.log('fund overlap: ok');
