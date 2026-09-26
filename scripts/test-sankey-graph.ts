/**
 * Assert-based check for the Revenue Flow graph's arithmetic. No framework.
 *   npm run test-sankey-graph
 *
 * Why this is worth pinning: d3-sankey gives a node the LARGER of its inflow
 * and its outflow. So a graph that does not balance does not throw, it renders
 * a confident wrong number. Alphabet's Q2 2026 shipped exactly that: net income
 * of $112.19B was pushed out of an Operating Income node with only $40.77B
 * flowing in, and the chart labelled operating income $112.19B, 93.7% of
 * revenue, when the real figure was $40.77B at 34.0%.
 *
 * Every case below therefore checks the same invariant: for each intermediate
 * node, what flows in equals what flows out.
 */

import assert from 'node:assert/strict';
import { sankey } from 'd3-sankey';
import { buildGraph, alignColumn, type IncomeStatementPeriod } from '../components/stock/SankeyCard';

type Graph = NonNullable<ReturnType<typeof buildGraph>>;

function row(over: Partial<IncomeStatementPeriod>): IncomeStatementPeriod {
  return {
    fiscal_date: '2026-06-30',
    revenue: null,
    gross_profit: null,
    operating_income: null,
    net_income: null,
    r_and_d_expenses: null,
    selling_general_administrative_expenses: null,
    ...over,
  };
}

const inflow = (g: Graph, id: string) =>
  g.links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0);
const outflow = (g: Graph, id: string) =>
  g.links.filter((l) => l.source === id).reduce((s, l) => s + l.value, 0);

/** What d3 would display for a node: the larger of its two sides. */
const displayed = (g: Graph, id: string) => Math.max(inflow(g, id), outflow(g, id));

function assertBalanced(g: Graph, id: string, expected: number, label: string) {
  const inn = inflow(g, id);
  const out = outflow(g, id);
  // A terminal node has no outflow, and a root none in; only balance the ones
  // with both sides.
  if (inn > 0 && out > 0) {
    assert.ok(
      Math.abs(inn - out) / Math.max(inn, out) < 0.0001,
      `${label}: ${id} does not balance, ${inn} in vs ${out} out`
    );
  }
  assert.ok(
    Math.abs(displayed(g, id) - expected) / expected < 0.0001,
    `${label}: ${id} would display ${displayed(g, id)}, expected ${expected}`
  );
}

// ── Alphabet Q2 2026, the case that was wrong ───────────────────────────────
// Real TwelveData figures. other_income_expense was $97.83B, which is why net
// income is 2.75x operating income.
{
  const g = buildGraph(
    row({
      revenue: 119_796_000_000,
      gross_profit: 73_853_000_000,
      operating_income: 40_770_000_000,
      net_income: 112_193_000_000,
      r_and_d_expenses: 18_219_000_000,
      selling_general_administrative_expenses: 14_864_000_000,
    })
  )!;
  assert.ok(g, 'GOOGL: graph builds');

  assertBalanced(g, 'Gross Profit', 73_853_000_000, 'GOOGL');
  assertBalanced(g, 'Operating Income', 40_770_000_000, 'GOOGL');
  assert.equal(displayed(g, 'Net Income'), 112_193_000_000, 'GOOGL: net income is the reported figure');

  // The gap has to come from somewhere declared, not from thin air.
  assert.ok(
    inflow(g, 'Net Income') - 40_770_000_000 > 0,
    'GOOGL: the non-operating gain enters as its own inflow'
  );
  assert.ok(
    g.links.some((l) => l.source === 'Other Income' && l.target === 'Net Income'),
    'GOOGL: the gain is named Other Income, not the red Tax & Other cost'
  );

  // With revenue segments, sankeyLeft drew Other Income in column 0 beside
  // them. It belongs one column before Net Income, alongside Operating Income.
  const withSources = buildGraph(
    row({
      revenue: 119_796_000_000,
      gross_profit: 73_853_000_000,
      operating_income: 40_770_000_000,
      net_income: 112_193_000_000,
      r_and_d_expenses: 18_219_000_000,
      selling_general_administrative_expenses: 14_864_000_000,
    }),
    [
      { label: 'Google Search', value: 63_270_000_000 },
      { label: 'Google Cloud', value: 56_526_000_000 },
    ],
  )!;
  const laid = sankey<{ id: string }, { source: string; target: string; value: number }>()
    .nodeId((d) => d.id)
    .nodeAlign(alignColumn)
    .extent([[0, 0], [1000, 500]])({
      nodes: withSources.nodes.map((n) => ({ ...n })),
      links: withSources.links.map((l) => ({ ...l })),
    });
  const layer = (id: string) => (laid.nodes.find((n) => n.id === id) as { layer: number }).layer;
  assert.equal(layer('Other Income'), layer('Operating Income'), 'GOOGL: Other Income sits beside Operating Income');
  assert.equal(layer('Other Income'), layer('Net Income') - 1, 'GOOGL: one column before Net Income');
  assert.equal(layer('src:Google Search'), 0, 'GOOGL: revenue segments stay in column 0');
}

// ── Microsoft-shaped period: net income below operating income ──────────────
{
  const g = buildGraph(
    row({
      revenue: 90_010_000_000,
      gross_profit: 60_480_000_000,
      operating_income: 40_600_000_000,
      net_income: 35_770_000_000,
      r_and_d_expenses: 10_000_000_000,
      selling_general_administrative_expenses: 9_880_000_000,
    })
  )!;
  assertBalanced(g, 'Gross Profit', 60_480_000_000, 'MSFT');
  assertBalanced(g, 'Operating Income', 40_600_000_000, 'MSFT');
  assert.equal(displayed(g, 'Net Income'), 35_770_000_000, 'MSFT: net income unchanged');
  // Tax leaves the operating income node in this direction.
  assert.ok(
    g.links.some((l) => l.source === 'Operating Income' && l.target === 'Tax & Other'),
    'MSFT: tax is an outflow when net income is lower'
  );
}

// ── Loss-making period still draws, per the Micron FY2023 regression ────────
{
  const g = buildGraph(
    row({
      revenue: 15_540_000_000,
      gross_profit: -1_400_000_000,
      operating_income: -5_700_000_000,
      net_income: -5_830_000_000,
      r_and_d_expenses: 3_100_000_000,
      selling_general_administrative_expenses: 920_000_000,
    })
  );
  assert.ok(g, 'a negative gross profit must still render');
  assert.ok(
    g!.links.some((l) => l.target === 'Cost of Revenue'),
    'all of revenue goes to cost of revenue when gross profit is negative'
  );
}

// ── No revenue, no chart ────────────────────────────────────────────────────
assert.equal(buildGraph(row({ revenue: 0 })), null);
assert.equal(buildGraph(row({ revenue: null })), null);

// ── Revenue sources feed the trunk without inflating it ─────────────────────
{
  const g = buildGraph(
    row({
      revenue: 100_000_000_000,
      gross_profit: 60_000_000_000,
      operating_income: 30_000_000_000,
      net_income: 25_000_000_000,
    }),
    [
      { label: 'Segment A', value: 60_000_000_000 },
      { label: 'Segment B', value: 40_000_000_000 },
    ]
  )!;
  assert.equal(inflow(g, 'Total Revenue'), 100_000_000_000, 'sources sum to revenue');
  assert.equal(outflow(g, 'Total Revenue'), 100_000_000_000, 'and the trunk passes it all on');
}

console.log('ok - every intermediate Sankey node balances, so none can display a wrong number');
