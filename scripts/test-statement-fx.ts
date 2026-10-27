/**
 * Guards the USD conversion of foreign-currency statements (lib/currency/statement-fx.ts).
 *
 * Run: npm run test-statement-fx
 *
 * TSM reports in TWD and its Financials card showed TWD 1.27T of revenue as
 * "$1.27T". Money fields must be divided by the rate; the fiscal period
 * numbers must not, and neither may anything derived as a ratio.
 */

import assert from 'node:assert/strict';
import { rowsToUsd, valuationFromStatements } from '../lib/currency/statement-fx';

const fx = { from: 'TWD', rate: 32, date: '2026-10-27' };
const q2 = {
  fiscal_date: '2026-06-30', fiscal_quarter: 2, fiscal_year: 2026,
  revenue: 1_270e9, net_income: 706.78e9, eps_diluted: 136.25, interest_expense: -3.09e9,
  ebitda: null, reported_currency: 'TWD',
};
const q1 = { ...q2, fiscal_date: '2026-03-31', fiscal_quarter: 1, revenue: 1_130e9, net_income: 572.8e9 };

const [usd2, usd1] = rowsToUsd([q2, q1], fx);

assert.equal(usd2.revenue, 1_270e9 / 32, 'revenue converted');
assert.equal(usd2.eps_diluted, 136.25 / 32, 'EPS is per-share money, converted');
assert.equal(usd2.interest_expense, -3.09e9 / 32, 'negative amounts keep their sign');
assert.equal(usd2.ebitda, null, 'missing values stay missing');
assert.equal(usd2.fiscal_quarter, 2, 'fiscal quarter is not money');
assert.equal(usd2.fiscal_year, 2026, 'fiscal year is not money');
assert.equal(usd2.fiscal_date, '2026-06-30');
assert.equal(usd2.reported_currency, 'USD', 'rows say what they are now in');
assert.equal(q2.revenue, 1_270e9, 'input rows untouched (they are the cached TwelveData rows)');

// One rate for every period: margins and growth come out exactly as reported.
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
close(usd2.net_income! / usd2.revenue!, q2.net_income / q2.revenue);
close(usd2.revenue! / usd1.revenue! - 1, q2.revenue / q1.revenue - 1);

// Balance-sheet rows from before they carried a currency have no field to flip.
const [bal] = rowsToUsd([{ fiscal_date: '2026-06-30', total_assets: 64e9 }], fx);
assert.equal(bal.total_assets, 2e9);
assert.ok(!('reported_currency' in bal));

// Valuation ratios from a USD market cap and converted statements. TwelveData
// gave TSM a P/S of 0.45 (USD cap over TWD revenue); built from totals it is ~14.5.
const tsmQ = (revenue: number, ebitda: number | null) => ({ revenue, ebitda });
const tsmIncome = rowsToUsd([tsmQ(1_270e9, 999e9), tsmQ(1_134e9, 855e9), tsmQ(1_050e9, 760e9), tsmQ(986e9, 690e9)], fx);
const tsmBalance = rowsToUsd([{ total_stockholders_equity: 6_400e9, long_term_debt: 896e9, cash_and_equivalents: 3_136e9 }], fx);
const val = valuationFromStatements(2_200e9, tsmIncome, tsmBalance);
close(val.price_to_sales_ttm!, 2_200e9 / (4_440e9 / 32));
close(val.price_to_book_mrq!, 2_200e9 / 200e9);
close(val.enterprise_value!, 2_200e9 + 28e9 - 98e9);
close(val.enterprise_to_ebitda!, (2_200e9 + 28e9 - 98e9) / (3_304e9 / 32));

// Too little history for a TTM figure, or nothing to divide by: null, never a guess.
const short = valuationFromStatements(2_200e9, tsmIncome.slice(0, 3), []);
assert.equal(short.price_to_sales_ttm, null, 'three quarters is not a year');
assert.equal(short.enterprise_value, null, 'no balance sheet, no EV');
assert.equal(short.price_to_book_mrq, null);
const gap = valuationFromStatements(2_200e9, [...tsmIncome.slice(0, 3), tsmQ(30e9, null)], tsmBalance);
assert.equal(gap.enterprise_to_ebitda, null, 'a missing EBITDA quarter means no TTM EBITDA');
assert.ok(gap.price_to_sales_ttm! > 0, 'revenue TTM still stands');
assert.equal(valuationFromStatements(null, tsmIncome, tsmBalance).price_to_sales_ttm, null, 'no market cap, no ratios');

console.log('statement-fx: all checks passed');
