/**
 * The selector's judgement, against real captured filings.
 *
 * Every case here is a mistake an earlier version of this code actually made:
 * reading last year's figures because the duration matched, summing a rollup
 * parent with its children, showing geography because it reconciled, or
 * emitting two parts with the same label.
 *
 * Run: npm run test-segment-selection
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { selectBreakdown, cleanLabel } from '../lib/segments/select-breakdown';
import type { FilingFacts, RevenueFact } from '../lib/segments/edgar-facts';

const load = (t: string) =>
  JSON.parse(readFileSync(`scripts/segment-fixtures/${t}.json`, 'utf8')) as FilingFacts;
const sum = (parts: { value: number }[]) => parts.reduce((s, p) => s + p.value, 0);

function run(ticker: string, consolidated: number) {
  const filing = load(ticker);
  const breakdown = selectBreakdown(filing.facts, {
    consolidated,
    periodEnd: filing.periodEnd,
    periodDays: 365,
  });
  return { filing, breakdown };
}

// Apple: products, not its geographic reportable segments, and THIS year's.
{
  const { breakdown } = run('AAPL', 416_161_000_000);
  assert.ok(breakdown, 'AAPL should produce a breakdown');
  assert.equal(breakdown.basis, 'product');
  const labels = breakdown.parts.map((p) => p.label);
  assert.ok(labels.includes('iPhone'), `expected iPhone, got ${labels.join(', ')}`);
  assert.ok(
    !labels.some((l) => /Americas|Europe|Greater China/.test(l)),
    'geography must never be used',
  );
  assert.ok(!labels.includes('Product'), 'the tagged rollup parent leaked into the parts');

  // The year-mixing bug: FY2024 iPhone was 200.58B, FY2025 is 209.586B.
  const iPhone = breakdown.parts.find((p) => p.label === 'iPhone');
  assert.equal(iPhone?.value, 209_586_000_000, 'iPhone must be the filing period, not a comparative');
  assert.equal(sum(breakdown.parts), 416_161_000_000, 'Apple reconciles exactly');
}

// NVIDIA: Data Center is the sum of Compute and Networking. Keep one level.
{
  const { breakdown } = run('NVDA', 215_938_000_000);
  assert.ok(breakdown, 'NVDA should produce a breakdown');
  const labels = breakdown.parts.map((p) => p.label);
  const hasParent = labels.includes('Data Center');
  const hasChildren = labels.includes('Compute') && labels.includes('Networking');
  assert.ok(hasParent !== hasChildren, 'must keep either the parent or its children, never both');
  assert.ok(
    Math.abs(sum(breakdown.parts) - 215_938_000_000) / 215_938_000_000 < 0.01,
    'NVDA parts must reconcile',
  );
}

// Alphabet: the nested expansion, which is the whole reason it is worth doing.
{
  const { breakdown } = run('GOOGL', 402_836_000_000);
  assert.ok(breakdown, 'GOOGL should produce a breakdown');
  const labels = breakdown.parts.map((p) => p.label);
  assert.ok(labels.some((l) => /Search/.test(l)), `expected a Search part, got ${labels.join(', ')}`);
  assert.ok(labels.some((l) => /YouTube/.test(l)), 'expected a YouTube part');
  assert.ok(labels.some((l) => /Cloud/.test(l)), 'Cloud must survive alongside the expanded parts');
  assert.ok(
    Math.abs(sum(breakdown.parts) - 402_836_000_000) / 402_836_000_000 < 0.01,
    'GOOGL parts must reconcile',
  );
}

// Walmart: its categories repeat across segments, so the expansion is refused
// and the three real segments are used instead.
{
  const { breakdown } = run('WMT', 713_163_000_000);
  assert.ok(breakdown, 'WMT should produce a breakdown');
  const labels = breakdown.parts.map((p) => p.label);
  assert.equal(new Set(labels).size, labels.length, 'no two parts may share a label');
  assert.ok(labels.includes('Walmart US'), `expected the segments, got ${labels.join(', ')}`);
  assert.ok(!labels.includes('Grocery'), 'a colliding expansion must be refused');
}

// Micron: products, because its segment names are CMBU and AEBU.
{
  const { breakdown } = run('MU', 37_378_000_000);
  assert.ok(breakdown, 'MU should produce a breakdown');
  assert.equal(breakdown.basis, 'product');
  const labels = breakdown.parts.map((p) => p.label);
  assert.ok(labels.some((l) => /DRAM/.test(l)), `expected DRAM, got ${labels.join(', ')}`);
  assert.ok(!labels.some((l) => /BU$/.test(l)), 'the acronym segments must not be shown');
}

// Every breakdown must be safe to use as graph node ids.
for (const [ticker, consolidated] of [
  ['AAPL', 416_161_000_000],
  ['WMT', 713_163_000_000],
  ['MU', 37_378_000_000],
  ['GOOGL', 402_836_000_000],
  ['NVDA', 215_938_000_000],
] as Array<[string, number]>) {
  const { breakdown } = run(ticker, consolidated);
  if (!breakdown) continue;
  for (const part of breakdown.parts) {
    assert.ok(part.label.trim().length > 0, `${ticker} produced an empty label`);
    assert.ok(part.value > 0, `${ticker} produced a non-positive part`);
  }
  assert.equal(
    new Set(breakdown.parts.map((p) => p.label)).size,
    breakdown.parts.length,
    `${ticker} produced duplicate labels`,
  );
}

// Synthetic cases, for the rules no real filer in the fixture set exercises.
const fact = (axis: string, member: string, value: number): RevenueFact => ({
  members: [{ axis, member }],
  value,
  durationDays: 365,
  end: '2025-12-31',
});
const opts = { consolidated: 100, periodEnd: '2025-12-31', periodDays: 365 };

assert.equal(
  selectBreakdown(
    [fact('StatementGeographicalAxis', 'US', 70), fact('StatementGeographicalAxis', 'NonUsMember', 30)],
    opts,
  ),
  null,
  'geography alone must never produce a breakdown',
);

assert.equal(
  selectBreakdown([fact('ProductOrServiceAxis', 'OnlyThingMember', 100)], opts),
  null,
  'one part is not a breakdown',
);

assert.equal(
  selectBreakdown(
    [fact('ProductOrServiceAxis', 'AMember', 30), fact('ProductOrServiceAxis', 'BMember', 20)],
    opts,
  ),
  null,
  'parts summing to half of revenue must be refused',
);

// A prior year's facts are present in every filing and must be ignored.
assert.equal(
  selectBreakdown(
    [
      { ...fact('ProductOrServiceAxis', 'AMember', 60), end: '2024-12-31' },
      { ...fact('ProductOrServiceAxis', 'BMember', 40), end: '2024-12-31' },
    ],
    opts,
  ),
  null,
  'facts from another period must be ignored entirely',
);

// A small positive remainder becomes an explicit Other, never a silent gap.
{
  const withResidual = selectBreakdown(
    [fact('ProductOrServiceAxis', 'AMember', 60), fact('ProductOrServiceAxis', 'BMember', 39.5)],
    opts,
  );
  assert.ok(withResidual, 'a 0.5% remainder is within tolerance');
  const other = withResidual.parts.find((p) => p.label === 'Other');
  assert.ok(other && Math.abs(other.value - 0.5) < 1e-9, 'the remainder must be drawn as Other');
}

assert.equal(cleanLabel('IPhoneMember'), 'iPhone');
assert.equal(cleanLabel('IPadMember'), 'iPad');
assert.equal(cleanLabel('DRAMProductsMember'), 'DRAM Products');
assert.equal(cleanLabel('HealthandWellnessMember'), 'Health and Wellness');
assert.equal(cleanLabel('WearablesHomeandAccessoriesMember'), 'Wearables Home and Accessories');
assert.equal(cleanLabel('YouTubeAdvertisingRevenueMember'), 'YouTube Advertising');
assert.equal(cleanLabel('DataCenterMember'), 'Data Center');
assert.equal(cleanLabel('WalmartUSMember'), 'Walmart US');
assert.equal(cleanLabel('ComputeAndNetworkingSegmentMember'), 'Compute And Networking');

console.log('segment selection OK');
