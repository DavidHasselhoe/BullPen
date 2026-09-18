/**
 * The arithmetic behind "what would this build do to my risk?": a hypothetical
 * book has to stay a book. Weights must still sum to 100, a proposal that
 * tops up something already owned must land on one line rather than two, and
 * the share asked for must be the share that arrives.
 *
 * Runs against a real account and a real generation, because the failure this
 * guards against (a duplicated symbol, a rescale that quietly loses a few
 * percent) only shows up on a real book.
 *
 * Run: npx tsx scripts/test-risk-scenario.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import assert from 'node:assert/strict';
import { buildRiskScenario, SCENARIO_SHARES } from '../lib/ai/risk-scenario';
import { parseScenarioShare } from '../lib/ai/risk-scenario-shares';
import { loadPositions } from '../lib/holdings/portfolio-positions';
import { createServerClient } from '../lib/supabase/client';

// The QA account, seeded with real positions (see reference-qa-test-account).
const USER = '5de5fba7-f2fa-43d4-8bdd-3ee2b3d77f71';

(async () => {
  // Only the offered sizes are accepted: the share ends up in a prompt.
  assert.equal(parseScenarioShare(10), 10);
  assert.equal(parseScenarioShare('10'), 10);
  assert.equal(parseScenarioShare(7), null, 'an unoffered size must be refused');
  assert.equal(parseScenarioShare('10; drop table'), null);
  assert.equal(parseScenarioShare(undefined), null);

  const supabase = createServerClient();
  const { data: generation } = await supabase
    .from('portfolio_generations')
    .select('id')
    .eq('user_id', USER)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const generationId = (generation as { id: string } | null)?.id;
  assert.ok(generationId, 'test account should have a completed build');

  const { positions } = await loadPositions(USER);
  assert.ok(positions.length > 0, 'test account should have holdings');
  const owned = new Set(positions.map((p) => p.ticker));

  for (const share of SCENARIO_SHARES) {
    const scenario = await buildRiskScenario(USER, generationId, share);
    assert.ok(scenario, `scenario should build at ${share}%`);

    const symbols = scenario.holdings.map((h) => h.symbol);
    assert.equal(new Set(symbols).size, symbols.length, 'a symbol must appear once, not once per source');

    const total = scenario.holdings.reduce((sum, h) => sum + (h.allocation ?? 0), 0);
    assert.ok(Math.abs(total - 100) < 0.5, `weights must still sum to 100, got ${total.toFixed(2)}`);

    // The proposal takes exactly the share it asked for, and no more.
    const proposedWeight = scenario.holdings
      .filter((h) => !owned.has(h.symbol))
      .reduce((sum, h) => sum + (h.allocation ?? 0), 0);
    const expectedNewWeight = (share / (100 + share)) * 100;
    assert.ok(
      proposedWeight <= expectedNewWeight + 0.5,
      `new positions claim ${proposedWeight.toFixed(1)}%, more than the ${expectedNewWeight.toFixed(1)}% asked for`,
    );

    // Everything held keeps its shape: only the scale changes.
    for (const held of positions) {
      const line = scenario.holdings.find((h) => h.symbol === held.ticker);
      assert.ok(line, `held position ${held.ticker} vanished from the scenario`);
      assert.ok(!line.proposed, `${held.ticker} is owned and must not be marked proposed`);
      assert.ok(
        (line.allocation ?? 0) >= held.weightPct * (100 / (100 + share)) - 0.01,
        `${held.ticker} lost weight it should have kept`,
      );
    }

    // No money anywhere: the prompt prints allocations and no total value.
    for (const line of scenario.holdings) {
      assert.equal(line.marketValue, undefined, `${line.symbol} carries an invented value`);
    }
  }

  // Someone else's generation is not a portfolio this user can ask about.
  const notTheirs = await buildRiskScenario('00000000-0000-0000-0000-000000000000', generationId, 10);
  assert.equal(notTheirs, null, 'a generation must not be readable by another user');

  const ten = await buildRiskScenario(USER, generationId, 10);
  console.log(`risk scenario OK — ${ten!.holdings.length} combined lines, ${positions.length} held`);
  console.log(ten!.note);
})();
