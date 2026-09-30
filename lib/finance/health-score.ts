/**
 * Financial Health Score, method 2 (2026-09-30).
 *
 * Answers one question: is this a financially sound business? It is a
 * quality-and-safety score, not a "should I buy it" score, so the share price
 * plays no part. Pure function, no API calls.
 *
 *   Profitability       30  profitable over the year, net margin, return on assets
 *   Financial Strength  25  interest coverage, net debt / EBITDA, liquidity
 *                           (banks: equity / assets, since deposits read as debt)
 *   Cash Flow           20  operating and free cash flow, cash backing earnings,
 *                           free cash flow margin
 *   Growth              15  revenue and EPS growth
 *   Market Risk         10  high volatility, earnings consistency
 *
 * Why method 1 was replaced (measured across 2,801 stocks, 2026-09-30):
 * - 53% of stocks graded F; Visa, Walmart, P&G and Coca-Cola scored C/D while
 *   gold miners on a price windfall topped the market at 94-98.
 * - Valuation was 20% of "health", so quality (which usually trades at a
 *   premium) was marked down for its price. Piotroski's F-Score, MSCI's
 *   quality factor and Simply Wall St's health checks all leave price out.
 * - Revenue growth was counted twice (Profitability and Growth).
 * - Low beta lost points, so stable defensives were scored as risky.
 * - A current ratio above 2 was required for full marks, and negative equity
 *   from buybacks (McDonald's, Lowe's) read as a red flag; banks, whose
 *   deposits look like debt, scored 3-5 of 25 on strength.
 * - Single-quarter figures stood in for the year, and missing statements
 *   scored zero, so data coverage moved the score.
 *
 * Data: the latest four quarterly statements (trailing twelve months where a
 * metric needs a year) plus TwelveData /statistics. A pillar with no usable
 * inputs is left out and the total re-weighted over the pillars that have
 * data, rather than counting missing data as a failure.
 */

import type {
  CompanyStatistics,
  IncomeStatementPeriod,
  BalanceSheetPeriod,
  CashFlowPeriod,
} from '@/lib/twelvedata/twelvedata-client';

/** Stored alongside every score and history snapshot. Bump when the method changes. */
export const HEALTH_SCORE_METHOD = 2;

