// Test portfolio health aggregation
// Verifies computePortfolioHealth: value-weighted average across covered
// holdings, uncovered holdings excluded (not zero-filled), and null when
// nothing is covered.

import { computePortfolioHealth, getCategoryContributors, type TickerHealth } from '../lib/finance/portfolio-health';

function fake(score: number, grade: TickerHealth['grade']): TickerHealth {
  return {
    score,
    grade,
    categories: [
      { name: 'Profitability', score: score * 0.3, max: 30, label: 'Test' },
      { name: 'Financial Strength', score: score * 0.25, max: 25, label: 'Test' },
      { name: 'Valuation', score: score * 0.2, max: 20, label: 'Test' },
      { name: 'Growth', score: score * 0.15, max: 15, label: 'Test' },
      { name: 'Market Risk', score: score * 0.1, max: 10, label: 'Test' },
    ],
  };
}

function main() {
  const checks: [string, boolean][] = [];

  const r1 = computePortfolioHealth(
    [{ symbol: 'AAA', marketValue: 100 }, { symbol: 'BBB', marketValue: 100 }],
    new Map([['AAA', fake(80, 'B')], ['BBB', fake(60, 'C')]])
  );
  checks.push(['equal-weight average', r1?.score === 70 && r1?.coveredCount === 2 && r1?.totalCount === 2]);

  const r2 = computePortfolioHealth(
    [{ symbol: 'AAA', marketValue: 100 }, { symbol: 'ZZZ', marketValue: 900 }],
    new Map([['AAA', fake(80, 'B')]])
  );
  checks.push(['uncovered holding excluded, not zero-filled', r2?.score === 80 && r2?.coveredCount === 1 && r2?.totalCount === 2]);

  const r3 = computePortfolioHealth([{ symbol: 'ZZZ', marketValue: 100 }], new Map());
  checks.push(['no coverage returns null', r3 === null]);

  // A holding can have a real aggregate score but no persisted category
  // breakdown yet (categories migration not backfilled — see route.ts's
  // dataAvailable flag). It must not drag category averages toward zero.
  const noCategoriesHolding: TickerHealth = { score: 80, grade: 'B', categories: [] };
  const r4 = computePortfolioHealth(
    [{ symbol: 'AAA', marketValue: 100 }, { symbol: 'BBB', marketValue: 100 }],
    new Map([['AAA', fake(80, 'B')], ['BBB', noCategoriesHolding]])
  );
  const profitability = r4?.categories.find((c) => c.name === 'Profitability');
  checks.push([
    'holding missing categories excluded from category weighting, not zero-filled',
    r4?.score === 80 && profitability?.score === 24 && profitability?.dataAvailable !== false,
  ]);

  const contributors = getCategoryContributors(
    'Profitability',
    [{ symbol: 'AAA', marketValue: 100 }, { symbol: 'BBB', marketValue: 300 }, { symbol: 'CCC', marketValue: 100 }],
    new Map([['AAA', fake(60, 'C')], ['BBB', fake(90, 'A')], ['CCC', noCategoriesHolding]])
  );
  checks.push([
    'contributors sorted best-first, missing-category holding excluded',
    contributors.length === 2 && contributors[0].symbol === 'BBB' && contributors[1].symbol === 'AAA',
  ]);

  const pass = checks.every(([, ok]) => ok);
  for (const [name, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${name}`);
  process.exit(pass ? 0 : 1);
}

main();
