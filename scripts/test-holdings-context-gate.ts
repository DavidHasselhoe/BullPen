/**
 * The promise the "Use my holdings as the foundation" toggle makes: with it
 * off, nothing about the investor's portfolio is read, let alone sent to a
 * model. Asserted against a real account that HAS holdings, so a passing run
 * means the gate held, not that there was nothing to leak.
 *
 * Run: npx tsx scripts/test-holdings-context-gate.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import assert from 'node:assert/strict';
import {
  resolveHoldingsBlock,
  composeUserTurn,
  buildHoldingsContext,
} from '../lib/ai/portfolio-builder/holdings-context';

// The QA account, seeded with real positions (see reference-qa-test-account).
const USER_WITH_HOLDINGS = '5de5fba7-f2fa-43d4-8bdd-3ee2b3d77f71';
const THESIS = 'Water infrastructure and desalination capacity.';

(async () => {
  // Precondition: this account really does have holdings to leak.
  const ctx = await buildHoldingsContext(USER_WITH_HOLDINGS);
  assert.ok(ctx && ctx.tickers.length > 0, 'test account should have holdings');

  // Toggle off: no block, and the user turn is the thesis and nothing else.
  const off = await resolveHoldingsBlock(USER_WITH_HOLDINGS, false);
  assert.equal(off, undefined, 'holdings must not be read when the toggle is off');
  const offTurn = composeUserTurn(THESIS, off);
  assert.equal(offTurn, THESIS, 'user turn must be the thesis alone');
  for (const ticker of ctx.tickers) {
    assert.ok(!offTurn.includes(ticker), `"${ticker}" leaked into a toggle-off build`);
  }

  // Toggle on: the block is there, and carries the positions.
  const on = await resolveHoldingsBlock(USER_WITH_HOLDINGS, true);
  assert.ok(on && on.length > 0, 'holdings must be read when the toggle is on');
  const onTurn = composeUserTurn(THESIS, on);
  assert.ok(onTurn.startsWith(THESIS), 'thesis still leads the turn');
  for (const ticker of ctx.tickers) {
    assert.ok(onTurn.includes(ticker), `"${ticker}" missing from a toggle-on build`);
  }
  assert.ok(onTurn.includes('cost basis'), 'weights must be labelled as cost basis');

  console.log(
    `holdings gate OK — ${ctx.tickers.length} positions sent when on, zero when off`,
  );
})();
