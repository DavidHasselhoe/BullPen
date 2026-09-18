/**
 * Prompt building for the portfolio risk analysis
 * (app/api/holdings/risk-analysis/route.ts). Pure: no SDK, no database, so
 * scripts/test-risk-analysis-prompt.ts can check it directly.
 *
 * Each holding line carries the reported data we hold for it (sector, market
 * cap, beta, health score and categories). Before this the model was scoring
 * market-cap bias, volatility and liquidity for tickers it was given nothing
 * about but a name and a weight, i.e. from memory.
 */

import type { HealthGrade } from '@/lib/finance/health-score';

export interface HoldingInput {
  symbol: string;
  company_name: string;
  allocation?: number;
  marketValue?: number;
  quantity?: number | null;
  dayChangePercent?: number;
  unrealizedPLPercent?: number;
  /** A what-if line: a position being weighed up, not one that is owned. */
  proposed?: boolean;
}

/** Reported data for one holding, from screener_stats. Every field can be missing. */
export interface HoldingFundamentals {
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  beta: number | null;
  healthScore: number | null;
  healthGrade: HealthGrade | null;
  categories: { name: string; score: number | null; max: number }[];
}

/** The portfolio's value-weighted health score, as the petal card computes it. */
export interface PortfolioHealthSummary {
  score: number;
  grade: HealthGrade;
  coveredCount: number;
  totalCount: number;
}

// Minimal position fingerprint — deliberately excludes allocation/marketValue/
// dayChangePercent/unrealizedPLPercent, which drift every run regardless of
// whether the user actually bought or sold anything. Only share count and
// symbol membership represent a real position change.
export interface HoldingSnapshotEntry {
  symbol: string;
  quantity: number | null;
}

interface SnapshotDiff {
  added: string[];
  removed: string[];
  resized: Array<{ symbol: string; from: number | null; to: number | null }>;
}

export function toSnapshot(holdings: HoldingInput[]): HoldingSnapshotEntry[] {
  return holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity ?? null }));
}

function diffHoldingsSnapshot(prior: HoldingSnapshotEntry[], current: HoldingSnapshotEntry[]): SnapshotDiff {
  const priorMap = new Map(prior.map((h) => [h.symbol, h.quantity]));
  const currentMap = new Map(current.map((h) => [h.symbol, h.quantity]));

  const added = current.filter((h) => !priorMap.has(h.symbol)).map((h) => h.symbol);
  const removed = prior.filter((h) => !currentMap.has(h.symbol)).map((h) => h.symbol);
  const resized: SnapshotDiff['resized'] = [];
  for (const [symbol, priorQty] of priorMap) {
    if (!currentMap.has(symbol)) continue;
    const currentQty = currentMap.get(symbol) ?? null;
    if (Math.abs((priorQty ?? 0) - (currentQty ?? 0)) > 1e-6) {
      resized.push({ symbol, from: priorQty, to: currentQty });
    }
  }

  return { added, removed, resized };
}

function isUnchanged(diff: SnapshotDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.resized.length === 0;
}

/**
 * Builds a prompt suffix anchoring the model to the previous score when the
 * portfolio hasn't actually changed, so identical holdings don't get a
 * re-rolled score purely from LLM sampling variance. When holdings HAVE
 * changed, the model is told exactly what changed and asked to explain the
 * delta rather than starting from a totally independent number.
 *
 * `prior.grounded` is false for an analysis made before holdings carried
 * reported data. Anchoring to that score would lock in a number the model
 * guessed, so the first grounded run is free to move it and has to say why.
 */
export function buildHistoryContext(
  prior: { score: number; level: string; snapshot: HoldingSnapshotEntry[]; grounded: boolean } | null,
  currentHoldings: HoldingInput[]
): string {
  if (!prior) return '';

  const diff = diffHoldingsSnapshot(prior.snapshot, toSnapshot(currentHoldings));

  if (isUnchanged(diff) && !prior.grounded) {
    return `\n\nThe last analysis of this exact portfolio (same holdings, same share counts) scored ${prior.score}/100 (${prior.level}) without any reported data. This analysis has actual sector, market cap, beta and health data for the holdings. Reassess from that data rather than from the old score. If the score moves, scoreChangeReason MUST say it moved because the analysis now uses reported fundamentals, and name the holding or metric that moved it most.`;
  }

  if (isUnchanged(diff)) {
    return `\n\nIMPORTANT: You scored this exact portfolio (same holdings, same share counts) ${prior.score}/100 (${prior.level}) last time. Keep the overall score and risk level the same unless you identify a genuinely new external risk factor since then (e.g. a specific holding entered financial distress, a sector-specific shock occurred). Do not vary the score merely due to re-analysis or normal sampling variation: an unchanged portfolio should produce an unchanged score. If you do change it anyway, scoreChangeReason MUST name the specific external event that justifies it — you have no live news access, so only cite something you are genuinely confident happened, never a generic hedge.`;
  }

  const changes: string[] = [];
  if (diff.added.length > 0) changes.push(`added: ${diff.added.join(', ')}`);
  if (diff.removed.length > 0) changes.push(`removed: ${diff.removed.join(', ')}`);
  if (diff.resized.length > 0) {
    changes.push(`resized: ${diff.resized.map((r) => `${r.symbol} (${r.from ?? 0} -> ${r.to ?? 0} shares)`).join(', ')}`);
  }

  return `\n\nSince the last analysis (scored ${prior.score}/100, ${prior.level}), the portfolio changed: ${changes.join('; ')}. Reassess from first principles based on the current holdings below, and use scoreChangeReason to explain how this specific change moved the score relative to last time.`;
}

