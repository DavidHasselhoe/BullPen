/**
 * Self-check for the Financial Health Score method (lib/finance/health-score.ts).
 * Pure, no network, no credits. Each case is a rule method 1 got wrong.
 *
 *   npm run test-health-score
 */

import assert from 'node:assert/strict';
import { computeHealthScore, healthColumns } from '../lib/finance/health-score';
import type { CompanyStatistics, IncomeStatementPeriod, BalanceSheetPeriod, CashFlowPeriod } from '../lib/twelvedata/twelvedata-client';

const stats = (o: Partial<CompanyStatistics> = {}): CompanyStatistics => ({
  symbol: 'T', marketCap: null, enterpriseValue: null, peRatioTTM: null, peRatioForward: null, pbRatio: null,
  evToEbitda: null, psRatio: null, beta: 0.8, week52High: null, week52Low: null, avgVolume: null, sharesFloat: null,
  shortRatio: null, dividendYield: null, profitMargin: null, revenueGrowthTTM: 0.06, epsGrowthTTM: 0.06, ...o,
});
const q = (o: Partial<IncomeStatementPeriod> = {}): IncomeStatementPeriod => ({
  fiscal_date: '2026-06-30', fiscal_quarter: null, fiscal_year: null, revenue: 100, gross_profit: 60,
  operating_income: 30, net_income: 22, ebitda: 35, eps_basic: null, eps_diluted: null, r_and_d_expenses: null,
  selling_general_administrative_expenses: null, interest_expense: 2, income_tax_expense: 5, ...o,
} as IncomeStatementPeriod);
const bs = (o: Partial<BalanceSheetPeriod> = {}): BalanceSheetPeriod => ({
  fiscal_date: '2026-06-30', total_assets: 1000, total_current_assets: 300, cash_and_equivalents: 100,
  total_liabilities: 500, total_current_liabilities: 200, long_term_debt: 150, total_stockholders_equity: 500,
  retained_earnings: null, goodwill_and_intangible_assets: null, ...o,
});
const cf = (o: Partial<CashFlowPeriod> = {}): CashFlowPeriod =>
  ({ fiscal_date: '2026-06-30', operating_cash_flow: 28, capital_expenditures: -6, free_cash_flow: 22, ...o } as CashFlowPeriod);
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

// Losing money, burning cash and heavily indebted is an F.
const weak = computeHealthScore(
  stats({ beta: 2.4, revenueGrowthTTM: -0.1, epsGrowthTTM: -0.5 }),
  four(() => q({ operating_income: -10, net_income: -15, ebitda: -5 })),
  [bs({ long_term_debt: 800, cash_and_equivalents: 20, total_current_assets: 100, total_current_liabilities: 200 })],
  four(() => cf({ operating_cash_flow: -8, free_cash_flow: -20 })),
);
assert.equal(weak.grade, 'F', `weak company should be F, got ${weak.score}`);

console.log('health score self-check: all passed');