/** The five pillars in display order, with their screener_stats column. */
export const HEALTH_CATEGORIES = [
  { name: 'Profitability', max: 30, column: 'health_profitability' },
  { name: 'Financial Strength', max: 25, column: 'health_financial_strength' },
  { name: 'Cash Flow', max: 20, column: 'health_cash_flow' },
  { name: 'Growth', max: 15, column: 'health_growth' },
  { name: 'Market Risk', max: 10, column: 'health_market_risk' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type SignalValue = 'positive' | 'neutral' | 'negative';

export interface CategoryScore {
  name: string;
  score: number;
  max: number;
  /** Plain-English label for this category's performance */
  label: string;
  /** False when the underlying data was unavailable: the pillar is left out of the total. */
  dataAvailable?: boolean;
}

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface HealthScore {
  /** Aggregate score 0–100 */
  score: number;
  /** Letter grade */
  grade: HealthGrade;
  /** One-word summary */
  label: string;
  /** One-sentence plain-English summary for beginners */
  summary: string;
  /** Breakdown by category */
  categories: CategoryScore[];
  /**
   * Per-metric signals keyed by CompanyStatistics field name, only for metrics
   * the score actually uses (the Key Numbers chips say "counts in the Health
   * Score", so a metric that does not count must not get one).
   */
  metricSignals: Record<string, SignalValue>;
  /**
   * How cheap the stock looks, 0-20. NOT part of the score: kept for the
   * theme "Value" sort (screener_stats.health_valuation).
   */
  valuation: number;
  method: number;
  /**
   * Neither Financial Strength nor Cash Flow had data (no balance sheet or
   * cash flow statement). A score from margins and growth alone ignores debt
   * entirely, so writers store no score rather than a guess.
   */
  insufficientData: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function catLabel(score: number, max: number): string {
  const ratio = max > 0 ? score / max : 0;
  if (ratio >= 0.8) return 'Excellent';
  if (ratio >= 0.6) return 'Good';
  if (ratio >= 0.4) return 'Fair';
  return 'Weak';
}

/** Same thresholds computeHealthScore uses for a full report's grade — the
 *  one place to convert a bare 0-100 score (e.g. a theme basket's average)
 *  into the letter grade HealthRing needs to color itself correctly. */
export function scoreToGrade(score: number): HealthGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * A year of a quarterly figure: the latest four quarters summed or, when one
 * of them lacks the field, the other three annualised. TwelveData often
 * leaves one quarter's line blank (Amazon's latest quarter had no operating
 * income), and requiring all four dropped whole metrics.
 */
function ttm<T>(rows: T[], get: (r: T) => number | null | undefined): number | null {
  const vals = rows
    .slice(0, 4)
    .map(get)
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length < 3) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return vals.length === 4 ? sum : (sum / vals.length) * 4;
}

/** Points earned out of points that had data, per pillar. */
class Tally {
  points = 0;
  possible = 0;
  add(max: number, earned: number) {
    this.possible += max;
    this.points += Math.max(0, Math.min(max, earned));
  }
  scaled(max: number): number {
    return this.possible > 0 ? Math.round((this.points / this.possible) * max) : 0;
  }
  get available() {
    return this.possible > 0;
  }
}

function tier(value: number, steps: [number, number][], otherwise = 0): number {
  for (const [atLeast, pts] of steps) if (value >= atLeast) return pts;
  return otherwise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived fundamentals
// ─────────────────────────────────────────────────────────────────────────────

interface Fundamentals {
  revenue: number | null;
  netIncome: number | null;
  operatingIncome: number | null;
  ebitda: number | null;
  interest: number | null;
  ocf: number | null;
  fcf: number | null;
  /** Share of the last four quarters (3+ reported) that were profitable, 0-1. */
  profitableQuarters: number | null;
  /** Operating income, or pre-tax profit plus interest when TD has no operating line (insurers, Berkshire). */
  ebit: number | null;
  b: BalanceSheetPeriod | undefined;
  /**
   * Mostly liabilities, with no current/non-current split or a financial
   * sector: banks and brokers. Deposits read as debt and interest expense is
   * their cost of goods, so leverage and coverage need their own measures.
   */
  bankLike: boolean;
  /** Regulated, asset-heavy sectors where high leverage is the normal, financed-by-design state. */
  heavyAssets: boolean;
}

const HEAVY_ASSET_SECTORS = new Set(['Utilities', 'Real Estate']);

function fundamentals(
  income: IncomeStatementPeriod[],
  balance: BalanceSheetPeriod[],
  cashflow: CashFlowPeriod[],
  sector: string | null,
): Fundamentals {
  const b = balance.find((r) => r.total_assets != null) ?? balance[0];
  const liabilitiesShare =
    b?.total_assets != null && b.total_liabilities != null && b.total_assets > 0
      ? b.total_liabilities / b.total_assets
      : null;
  const bankLike =
    liabilitiesShare != null &&
    liabilitiesShare > 0.85 &&
    ((b!.total_current_assets == null && b!.total_current_liabilities == null) || sector === 'Financial Services');

  const fcfDirect = ttm(cashflow, (c) => c.free_cash_flow);
  const ocf = ttm(cashflow, (c) => c.operating_cash_flow);
  const capex = ttm(cashflow, (c) => c.capital_expenditures);

  const netIncome = ttm(income, (q) => q.net_income);
  const operatingIncome = ttm(income, (q) => q.operating_income);
  // Missing interest expense usually means none was reported.
  const interest = income.length >= 3 ? ttm(income, (q) => q.interest_expense ?? 0) : null;
  const tax = ttm(income, (q) => q.income_tax_expense);
  const quarters = income.slice(0, 4).filter((q) => q.net_income != null);
  return {
    revenue: ttm(income, (q) => q.revenue),
    netIncome,
    operatingIncome,
    ebitda: ttm(income, (q) => q.ebitda),
    interest,
    ebit: operatingIncome ?? (netIncome != null && interest != null ? netIncome + (tax ?? 0) + Math.abs(interest) : null),
    ocf,
    // capex is reported negative; FCF = OCF + capex when TD omits the FCF line.
    fcf: fcfDirect ?? (ocf != null && capex != null ? ocf + capex : null),
    profitableQuarters: quarters.length >= 3 ? quarters.filter((q) => q.net_income! > 0).length / quarters.length : null,
    b,
    bankLike,
    heavyAssets: sector != null && HEAVY_ASSET_SECTORS.has(sector),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pillars
// ─────────────────────────────────────────────────────────────────────────────

type Signals = Record<string, SignalValue>;

function scoreProfitability(stats: CompanyStatistics, f: Fundamentals, signals: Signals): Tally {
  const t = new Tally();

  // Profitable over the last year (8)
  const annualProfit = f.netIncome ?? (stats.profitMargin != null ? stats.profitMargin : null);
  if (annualProfit != null) t.add(8, annualProfit > 0 ? 8 : 0);

  // Net margin (10): statements first, TwelveData's TTM figure otherwise
  const margin =
    f.netIncome != null && f.revenue != null && f.revenue > 0 ? f.netIncome / f.revenue : stats.profitMargin;
  if (margin != null) {
    const pts = tier(margin, [[0.25, 10], [0.15, 8], [0.08, 5], [0.03, 3], [0.0001, 1]]);
    t.add(10, pts);
    signals.profitMargin = pts >= 8 ? 'positive' : pts >= 3 ? 'neutral' : 'negative';
  }

  // Return on assets (12). Banks run on thin assets returns, so their bar is lower.
  if (f.netIncome != null && f.b?.total_assets != null && f.b.total_assets > 0) {
    const roa = f.netIncome / f.b.total_assets;
    t.add(12, f.bankLike
      ? tier(roa, [[0.015, 12], [0.011, 10], [0.008, 7], [0.004, 4], [0.0001, 2]])
      : tier(roa, [[0.12, 12], [0.08, 10], [0.05, 7], [0.02, 4], [0.0001, 2]]));
  }
  return t;
}

function scoreFinancialStrength(f: Fundamentals, signals: Signals): Tally {
  const t = new Tally();
  const b = f.b;
  if (!b) return t;

  if (f.bankLike) {
    // Capital cushion: equity as a share of assets. Large US banks run 6-10%.
    if (b.total_stockholders_equity != null && b.total_assets != null && b.total_assets > 0) {
      const ratio = b.total_stockholders_equity / b.total_assets;
      t.add(25, tier(ratio, [[0.1, 25], [0.08, 21], [0.06, 16], [0.045, 10], [0.03, 4]]));
    }
    return t;
  }

  // Interest coverage (10): operating profit over interest expense. Utilities
  // and real estate borrow by design against regulated or contracted income.
  if (f.ebit != null && f.interest != null) {
    const interest = Math.abs(f.interest);
    const steps: [number, number][] = f.heavyAssets
      ? [[6, 10], [4, 8], [2.8, 6], [2, 3], [1.2, 1]]
      : [[15, 10], [8, 8], [4, 6], [2, 3], [1, 1]];
    t.add(10, f.ebit <= 0 ? 0 : interest < 1 ? 10 : tier(f.ebit / interest, steps));
  }

  // Debt load (10): net debt over a year of EBITDA. Measured against earnings,
  // not equity, so buyback-driven negative equity is not mistaken for distress.
  // With no EBITDA line (insurers, Berkshire) debt against equity stands in.
  if (b.long_term_debt != null) {
    const netDebt = b.long_term_debt - (b.cash_and_equivalents ?? 0);
    let pts: number | null = null;
    if (netDebt <= 0) pts = 10;
    else if (f.ebitda != null) {
      const steps: [number, number][] = f.heavyAssets
        ? [[-4, 9], [-5, 7], [-6, 5], [-7, 2]]
        : [[-1, 9], [-2, 7], [-3, 5], [-4, 2]];
      pts = f.ebitda <= 0 ? 0 : tier(-(netDebt / f.ebitda), steps);
    } else if (b.total_stockholders_equity != null && b.total_stockholders_equity > 0) {
      pts = tier(-(b.long_term_debt / b.total_stockholders_equity), [[-0.3, 10], [-0.6, 8], [-1, 6], [-2, 3]]);
    }
    if (pts != null) {
      t.add(10, pts);
      signals.debtToEquity = pts >= 7 ? 'positive' : pts >= 2 ? 'neutral' : 'negative';
    }
  }

  // Liquidity (5): can it cover the next year's bills? A ratio near 1 is normal
  // for efficient businesses (Visa, Coca-Cola), so the bar is 1, not 2.
  if (b.total_current_assets != null && b.total_current_liabilities != null && b.total_current_liabilities > 0) {
    const cr = b.total_current_assets / b.total_current_liabilities;
    const pts = tier(cr, f.heavyAssets ? [[0.9, 5], [0.7, 4], [0.5, 2]] : [[1.2, 5], [1, 4], [0.8, 2]]);
    t.add(5, pts);
    signals.currentRatio = pts >= 4 ? 'positive' : pts >= 2 ? 'neutral' : 'negative';
  }
  return t;
}

function scoreCashFlow(f: Fundamentals, signals: Signals): Tally {
  const t = new Tally();
  // Deposit flows swamp a bank's operating cash flow; the measure means nothing there.
  if (f.bankLike) return t;

  if (f.ocf != null) t.add(6, f.ocf > 0 ? 6 : 0);
  if (f.fcf != null) {
    t.add(5, f.fcf > 0 ? 5 : 0);
    signals.freeCashFlow = f.fcf > 0 ? 'positive' : 'negative';
  }
  // Cash backs up earnings (4): Piotroski's accruals test.
  if (f.ocf != null && f.netIncome != null) t.add(4, f.ocf >= f.netIncome && f.ocf > 0 ? 4 : 0);
  // Free cash flow margin (5)
  if (f.fcf != null && f.revenue != null && f.revenue > 0) {
    t.add(5, tier(f.fcf / f.revenue, [[0.2, 5], [0.1, 3], [0.03, 2], [0.0001, 1]]));
  }
  return t;
}

function scoreGrowth(stats: CompanyStatistics, signals: Signals): Tally {
  const t = new Tally();
  // Latest quarter, year over year (TwelveData's quarterly_revenue_growth).
  if (stats.revenueGrowthTTM != null) {
    const pts = tier(stats.revenueGrowthTTM, [[0.2, 9], [0.1, 7], [0.05, 5], [0.0001, 3], [-0.05, 1]]);
    t.add(9, pts);
    signals.revenueGrowthTTM = pts >= 7 ? 'positive' : pts >= 3 ? 'neutral' : 'negative';
  }
  if (stats.epsGrowthTTM != null) {
    const pts = tier(stats.epsGrowthTTM, [[0.2, 6], [0.08, 4], [0.0001, 2]]);
    t.add(6, pts);
    signals.epsGrowthTTM = pts >= 4 ? 'positive' : pts >= 2 ? 'neutral' : 'negative';
  }
  return t;
}

function scoreMarketRisk(stats: CompanyStatistics, f: Fundamentals, signals: Signals): Tally {
  const t = new Tally();
  // Only high volatility costs points; a calm, low-beta stock is not a risk.
  if (stats.beta != null) {
    const pts = stats.beta <= 1 ? 6 : stats.beta <= 1.3 ? 5 : stats.beta <= 1.6 ? 3 : stats.beta <= 2 ? 1 : 0;
    t.add(6, pts);
    signals.beta = pts >= 5 ? 'positive' : pts >= 3 ? 'neutral' : 'negative';
  }
  // Earnings consistency (4): every reported quarter of the last four in profit, or all but one.
  if (f.profitableQuarters != null) t.add(4, f.profitableQuarters === 1 ? 4 : f.profitableQuarters >= 0.66 ? 2 : 0);
  return t;
}

/** How cheap the stock looks, 0-20. Informational only, never part of the score. */
function valuationScore(stats: CompanyStatistics): number {
  let score = 0;
  const pe = stats.peRatioTTM;
  score += pe == null ? 4 : pe > 0 && pe <= 20 ? 8 : pe > 0 && pe <= 35 ? 5 : 2;
  const pb = stats.pbRatio;
  if (pb != null) score += pb < 1 ? 7 : pb < 3 ? 5 : pb < 6 ? 3 : 1;
  const ev = stats.evToEbitda;
  if (ev != null && ev > 0) score += ev < 10 ? 5 : ev < 20 ? 3 : 1;
  return Math.min(score, 20);
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(score: number, cats: CategoryScore[]): string {
  const ratio = (name: string) => {
    const c = cats.find((x) => x.name === name);
    return c && c.dataAvailable !== false ? c.score / c.max : null;
  };
  const prof = ratio('Profitability');
  const strength = ratio('Financial Strength');
  const cash = ratio('Cash Flow');
  const growth = ratio('Growth');

  if (score >= 85) return 'Highly profitable, cash generative and financially secure.';
  if (score >= 70) {
    if (growth != null && growth < 0.4) return 'A sound, profitable business. Growth has slowed, which is the main thing to watch.';
    if (strength != null && strength < 0.6) return 'Profitable and cash generative, with more debt than the strongest companies carry.';
    return 'Healthy fundamentals: profitable, cash generative and on solid footing.';
  }
  if (score >= 55) {
    if (prof != null && prof < 0.5 && growth != null && growth >= 0.6) return 'Growing quickly, but profits have not caught up yet.';
    if (cash != null && cash < 0.5) return 'Profitable on paper, but not yet turning that into much cash.';
    if (strength != null && strength < 0.5) return 'A decent business carrying a heavy debt load, which deserves a closer look.';
    return 'Mixed: real strengths, with some areas that need watching.';
  }
  if (score >= 40) {
    if (prof != null && prof < 0.3) return 'Not reliably profitable right now. Cash runway and a path to profit are what matter.';
    return 'Below-average fundamentals. This carries more risk and needs careful research.';
  }
  return 'Weak across several areas: losses, strained finances or both. High risk.';
}

// ─────────────────────────────────────────────────────────────────────────────
// screener_stats column mapping
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryColumns {
  health_profitability: number | null;
  health_financial_strength: number | null;
  health_cash_flow: number | null;
  health_growth: number | null;
  health_market_risk: number | null;
  health_valuation: number | null;
  health_score_version: number;
}

/** Maps by category name. A pillar with no data stores null, not 0. */
export function categoriesToColumns(categories: CategoryScore[], valuation: number | null = null): CategoryColumns {
  const col = (name: string) => {
    const c = categories.find((x) => x.name === name);
    return c && c.dataAvailable !== false ? c.score : null;
  };
  return {
    health_profitability: col('Profitability'),
    health_financial_strength: col('Financial Strength'),
    health_cash_flow: col('Cash Flow'),
    health_growth: col('Growth'),
    health_market_risk: col('Market Risk'),
    health_valuation: valuation,
    health_score_version: HEALTH_SCORE_METHOD,
  };
}

/** Every screener_stats health column for a computed score. Insufficient data stores no score. */
export function healthColumns(hs: HealthScore) {
  return {
    health_score: hs.insufficientData ? null : hs.score,
    health_score_grade: hs.insufficientData ? null : hs.grade,
    ...categoriesToColumns(hs.categories, hs.valuation),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function computeHealthScore(
  stats: CompanyStatistics,
  income: IncomeStatementPeriod[],
  balance: BalanceSheetPeriod[],
  cashflow: CashFlowPeriod[],
  opts: { sector?: string | null } = {},
): HealthScore {
  const f = fundamentals(income, balance, cashflow, opts.sector ?? null);
  const signals: Signals = {};

  const pillars: [string, number, Tally][] = [
    ['Profitability', 30, scoreProfitability(stats, f, signals)],
    ['Financial Strength', 25, scoreFinancialStrength(f, signals)],
    ['Cash Flow', 20, scoreCashFlow(f, signals)],
    ['Growth', 15, scoreGrowth(stats, signals)],
    ['Market Risk', 10, scoreMarketRisk(stats, f, signals)],
  ];

  const categories: CategoryScore[] = pillars.map(([name, max, t]) => {
    const score = t.scaled(max);
    return { name, score, max, label: t.available ? catLabel(score, max) : 'No data', dataAvailable: t.available };
  });

  // Re-weight over the pillars that had data.
  const availableMax = categories.filter((c) => c.dataAvailable).reduce((s, c) => s + c.max, 0);
  const earned = categories.filter((c) => c.dataAvailable).reduce((s, c) => s + c.score, 0);
  const total = availableMax > 0 ? Math.round((earned / availableMax) * 100) : 0;

  const grade = scoreToGrade(total);
  const label =
    total >= 85 ? 'Strong' :
    total >= 70 ? 'Good' :
    total >= 55 ? 'Fair' :
    total >= 40 ? 'Weak' : 'At Risk';

  return {
    score: total,
    grade,
    label,
    summary: buildSummary(total, categories),
    categories,
    metricSignals: signals,
    valuation: valuationScore(stats),
    method: HEALTH_SCORE_METHOD,
    insufficientData: !categories[1].dataAvailable && !categories[2].dataAvailable,
  };
}
