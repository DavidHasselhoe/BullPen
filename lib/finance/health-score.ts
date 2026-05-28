/**
 * Financial Health Score
 *
 * Computes a 0–100 score from TwelveData statistics and financial statements.
 * Pure function — no API calls, no side effects.
 *
 * Five categories:
 *   Profitability   30 pts
 *   Financial Strength 25 pts
 *   Valuation       20 pts
 *   Growth          15 pts
 *   Market Risk     10 pts
 */

import type {
  CompanyStatistics,
  IncomeStatementPeriod,
  BalanceSheetPeriod,
  CashFlowPeriod,
} from '@/lib/twelvedata/twelvedata-client';

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
  /** False when the underlying data was unavailable — score of 0 is not meaningful */
  dataAvailable?: boolean;
}

export interface HealthScore {
  /** Aggregate score 0–100 */
  score: number;
  /** Letter grade */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** One-word summary */
  label: string;
  /** One-sentence plain-English summary for beginners */
  summary: string;
  /** Breakdown by category */
  categories: CategoryScore[];
  /**
   * Per-metric signals keyed by CompanyStatistics field name.
   * Only metrics where a meaningful signal can be computed are included.
   */
  metricSignals: Record<string, SignalValue>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pct(n: number | null): number {
  return n != null ? n * 100 : 0;
}

function catLabel(score: number, max: number): string {
  const ratio = max > 0 ? score / max : 0;
  if (ratio >= 0.8) return 'Excellent';
  if (ratio >= 0.6) return 'Good';
  if (ratio >= 0.4) return 'Fair';
  return 'Weak';
}

// ─────────────────────────────────────────────────────────────────────────────
// Category scorers
// ─────────────────────────────────────────────────────────────────────────────

function scoreProfitability(
  stats: CompanyStatistics,
  income: IncomeStatementPeriod[]
): { score: number; signals: Record<string, SignalValue> } {
  let score = 0;
  const signals: Record<string, SignalValue> = {};

  // Profit margin (12 pts)
  const margin = stats.profitMargin != null ? stats.profitMargin : null;
  if (margin != null) {
    const m = pct(margin);
    if (m > 20) { score += 12; signals['profitMargin'] = 'positive'; }
    else if (m > 10) { score += 8; signals['profitMargin'] = 'positive'; }
    else if (m > 0) { score += 4; signals['profitMargin'] = 'neutral'; }
    else { score += 0; signals['profitMargin'] = 'negative'; }
  } else {
    signals['profitMargin'] = 'neutral';
  }

  // Net income positive from latest period (10 pts)
  const latestIncome = income[0];
  if (latestIncome?.net_income != null) {
    if (latestIncome.net_income > 0) score += 10;
  }

  // Revenue growth TTM (8 pts) — used here and in Growth category
  const revGrowth = stats.revenueGrowthTTM;
  if (revGrowth != null) {
    const g = pct(revGrowth);
    if (g > 20) { score += 8; signals['revenueGrowthTTM'] = 'positive'; }
    else if (g > 10) { score += 5; signals['revenueGrowthTTM'] = 'positive'; }
    else if (g > 0) { score += 2; signals['revenueGrowthTTM'] = 'neutral'; }
    else { score += 0; signals['revenueGrowthTTM'] = 'negative'; }
  } else {
    signals['revenueGrowthTTM'] = 'neutral';
  }

  return { score: Math.min(score, 30), signals };
}

function scoreFinancialStrength(
  balance: BalanceSheetPeriod[],
  cashflow: CashFlowPeriod[]
): { score: number; dataAvailable: boolean; signals: Record<string, SignalValue> } {
  if (balance.length === 0 && cashflow.length === 0) {
    return { score: 0, dataAvailable: false, signals: {} };
  }

  let score = 0;
  const signals: Record<string, SignalValue> = {};

  const b = balance[0];
  const cf = cashflow[0];

  // Current ratio (10 pts)
  if (b?.total_current_assets != null && b.total_current_liabilities != null && b.total_current_liabilities > 0) {
    const cr = b.total_current_assets / b.total_current_liabilities;
    if (cr > 2) { score += 10; signals['currentRatio'] = 'positive'; }
    else if (cr >= 1.5) { score += 7; signals['currentRatio'] = 'positive'; }
    else if (cr >= 1) { score += 4; signals['currentRatio'] = 'neutral'; }
    else { score += 0; signals['currentRatio'] = 'negative'; }
  } else {
    signals['currentRatio'] = 'neutral';
  }

  // Debt-to-equity (10 pts)
  if (b?.long_term_debt != null && b.total_stockholders_equity != null && b.total_stockholders_equity > 0) {
    const de = b.long_term_debt / b.total_stockholders_equity;
    if (de < 0.3) { score += 10; signals['debtToEquity'] = 'positive'; }
    else if (de < 0.7) { score += 7; signals['debtToEquity'] = 'positive'; }
    else if (de < 1.5) { score += 3; signals['debtToEquity'] = 'neutral'; }
    else { score += 0; signals['debtToEquity'] = 'negative'; }
  } else if (b?.total_stockholders_equity != null && b.total_stockholders_equity < 0) {
    // Negative equity is a red flag
    signals['debtToEquity'] = 'negative';
  } else {
    signals['debtToEquity'] = 'neutral';
  }

  // Free cash flow positive (5 pts)
  if (cf?.free_cash_flow != null) {
    if (cf.free_cash_flow > 0) { score += 5; signals['freeCashFlow'] = 'positive'; }
    else { signals['freeCashFlow'] = 'negative'; }
  } else {
    signals['freeCashFlow'] = 'neutral';
  }

  return { score: Math.min(score, 25), dataAvailable: true, signals };
}

function scoreValuation(
  stats: CompanyStatistics
): { score: number; signals: Record<string, SignalValue> } {
  let score = 0;
  const signals: Record<string, SignalValue> = {};

  // P/E TTM (8 pts)
  const pe = stats.peRatioTTM;
  if (pe != null) {
    if (pe > 0 && pe <= 20) { score += 8; signals['peRatioTTM'] = 'positive'; }
    else if (pe <= 35) { score += 5; signals['peRatioTTM'] = 'neutral'; }
    else if (pe > 35) { score += 2; signals['peRatioTTM'] = 'negative'; }
    else { score += 2; signals['peRatioTTM'] = 'negative'; } // negative P/E = loss-making
  } else {
    // No P/E — company may be pre-profit; don't penalise
    score += 4;
    signals['peRatioTTM'] = 'neutral';
  }

  // P/B (7 pts)
  const pb = stats.pbRatio;
  if (pb != null) {
    if (pb < 1) { score += 7; signals['pbRatio'] = 'positive'; }
    else if (pb < 3) { score += 5; signals['pbRatio'] = 'positive'; }
    else if (pb < 6) { score += 3; signals['pbRatio'] = 'neutral'; }
    else { score += 1; signals['pbRatio'] = 'negative'; }
  } else {
    signals['pbRatio'] = 'neutral';
  }

  // EV/EBITDA (5 pts)
  const ev = stats.evToEbitda;
  if (ev != null && ev > 0) {
    if (ev < 10) { score += 5; signals['evToEbitda'] = 'positive'; }
    else if (ev < 20) { score += 3; signals['evToEbitda'] = 'neutral'; }
    else { score += 1; signals['evToEbitda'] = 'negative'; }
  } else {
    signals['evToEbitda'] = 'neutral';
  }

  return { score: Math.min(score, 20), signals };
}

function scoreGrowth(
  stats: CompanyStatistics
): { score: number; signals: Record<string, SignalValue> } {
  let score = 0;
  const signals: Record<string, SignalValue> = {};

  // Revenue growth TTM (9 pts) — note: also scored in Profitability; here we reward growth itself
  const rg = stats.revenueGrowthTTM;
  if (rg != null) {
    const g = pct(rg);
    if (g > 20) score += 9;
    else if (g > 10) score += 6;
    else if (g > 0) score += 3;
    // signals already set by profitability scorer
  }

  // EPS growth TTM (6 pts)
  const eg = stats.epsGrowthTTM;
  if (eg != null) {
    const g = pct(eg);
    if (g > 20) { score += 6; signals['epsGrowthTTM'] = 'positive'; }
    else if (g > 10) { score += 4; signals['epsGrowthTTM'] = 'positive'; }
    else if (g > 0) { score += 2; signals['epsGrowthTTM'] = 'neutral'; }
    else { score += 0; signals['epsGrowthTTM'] = 'negative'; }
  } else {
    signals['epsGrowthTTM'] = 'neutral';
  }

  return { score: Math.min(score, 15), signals };
}

function scoreMarketRisk(
  stats: CompanyStatistics
): { score: number; signals: Record<string, SignalValue> } {
  let score = 0;
  const signals: Record<string, SignalValue> = {};

  // Beta (6 pts) — moderate beta is healthy; extreme in either direction adds risk
  const beta = stats.beta;
  if (beta != null) {
    if (beta >= 0.5 && beta <= 1.2) { score += 6; signals['beta'] = 'positive'; }
    else if (beta > 1.2 && beta <= 1.8) { score += 4; signals['beta'] = 'neutral'; }
    else { score += 2; signals['beta'] = 'negative'; }
  } else {
    signals['beta'] = 'neutral';
  }

  // Short ratio (4 pts) — high short interest signals market doubt
  const sr = stats.shortRatio;
  if (sr != null) {
    if (sr < 2) { score += 4; signals['shortRatio'] = 'positive'; }
    else if (sr < 5) { score += 2; signals['shortRatio'] = 'neutral'; }
    else { score += 0; signals['shortRatio'] = 'negative'; }
  } else {
    signals['shortRatio'] = 'neutral';
  }

  // Dividend yield signal (informational — not scored, but users like seeing it)
  if (stats.dividendYield != null) {
    signals['dividendYield'] = stats.dividendYield > 0 ? 'positive' : 'neutral';
  } else {
    signals['dividendYield'] = 'neutral';
  }

  return { score: Math.min(score, 10), signals };
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary generation
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(
  score: number,
  cats: CategoryScore[],
  stats: CompanyStatistics
): string {
  const profCat = cats.find((c) => c.name === 'Profitability')!;
  const strCat  = cats.find((c) => c.name === 'Financial Strength')!;
  const valCat  = cats.find((c) => c.name === 'Valuation')!;
  const grwCat  = cats.find((c) => c.name === 'Growth')!;

  const isProfit   = profCat.score / profCat.max >= 0.6;
  const isStrong   = strCat.dataAvailable === false ? true : strCat.score / strCat.max >= 0.6;
  const isCheap    = valCat.score / valCat.max >= 0.6;
  const isGrowing  = grwCat.score / grwCat.max >= 0.6;
  const margin     = stats.profitMargin != null ? pct(stats.profitMargin) : null;

  if (score >= 85) {
    return 'Across-the-board strong fundamentals — profitable, well-funded, and growing.';
  }
  if (score >= 70) {
    if (isProfit && isStrong)
      return 'Healthy profitability with a solid balance sheet; valuation is the key variable to watch.';
    if (isGrowing && !isCheap)
      return 'Strong growth profile, though the current price reflects high expectations already baked in.';
    return 'Solid fundamentals overall with minor areas to monitor.';
  }
  if (score >= 55) {
    if (!isProfit && isGrowing)
      return 'A growth-stage company — revenue is expanding but profitability has not yet arrived.';
    if (isProfit && !isStrong)
      return 'Profitable business, but elevated debt or low liquidity deserves a closer look.';
    if (isCheap && !isProfit)
      return 'Trading at a low valuation, likely reflecting concerns about profitability.';
    return 'Mixed signals — some strengths offset by areas that warrant monitoring.';
  }
  if (score >= 40) {
    if (margin != null && margin < 0)
      return 'The company is currently unprofitable; recovery trajectory and cash runway are the key factors.';
    return 'Below-average fundamentals — this carries higher risk and requires careful due diligence.';
  }
  return 'Significant risk signals across multiple areas. High-risk profile — research thoroughly before investing.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function computeHealthScore(
  stats: CompanyStatistics,
  income: IncomeStatementPeriod[],
  balance: BalanceSheetPeriod[],
  cashflow: CashFlowPeriod[]
): HealthScore {
  const prof = scoreProfitability(stats, income);
  const str  = scoreFinancialStrength(balance, cashflow);
  const val  = scoreValuation(stats);
  const grw  = scoreGrowth(stats);
  const mkt  = scoreMarketRisk(stats);

  const total = prof.score + str.score + val.score + grw.score + mkt.score;

  const categories: CategoryScore[] = [
    { name: 'Profitability',        score: prof.score, max: 30, label: catLabel(prof.score, 30) },
    { name: 'Financial Strength',   score: str.score,  max: 25, label: catLabel(str.score, 25), dataAvailable: str.dataAvailable },
    { name: 'Valuation',            score: val.score,  max: 20, label: catLabel(val.score, 20) },
    { name: 'Growth',               score: grw.score,  max: 15, label: catLabel(grw.score, 15) },
    { name: 'Market Risk',          score: mkt.score,  max: 10, label: catLabel(mkt.score, 10) },
  ];

  const grade: HealthScore['grade'] =
    total >= 85 ? 'A' :
    total >= 70 ? 'B' :
    total >= 55 ? 'C' :
    total >= 40 ? 'D' : 'F';

  const label =
    total >= 85 ? 'Strong' :
    total >= 70 ? 'Good' :
    total >= 55 ? 'Fair' :
    total >= 40 ? 'Weak' : 'At Risk';

  // Merge all signals
  const metricSignals: Record<string, SignalValue> = {
    ...prof.signals,
    ...str.signals,
    ...val.signals,
    ...grw.signals,
    ...mkt.signals,
  };

  const summary = buildSummary(total, categories, stats);

  return { score: total, grade, label, summary, categories, metricSignals };
}
