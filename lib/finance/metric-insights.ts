/**
 * metric-insights — pure helpers that turn raw statistics into the
 * plain-language one-liners and meter domains used by the visual metric
 * cards on the stock page. Keeping them here (next to glossary.ts) keeps
 * the components dumb and the beginner copy centralized + testable.
 */

export type MarketCapBand = 'Micro' | 'Small' | 'Mid' | 'Large' | 'Mega';

const CAP_MIN = 50_000_000;        // left edge of the log scale
const CAP_MAX = 4_000_000_000_000; // right edge (~largest public companies)

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Position of `current` between `low` and `high`, clamped 0–1. */
export function week52Position(low: number, high: number, current: number): number {
  if (high <= low) return 0.5;
  return clamp01((current - low) / (high - low));
}

/** "Trading 8% below its 1-year high" — the sentence a beginner actually wants. */
export function week52Insight(low: number, high: number, current: number): string {
  if (high <= low || current <= 0) return '';
  const offHigh = ((high - current) / high) * 100;
  const offLow = ((current - low) / low) * 100;
  if (offHigh <= 2) return 'Trading right at its 1-year high';
  if (offHigh <= 10) return `Trading ${Math.round(offHigh)}% below its 1-year high`;
  if (offLow <= 5) return 'Trading near its 1-year low';
  return `${Math.round(offHigh)}% below its high, ${Math.round(offLow)}% above its low`;
}

/** Log-scale band + position for the "how big is this company?" scale. */
export function marketCapBand(marketCap: number): { band: MarketCapBand; position: number } {
  const band: MarketCapBand =
    marketCap < 300_000_000 ? 'Micro'
    : marketCap < 2_000_000_000 ? 'Small'
    : marketCap < 10_000_000_000 ? 'Mid'
    : marketCap < 200_000_000_000 ? 'Large'
    : 'Mega';
  const logPos =
    (Math.log10(Math.max(marketCap, CAP_MIN)) - Math.log10(CAP_MIN)) /
    (Math.log10(CAP_MAX) - Math.log10(CAP_MIN));
  return { band, position: clamp01(logPos) };
}

export function marketCapInsight(band: MarketCapBand): string {
  switch (band) {
    case 'Mega':  return 'A mega-cap — one of the largest public companies in the world';
    case 'Large': return 'A large, established company';
    case 'Mid':   return 'A mid-size company — established, with room to grow';
    case 'Small': return 'A smaller company — more growth potential, more risk';
    case 'Micro': return 'A very small company — prices can swing sharply';
  }
}

/** "You pay $32 for every $1 of yearly profit." */
export function peInsight(ttm: number | null, forward: number | null): string {
  if (ttm == null || ttm <= 0) {
    if (forward != null && forward > 0)
      return `Not yet profitable over the past year — priced at ${Math.round(forward)}× next year's expected earnings`;
    return 'No earnings to price against — the company isn’t profitable yet';
  }
  const base = `You pay $${Math.round(ttm)} for every $1 of yearly profit`;
  if (forward != null && forward > 0 && ttm > 0) {
    if (forward < ttm * 0.93) return `${base} — expected to get cheaper as profits grow`;
    if (forward > ttm * 1.07) return `${base} — expected to get pricier as profits shrink`;
  }
  return base;
}

export function betaInsight(beta: number): string {
  if (beta < 0.2) return 'Barely moves with the market — very steady';
  if (beta < 0.8) return `Moves about ${beta.toFixed(1)}× the market — a calmer ride`;
  if (beta <= 1.2) return 'Moves roughly in line with the overall market';
  if (beta <= 1.8) return `Moves about ${beta.toFixed(1)}× the market — expect bigger swings`;
  return `Moves about ${beta.toFixed(1)}× the market — a very bumpy ride`;
}

/** `yieldFraction` is a decimal fraction (0.0044 = 0.44%). */
export function dividendInsight(yieldFraction: number | null): string {
  if (yieldFraction == null || yieldFraction <= 0)
    return 'Doesn’t pay a dividend — profits are reinvested into growth instead';
  const perHundred = yieldFraction * 100;
  return `Pays about $${perHundred.toFixed(2)} per year for every $100 invested`;
}

