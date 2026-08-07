/**
 * metric-selector — picks which valuation metrics are relevant for a
 * company instead of always showing P/E, P/B, and EV/EBITDA regardless of
 * whether they mean anything (e.g. a trailing P/E on an unprofitable
 * company, or on a REIT where depreciation distorts earnings).
 */

export type ValuationMetric = 'P/E' | 'Forward P/E' | 'P/B' | 'EV/EBITDA' | 'P/S' | 'Dividend Yield';

export interface MetricSelectorInput {
  /** Fraction, e.g. -0.006 = -0.6%. Null/undefined = unknown — never assumed unprofitable. */
  profitMargin: number | null | undefined;
  /** TwelveData sector taxonomy, e.g. "Real Estate", "Financial Services", "Technology". Never "REIT"/"Bank"/"Semiconductor" — those are industry values. */
  sector: string | null | undefined;
  /** Finer-grained than sector, e.g. "REIT—Diversified", "Banks—Regional", "Semiconductors". Preferred over sector when present. */
  industry?: string | null | undefined;
  /** Whether a forward P/E value exists (peRatioForward != null). */
  hasForwardEarnings: boolean;
  /** Fraction. Only ever recommended as a metric when positive. */
  dividendYield?: number | null | undefined;
}

export interface MetricSelection {
  primary: ValuationMetric[];
  secondary: ValuationMetric[];
  hideMetrics: ValuationMetric[];
  note?: string;
}

const REIT_RE = /reit/i;
const BANK_OR_INSURER_RE = /bank|insurance/i;
const CYCLICAL_RE = /semiconductor|mining|steel|coal|metals|oil & gas/i;

function hasPositiveDividend(dividendYield: number | null | undefined): boolean {
  return dividendYield != null && dividendYield > 0;
}

export function selectMetrics(input: MetricSelectorInput): MetricSelection {
  const { profitMargin, sector, industry, hasForwardEarnings, dividendYield } = input;

  const unprofitable = profitMargin != null && profitMargin < 0;
  const dividendMetric: ValuationMetric[] = hasPositiveDividend(dividendYield) ? ['Dividend Yield'] : [];
  const forwardPeMetric: ValuationMetric[] = hasForwardEarnings ? ['Forward P/E'] : [];

  const isReit = industry != null ? REIT_RE.test(industry) : sector === 'Real Estate';
  if (isReit) {
    return {
      primary: ['P/B', ...dividendMetric],
      secondary: ['EV/EBITDA', ...forwardPeMetric],
      hideMetrics: ['P/E'],
      note: 'P/E is skewed by real estate depreciation — P/B and yield are more reliable here.',
    };
  }

  const isBankOrInsurer = industry != null && BANK_OR_INSURER_RE.test(industry);
  if (isBankOrInsurer) {
    return {
      primary: unprofitable ? ['P/B'] : ['P/E', 'P/B'],
      secondary: dividendMetric,
      hideMetrics: unprofitable ? ['P/E'] : [],
    };
  }

  const isCyclical =
    industry != null ? CYCLICAL_RE.test(industry) : sector === 'Basic Materials' || sector === 'Energy';
  if (isCyclical) {
    return {
      primary: ['EV/EBITDA', 'P/S'],
      secondary: ['P/B', ...forwardPeMetric],
      hideMetrics: unprofitable ? ['P/E'] : [],
      note: 'Earnings swing heavily with the commodity/demand cycle — EV/EBITDA and P/S smooth that out.',
    };
  }

  if (unprofitable) {
    return {
      primary: ['P/S', ...forwardPeMetric],
      secondary: ['EV/EBITDA'],
      hideMetrics: ['P/E'],
      note: hasForwardEarnings ? 'Forward P/E assumes the company turns profitable.' : undefined,
    };
  }

  return {
    primary: ['P/E'],
    secondary: [...forwardPeMetric, 'P/B', 'EV/EBITDA'],
    hideMetrics: [],
  };
}
