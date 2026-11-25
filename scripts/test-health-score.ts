/**
 * Self-check for the Financial Health Score method (lib/finance/health-score.ts).
 * Pure, no network, no credits. Each case is a rule method 1 got wrong.
 *
 *   npm run test-health-score
 */

import assert from 'node:assert/strict';
import { computeHealthScore, crossedGradeWithBuffer, healthColumns } from '../lib/finance/health-score';
import { quarterDriver, comparablePillars } from '../lib/finance/health-score-history';
import type { CompanyStatistics, IncomeStatementPeriod, BalanceSheetPeriod, CashFlowPeriod } from '../lib/twelvedata/twelvedata-client';

// Statements must be recent to count (health-score.ts trailingYear), so fixtures sit two months back.
const RECENT = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
const monthsAgo = (m: number) => new Date(Date.now() - m * 30.5 * 86_400_000).toISOString().slice(0, 10);
const stats = (o: Partial<CompanyStatistics> = {}): CompanyStatistics => ({
  symbol: 'T', marketCap: null, enterpriseValue: null, peRatioTTM: null, peRatioForward: null, pbRatio: null,
  evToEbitda: null, psRatio: null, beta: 0.8, week52High: null, week52Low: null, avgVolume: null, sharesFloat: null,
  shortRatio: null, dividendYield: null, profitMargin: null, revenueGrowthTTM: 0.06, epsGrowthTTM: 0.06, ...o,
});
const q = (o: Partial<IncomeStatementPeriod> = {}): IncomeStatementPeriod => ({
  fiscal_date: RECENT, fiscal_quarter: null, fiscal_year: null, revenue: 100, gross_profit: 60,
  operating_income: 30, net_income: 22, ebitda: 35, eps_basic: null, eps_diluted: null, r_and_d_expenses: null,
  selling_general_administrative_expenses: null, interest_expense: 2, income_tax_expense: 5, ...o,
} as IncomeStatementPeriod);
const bs = (o: Partial<BalanceSheetPeriod> = {}): BalanceSheetPeriod => ({
  fiscal_date: RECENT, total_assets: 1000, total_current_assets: 300, cash_and_equivalents: 100,
  total_liabilities: 500, total_current_liabilities: 200, long_term_debt: 150, total_stockholders_equity: 500,
  retained_earnings: null, goodwill_and_intangible_assets: null, ...o,
});
const cf = (o: Partial<CashFlowPeriod> = {}): CashFlowPeriod =>
  ({ fiscal_date: RECENT, operating_cash_flow: 28, capital_expenditures: -6, free_cash_flow: 22, ...o } as CashFlowPeriod);
const four = <T>(f: () => T) => [f(), f(), f(), f()];
const cat = (hs: ReturnType<typeof computeHealthScore>, name: string) => hs.categories.find((c) => c.name === name)!;

// A steady, profitable, lightly indebted company is an A.
const solid = computeHealthScore(stats(), four(() => q()), [bs()], four(() => cf()));
assert.equal(solid.grade, 'A', `solid company should be A, got ${solid.score}`);

// Price plays no part: the same company at P/E 80 scores the same as at P/E 10.
const pricey = computeHealthScore(stats({ peRatioTTM: 80, pbRatio: 30 }), four(() => q()), [bs()], four(() => cf()));
const cheap = computeHealthScore(stats({ peRatioTTM: 10, pbRatio: 1 }), four(() => q()), [bs()], four(() => cf()));
assert.equal(pricey.score, cheap.score, 'valuation must not move the score');
assert.ok(cheap.valuation > pricey.valuation, 'valuation is still reported separately');

// Low beta is not a risk.
assert.equal(cat(solid, 'Market Risk').score, 10, 'a calm, always-profitable stock gets full Market Risk');

// No beta is no data, not the calmest stock: SNDK (beta ~2, listed 2025) scored 10/10 on profits alone.
const noBeta = computeHealthScore(stats({ beta: null }), four(() => q()), [bs()], four(() => cf()));
assert.equal(cat(noBeta, 'Market Risk').dataAvailable, false, 'missing beta leaves the pillar out');

// One blank quarter is annualised, not a dropped metric (Amazon's latest quarter had no operating income).
const gap = computeHealthScore(stats(), [q({ operating_income: null }), q(), q(), q()], [bs()], four(() => cf()));
assert.equal(cat(gap, 'Financial Strength').score, cat(solid, 'Financial Strength').score, 'missing quarter annualised');

// A bank's deposits are not debt: 8% equity/assets with no current split is a sound bank.
const bank = computeHealthScore(
  stats(), four(() => q({ revenue: 100, net_income: 25, operating_income: null, ebitda: null, interest_expense: 40 })),
  [bs({ total_assets: 10000, total_liabilities: 9200, total_stockholders_equity: 800, total_current_assets: null, total_current_liabilities: null })], [],
);
assert.ok(cat(bank, 'Financial Strength').score >= 20, `bank strength should be high, got ${cat(bank, 'Financial Strength').score}`);
assert.equal(cat(bank, 'Cash Flow').dataAvailable, false, 'bank cash flow is not scored');