/** `marginFraction` is a decimal fraction (0.24 = 24%). */
export function marginInsight(marginFraction: number | null): string {
  if (marginFraction == null) return '';
  if (marginFraction < 0) return 'Currently spends more than it earns on sales';
  const cents = Math.round(marginFraction * 100);
  return `Keeps ${cents}¢ of every $1 of sales as profit`;
}

export function growthInsight(growthFraction: number | null): string {
  if (growthFraction == null) return '';
  const pct = Math.round(Math.abs(growthFraction) * 100);
  if (growthFraction > 0.005) return `Sales grew ${pct}% over the past year`;
  if (growthFraction < -0.005) return `Sales shrank ${pct}% over the past year`;
  return 'Sales were roughly flat over the past year';
}

export function pbInsight(pb: number | null): string {
  if (pb == null || pb <= 0) return '';
  return `Priced at ${pb.toFixed(1)}× the company's book value`;
}

export function evEbitdaInsight(ev: number | null): string {
  if (ev == null || ev <= 0) return '';
  return `Valued at ${ev.toFixed(1)}× its yearly operating earnings`;
}

/** `peHidden` makes the card self-explanatory even when selectMetrics' `note` is empty. */
export function psInsight(ps: number | null, peHidden: boolean): string {
  if (ps == null || ps <= 0) return '';
  const base = `Priced at ${ps.toFixed(1)}× yearly sales`;
  return peHidden ? `${base}. Shown instead of P/E since the company isn't profitable yet.` : base;
}

// ── Sector context ──────────────────────────────────────────────────────────
// Turns "where does this value sit vs. its sector" into one plain sentence, so
// a beginner learns whether a number is normal FOR ITS KIND, not just on an
// absolute scale. Fed by the sector_metric_stats rollup (migration 087).

export interface Distribution {
  p25: number;
  median: number;
  p75: number;
}

export type SectorMetricKind = 'pe' | 'pb' | 'evEbitda' | 'ps' | 'margin' | 'growth' | 'yield' | 'beta';

function distBand(value: number, d: Distribution): 'low' | 'mid' | 'high' {
  if (value < d.p25) return 'low';
  if (value > d.p75) return 'high';
  return 'mid';
}

/**
 * One plain-language sentence placing `value` against its sector distribution,
 * or '' when there's nothing reliable to compare against. `value` must be in the
 * same units as the distribution (see sector-benchmarks.ts).
 */
export function sectorContext(
  value: number | null | undefined,
  dist: Distribution | undefined,
  kind: SectorMetricKind,
  sectorLabel: string
): string {
  if (value == null || !isFinite(value) || !dist) return '';
  const s = sectorLabel.trim();
  if (!s) return '';
  const b = distBand(value, dist);

  switch (kind) {
    // Valuation multiples — lower reads as "cheaper".
    case 'pe':
    case 'pb':
    case 'evEbitda':
    case 'ps':
      return b === 'low'
        ? `Cheaper than most ${s} companies`
        : b === 'high'
          ? `Pricier than most ${s} companies`
          : `Around the ${s} average`;
    case 'margin':
      return b === 'high'
        ? `More profitable than most ${s} companies`
        : b === 'low'
          ? `Less profitable than most ${s} companies`
          : `Typical profitability for ${s}`;
    case 'growth':
      return b === 'high'
        ? `Growing faster than most ${s} companies`
        : b === 'low'
          ? `Growing slower than most ${s} companies`
          : `Typical growth for ${s}`;
    case 'yield':
      return b === 'high'
        ? `Pays more than most ${s} companies`
        : b === 'low'
          ? `Pays less than most ${s} payers`
          : `A typical payout for ${s}`;
    case 'beta':
      return b === 'high'
        ? `Swings more than most ${s} companies`
        : b === 'low'
          ? `Steadier than most ${s} companies`
          : `Typical volatility for ${s}`;
    default:
      return '';
  }
}

// Meter domains (fractions where the metric is a fraction)
export const PE_DOMAIN = { min: 0, max: 60 };
export const MARGIN_DOMAIN = { min: -0.1, max: 0.4 };
export const GROWTH_DOMAIN = { min: -0.2, max: 0.4 };
export const YIELD_DOMAIN = { min: 0, max: 0.08 };
export const BETA_DOMAIN = { min: 0, max: 2 };
export const PB_DOMAIN = { min: 0, max: 10 };
export const EV_EBITDA_DOMAIN = { min: 0, max: 30 };
export const PS_DOMAIN = { min: 0, max: 20 };
