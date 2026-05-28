/**
 * Infer a company "archetype" from the fundamentals we already have, then produce
 * an analytical-lens hint that's injected into the deep-dive prompt. This makes the
 * AI analyze each company through the right frame (a pre-profit growth name and a
 * mature dividend payer warrant very different scrutiny) — without an extra API call.
 */

import type { CompanyStatistics } from '@/lib/twelvedata/twelvedata-client';

export type Archetype =
  | 'pre_profit_growth'
  | 'high_growth'
  | 'mature_profitable'
  | 'dividend_income'
  | 'cyclical'
  | 'speculative'
  | 'general';

export interface ArchetypeResult {
  archetype: Archetype;
  /** One-paragraph instruction telling the model which lens to emphasize. */
  hint: string;
}

const pctOf = (n: number | null | undefined) => (n != null ? n * 100 : null);

export function inferArchetype(stats: CompanyStatistics | null): ArchetypeResult {
  if (!stats) {
    return {
      archetype: 'general',
      hint: 'Limited fundamental data is available — lean on web research for current results, guidance, and analyst views, and be explicit about what is unknown.',
    };
  }

  const margin = pctOf(stats.profitMargin);          // %
  const revGrowth = pctOf(stats.revenueGrowthTTM);   // %
  const divYield = pctOf(stats.dividendYield);       // %
  const beta = stats.beta;
  const pe = stats.peRatioTTM;

  // Pre-profit: negative/zero margin (and usually no positive P/E)
  if (margin != null && margin <= 0) {
    return {
      archetype: 'pre_profit_growth',
      hint: 'This company is not yet profitable. Emphasize: revenue growth durability, gross-margin trajectory, cash runway and burn (FCF, cash vs. debt), path-to-profitability milestones, and dilution risk. Do NOT lean on P/E; use price-to-sales and unit economics. Be candid about the risk that profitability never arrives.',
    };
  }

  // Dividend/income: meaningful yield
  if (divYield != null && divYield >= 2.5) {
    return {
      archetype: 'dividend_income',
      hint: 'This is an income-oriented holding. Emphasize: dividend sustainability (payout ratio vs. FCF, dividend history/coverage), balance-sheet strength, and steady cash generation over hyper-growth. Frame valuation on yield and FCF, and flag any threat to the dividend.',
    };
  }

  // High growth (still profitable)
  if (revGrowth != null && revGrowth >= 20) {
    return {
      archetype: 'high_growth',
      hint: 'This is a high-growth, profitable company. Emphasize: whether growth is decelerating or re-accelerating, operating leverage (margin expansion as revenue scales), reinvestment efficiency, and whether the current multiple already prices in years of growth (expectations risk). Stress-test the growth assumptions.',
    };
  }

  // Cyclical: high beta
  if (beta != null && beta >= 1.3) {
    return {
      archetype: 'cyclical',
      hint: 'This name is volatile/cyclical (high beta). Emphasize: where it sits in its cycle, demand sensitivity to macro (rates, commodities, consumer), operating leverage in both directions, and balance-sheet resilience through a downturn. Avoid treating a single strong quarter as a trend.',
    };
  }

  // Mature & profitable
  if (margin != null && margin > 0) {
    return {
      archetype: 'mature_profitable',
      hint: `This is an established, profitable business${pe != null ? ` (P/E ~${pe.toFixed(0)})` : ''}. Emphasize: quality and consistency of margins and FCF, capital allocation (buybacks, dividends, M&A), competitive moat, and whether valuation is reasonable vs. growth. Distinguish durable earnings power from one-off boosts.`,
    };
  }

  return {
    archetype: 'general',
    hint: 'Analyze with a balanced lens: profitability quality, growth, balance-sheet strength, and valuation. Let the data dictate which factors matter most.',
  };
}