// Currency display helpers
const CURRENCY_PREFIXES: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  CAD: 'CA$', AUD: 'A$', CHF: 'Fr.',
};
function currencyPrefix(code: string): string {
  return CURRENCY_PREFIXES[code] ?? `${code} `;
}

/** Market cap is always USD in screener_stats, whatever the portfolio currency. */
function fmtMarketCap(usd: number): string {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1)}T`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  return `$${(usd / 1e6).toFixed(0)}M`;
}

export const NO_FUNDAMENTALS = 'fundamentals: none on file';

/** e.g. "sector: Technology / Consumer Electronics, market cap: $3.1T, beta: 1.21,
 *  health: B 74/100 (Profitability 26/30, ...)". */
export function describeFundamentals(f: HoldingFundamentals | undefined): string {
  if (!f) return NO_FUNDAMENTALS;
  const parts: string[] = [];
  if (f.sector) parts.push(`sector: ${f.sector}${f.industry ? ` / ${f.industry}` : ''}`);
  if (f.marketCap != null) parts.push(`market cap: ${fmtMarketCap(f.marketCap)}`);
  if (f.beta != null) parts.push(`beta: ${f.beta.toFixed(2)}`);
  if (f.healthScore != null && f.healthGrade) {
    const cats = f.categories.filter((c) => c.score != null).map((c) => `${c.name} ${c.score}/${c.max}`);
    parts.push(`health: ${f.healthGrade} ${f.healthScore}/100${cats.length > 0 ? ` (${cats.join(', ')})` : ''}`);
  }
  return parts.length > 0 ? parts.join(', ') : NO_FUNDAMENTALS;
}

export function buildPrompt(
  holdings: HoldingInput[],
  currency: string,
  fundamentals: Map<string, HoldingFundamentals>,
  portfolioHealth: PortfolioHealthSummary | null
): string {
  const prefix = currencyPrefix(currency);
  const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);

  const lines = holdings.map((h) => {
    const parts: string[] = [`${h.symbol} (${h.company_name})`];
    if (h.allocation != null) parts.push(`allocation: ${h.allocation.toFixed(1)}%`);
    if (h.marketValue != null) parts.push(`value: ${prefix}${h.marketValue.toFixed(0)}`);
    if (h.quantity != null) parts.push(`shares: ${h.quantity}`);
    if (h.dayChangePercent != null)
      parts.push(`today: ${h.dayChangePercent >= 0 ? '+' : ''}${h.dayChangePercent.toFixed(2)}%`);
    if (h.unrealizedPLPercent != null)
      parts.push(`unrealized P/L: ${h.unrealizedPLPercent >= 0 ? '+' : ''}${h.unrealizedPLPercent.toFixed(2)}%`);
    if (h.proposed) parts.push('PROPOSED, not currently held');
    return `${parts.join(', ')} | ${describeFundamentals(fundamentals.get(h.symbol.toUpperCase()))}`;
  });

  const currencyNote = currency !== 'USD' ? `\nAll portfolio values are in ${currency}. Market caps are in USD.` : '';
  const healthNote = portfolioHealth
    ? `\n\nPortfolio business quality (value-weighted health score over the ${portfolioHealth.coveredCount} of ${portfolioHealth.totalCount} holdings with data, higher is better): ${portfolioHealth.grade} ${portfolioHealth.score}/100.`
    : '';
  return `Analyze this portfolio${totalValue > 0 ? ` (total value: ${prefix}${totalValue.toFixed(0)})` : ''}:${currencyNote}\n\n${lines.join('\n')}${healthNote}`;
}