// A utility's normal leverage (5x net debt/EBITDA, 2.5x coverage) is not distress in its sector.
const utility = (sector: string) => computeHealthScore(
  stats(), four(() => q({ operating_income: 25, ebitda: 40, interest_expense: 10 })),
  [bs({ long_term_debt: 900, cash_and_equivalents: 100, total_current_assets: 150, total_current_liabilities: 220 })],
  four(() => cf()), { sector },
);
const asUtility = utility('Utilities');
const asOther = utility('Technology');
assert.ok(cat(asUtility, 'Financial Strength').score > cat(asOther, 'Financial Strength').score, 'utilities get a sector leverage bar');

// With no balance sheet and no cash flow statement there is no score, not an F.
const bare = computeHealthScore(stats({ profitMargin: 0.2 }), [], [], []);
assert.equal(bare.insufficientData, true);
assert.equal(healthColumns(bare).health_score, null, 'insufficient data stores a null score');

// Gold Fields: TwelveData's "quarterly" income and cash flow rows were from 2015-2018,
// and its Cash Flow pillar scored 20/20 on them. Old statements count for nothing.
const old = (y: number) => `${y}-06-30`;
const stale = computeHealthScore(
  stats({ profitMargin: 0.39 }),
  [2018, 2017, 2016, 2015].map((y) => q({ fiscal_date: old(y) })),
  [bs()],
  [2015, 2015, 2015, 2015].map((y) => cf({ fiscal_date: old(y) })),
);
assert.equal(cat(stale, 'Cash Flow').dataAvailable, false, 'decade-old cash flows are not scored');
assert.equal(cat(stale, 'Profitability').inputs?.netMargin, 0.39, 'margin falls back to the current TTM figure');
assert.ok(!stale.summary.includes('cash'), `no Cash Flow data, so the summary makes no cash claim: "${stale.summary}"`);
const staleBalance = computeHealthScore(stats(), four(() => q()), [bs({ fiscal_date: old(2015) })], four(() => cf()));
assert.equal(cat(staleBalance, 'Financial Strength').dataAvailable, false, 'a 2015 balance sheet is not today\'s');

// A twice-a-year filer's last four halves are two years, not a trailing year.
const halves = [0, 6, 12, 18].map((m) => cf({ fiscal_date: monthsAgo(m + 2), operating_cash_flow: 50, free_cash_flow: 40 }));
const semi = computeHealthScore(stats(), [], [bs()], halves);
assert.equal(cat(semi, 'Cash Flow').dataAvailable, false, 'half-year rows are not summed as four quarters');

// Losing money, burning cash and heavily indebted is an F.
const weak = computeHealthScore(
  stats({ beta: 2.4, revenueGrowthTTM: -0.1, epsGrowthTTM: -0.5 }),
  four(() => q({ operating_income: -10, net_income: -15, ebitda: -5 })),
  [bs({ long_term_debt: 800, cash_and_equivalents: 20, total_current_assets: 100, total_current_liabilities: 200 })],
  four(() => cf({ operating_cash_flow: -8, free_cash_flow: -20 })),
);
assert.equal(weak.grade, 'F', `weak company should be F, got ${weak.score}`);

// Grade alerts need a 2-point margin past the cut-off (A starts at 85):
// GOOGL sat at exactly 85, one wobble from "dropped to B" then "improved to A".
assert.equal(crossedGradeWithBuffer(85, 84), false, 'A to B by one point is a wobble');
assert.equal(crossedGradeWithBuffer(85, 83), false, 'still within the margin');
assert.equal(crossedGradeWithBuffer(85, 82), true, 'three points under the line is a real B');
assert.equal(crossedGradeWithBuffer(84, 86), false, 'B to A by a point is a wobble');
assert.equal(crossedGradeWithBuffer(84, 87), true, 'clearly back in A');
assert.equal(crossedGradeWithBuffer(92, 85), false, 'same grade never alerts');
assert.equal(crossedGradeWithBuffer(90, 60), true, 'a multi-grade fall alerts');

// The quarterly alert names the category that moved most with the total:
// GOOGL Q2 -> Q3 fell 92 -> 85, Growth 15 -> 9 and Cash Flow 14 -> 13.
const c = (name: string, score: number) => ({ name, score, max: 20, label: '' });
const q2 = [c('Profitability', 30), c('Cash Flow', 14), c('Growth', 15), c('Market Risk', 9)];
const q3 = [c('Profitability', 30), c('Cash Flow', 13), c('Growth', 9), c('Market Risk', 9)];
assert.equal(quarterDriver(q2, q3, -7), 'Growth');
assert.equal(quarterDriver(q3, q2, 7), 'Growth', 'works upward too');
assert.equal(quarterDriver(q2, q2, -5), null, 'nothing moved, no driver');
// A pillar losing its data (no beta since 2026-11-17) makes two quarters incomparable.
const noStability = q3.map((c) => (c.name === 'Market Risk' ? { ...c, score: 0, dataAvailable: false } : c));
assert.notEqual(comparablePillars(q2), comparablePillars(noStability), 'pillar set changed, not comparable');
assert.equal(comparablePillars(q2), comparablePillars(q3), 'same pillars, comparable');
assert.equal(comparablePillars(q2), comparablePillars(q2.map((x) => ({ ...x, dataAvailable: true }))), 'old snapshots without the field count every pillar');

console.log('health score self-check: all passed');
