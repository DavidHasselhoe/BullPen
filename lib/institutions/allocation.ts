/**
 * One allocation model shared by the donut chart and the holdings bar list on
 * a fund's detail page, so a ticker's color is identical in both. Computing it
 * twice from the same holdings array would work until one side changed its
 * TOP_N or sort and the two visuals silently stopped agreeing.
 */

import { ALLOCATION_COLORS, ALLOCATION_OTHER_COLOR } from '@/lib/charts/allocation-colors';
import type { DiffableHolding } from './compute-diff';

/** How many holdings get their own color + detail row before the tail is
 *  collapsed. 8 is the legibility ceiling for a donut — past it, adjacent
 *  wedges stop being tellable apart, especially under color-vision deficiency. */
export const ALLOCATION_TOP_N = 8;

export interface AllocationEntry {
  key: string;
  symbol: string | null;
  name: string;
  valueUsd: number;
  shares: number;
  /** Share of the whole portfolio, 0-100. */
  pct: number;
  color: string;
}

export interface Allocation {
  /** Up to ALLOCATION_TOP_N holdings, largest first, each with its own color. */
  top: AllocationEntry[];
  /** Everything past the top N, largest first, all neutral-colored. */
  rest: AllocationEntry[];
  restValue: number;
  restPct: number;
  /** Sum of every holding's value — the denominator for every pct here. */
  total: number;
}

export function buildAllocation(holdings: DiffableHolding[]): Allocation {
  const total = holdings.reduce((sum, h) => sum + h.valueUsd, 0);
  const sorted = [...holdings].sort((a, b) => b.valueUsd - a.valueUsd);
  const pctOf = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const toEntry = (h: DiffableHolding, color: string): AllocationEntry => ({
    key: h.cusip,
    symbol: h.symbol,
    name: h.nameOfIssuer,
    valueUsd: h.valueUsd,
    shares: h.shares,
    pct: pctOf(h.valueUsd),
    color,
  });

  const top = sorted
    .slice(0, ALLOCATION_TOP_N)
    .map((h, i) => toEntry(h, ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]));
  const rest = sorted.slice(ALLOCATION_TOP_N).map((h) => toEntry(h, ALLOCATION_OTHER_COLOR));
  const restValue = rest.reduce((sum, h) => sum + h.valueUsd, 0);

  return { top, rest, restValue, restPct: pctOf(restValue), total };
}

const NAME_SUFFIXES = new Set([
  'INC', 'INC.', 'CORP', 'CORP.', 'CO', 'CO.', 'COM', 'PLC', 'LTD', 'LTD.',
  'LP', 'LLC', 'NV', 'SA', 'AG', 'TR', 'TRUST', 'CL', 'THE', 'HLDG', 'HLDGS',
  'HOLDINGS', 'GROUP', 'GRP', '&',
]);

/**
 * Turns an SEC issuer name into something a beginner reads as a company:
 * "AMERICAN EXPRESS CO" to "American Express". Tokens carrying a non-letter
 * keep their original casing so "3M" and "AT&T" don't become "3m"/"At&t".
 */
export function friendlyIssuerName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1].toUpperCase())) {
    words.pop();
  }
  return words
    .map((w) => (/[^A-Za-z]/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/**
 * One plain-language read on how concentrated the fund is — the thing a
 * beginner should take away before parsing any individual number. Deliberately
 * describes shape ("concentrated" vs "spread out"), never advice.
 */
export function allocationHeadline(allocation: Allocation): string | null {
  const { top, total } = allocation;
  if (total <= 0 || top.length === 0) return null;

  const leaders = top.slice(0, 3);
  const leaderPct = leaders.reduce((sum, h) => sum + h.pct, 0);
  const names = leaders.map((h) => friendlyIssuerName(h.name));
  const nameList =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  const rounded = Math.round(leaderPct);

  if (leaderPct >= 50) {
    return `Highly concentrated. ${nameList} alone make up ${rounded}% of the portfolio.`;
  }
  if (leaderPct >= 25) {
    return `Fairly concentrated. ${nameList} are ${rounded}% of the portfolio between them.`;
  }
  return `Spread out. Even the largest position, ${names[0]}, is only ${top[0].pct.toFixed(1)}% of the portfolio.`;
}

export type ConcentrationLevel = 'concentrated' | 'focused' | 'diversified' | 'broad';

export interface ConcentrationRead {
  level: ConcentrationLevel;
  label: string;
  /** Dots to fill, out of 4 — more filled dots means more spread out. */
  filled: number;
}

/**
 * Position count read as a shape, for the fund cards on Discover, where the
 * full holdings (and so any real weight-based concentration measure) are
 * Pro-gated and not fetched. A raw "7166 positions" means nothing to a
 * beginner; "Broad" plus four dots does.
 */
export function concentrationFromPositionCount(count: number | null): ConcentrationRead | null {
  if (count == null || count <= 0) return null;
  if (count <= 25) return { level: 'concentrated', label: 'Concentrated', filled: 1 };
  if (count <= 100) return { level: 'focused', label: 'Focused', filled: 2 };
  if (count <= 750) return { level: 'diversified', label: 'Diversified', filled: 3 };
  return { level: 'broad', label: 'Very broad', filled: 4 };
}
