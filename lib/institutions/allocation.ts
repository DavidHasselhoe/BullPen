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
  /** Dots to fill, out of 4 -- more filled dots means more spread out. */
  filled: number;
  /** One-sentence plain-language gloss, shown in the card's info popover. */
  blurb: string;
}

/**
 * The thresholds behind every concentration label. Tune here and the dots,
 * the word, and the popover copy all move together -- they are all read off
 * this one table, never set independently.
 */
export const CONCENTRATION_THRESHOLDS = {
  /** Any one of these alone makes a fund concentrated. */
  concentrated: { topHoldingPct: 20, top5Pct: 60, maxPositions: 15 },
  /** Both must hold. */
  broad: { minPositions: 500, top5PctUnder: 40 },
  /** Both must hold. */
  diversified: { minPositions: 75, top5PctUnder: 35 },
} as const;

const CONCENTRATION_READS: Record<ConcentrationLevel, Omit<ConcentrationRead, 'level'>> = {
  concentrated: {
    label: 'Concentrated',
    filled: 1,
    blurb: 'Fewer than 15 holdings, or one stock worth over 20% of the portfolio.',
  },
  focused: {
    label: 'Focused',
    filled: 2,
    blurb: 'The five largest holdings are roughly 35% to 60% of the portfolio.',
  },
  diversified: {
    label: 'Diversified',
    filled: 3,
    blurb: '75 or more holdings, with the five largest under 35% of the portfolio.',
  },
  broad: {
    label: 'Very broad',
    filled: 4,
    blurb: '500 or more holdings, with the five largest under 40% of the portfolio.',
  },
};

/**
 * How concentrated a fund's portfolio is, as one plain-language shape a
 * beginner can read before parsing any individual number.
 *
 * Measured from the filing's own weights, not from how many names it holds.
 * Position count alone was the previous rule and it lied in both directions:
 * Berkshire holds 29 names with one of them at 22% of the book and came out
 * "Focused", while a 997-name fund came out "Very broad" purely on the count
 * even though its top five are a third of the portfolio.
 *
 * The order of these checks is the rule, and it is deliberate:
 *
 *   1. Concentrated wins outright. A fund with one 25% position is
 *      concentrated no matter how long its tail is, so this is tested before
 *      anything that looks at position count.
 *   2. Very broad needs BOTH a long tail and a light top. Count alone would
 *      catch Bridgewater's 997 names, but its top five are 33% of the book,
 *      which is not what "very broad" should mean.
 *   3. Diversified is the same shape one step down.
 *   4. Focused is the remainder, which in practice lands where its blurb
 *      says: a top five worth 35% to 60%.
 *
 * Returns null when the filing has no parsed holdings to measure, so the card
 * shows no label rather than an invented one.
 */
export function concentrationRead(
  totalPositions: number | null,
  topHoldingPct: number | null,
  top5Pct: number | null
): ConcentrationRead | null {
  if (totalPositions == null || totalPositions <= 0) return null;
  if (topHoldingPct == null || top5Pct == null) return null;

  const t = CONCENTRATION_THRESHOLDS;
  const level: ConcentrationLevel =
    topHoldingPct > t.concentrated.topHoldingPct ||
    top5Pct > t.concentrated.top5Pct ||
    totalPositions < t.concentrated.maxPositions
      ? 'concentrated'
      : totalPositions >= t.broad.minPositions && top5Pct < t.broad.top5PctUnder
        ? 'broad'
        : totalPositions >= t.diversified.minPositions && top5Pct < t.diversified.top5PctUnder
          ? 'diversified'
          : 'focused';

  return { level, ...CONCENTRATION_READS[level] };
}
