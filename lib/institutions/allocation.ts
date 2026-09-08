/**
 * One allocation model shared by the donut chart and the holdings bar list on
 * a fund's detail page, so a ticker's color is identical in both. Computing it
 * twice from the same holdings array would work until one side changed its
 * TOP_N or sort and the two visuals silently stopped agreeing.
 */

import { ALLOCATION_COLORS, ALLOCATION_OTHER_COLOR } from '@/lib/charts/allocation-colors';
import { UNCHANGED_BAND_PCT } from './compute-diff';
import type { DiffableHolding, HoldingsDiff } from './compute-diff';

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
  // SEC truncates the issuer field at a fixed width, so a trailing legal
  // suffix often arrives cut in half: "LIVE NATION ENTERTAINMENT IN",
  // "SEAGATE TECHNOLOGY HLDNGS PL". Drop those the same way.
  'IN', 'PL', 'HLDNGS', 'INTL', 'CORPORATIO', 'INCORPORAT',
]);

/**
 * Words that same truncation chops mid-token. Expanded rather than dropped,
 * because they carry meaning: "Bank Of Amer" reads as a typo, "Bank of
 * America" reads as the company. Only entries actually observed in tracked
 * funds' holdings are listed — a fixed lookup, not a spell-checker.
 */
const NAME_EXPANSIONS: Record<string, string> = {
  AMER: 'America',
  MANUFAC: 'Manufacturing',
  TECHNOL: 'Technology',
  COMMUN: 'Communications',
  PHARMACEUT: 'Pharmaceuticals',
  FINL: 'Financial',
  INDS: 'Industries',
  SVCS: 'Services',
  NATL: 'National',
  MTG: 'Mortgage',
};

/** Lowercased inside a name, so it reads "Bank of America" rather than the
 *  title-cased "Bank Of America". */
const MINOR_WORDS = new Set(['OF', 'AND', 'THE', 'FOR', 'IN', 'AT', 'TO', 'DE']);

/**
 * Turns an SEC issuer name into something a beginner reads as a company:
 * "AMERICAN EXPRESS CO" to "American Express", "BANK OF AMER CORP" to "Bank of
 * America". Tokens carrying a non-letter keep their original casing so "3M"
 * and "AT&T" don't become "3m"/"At&t".
 */
export function friendlyIssuerName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1].toUpperCase())) {
    words.pop();
  }
  return words
    .map((w, i) => {
      const upper = w.toUpperCase();
      if (NAME_EXPANSIONS[upper]) return NAME_EXPANSIONS[upper];
      if (i > 0 && MINOR_WORDS.has(upper)) return upper.toLowerCase();
      return /[^A-Za-z]/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
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

/**
 * The fund's most notable move since last quarter, in one sentence, or null
 * when there is nothing worth reporting.
 *
 * Templated rather than AI-written on purpose. Every fact in the sentence is
 * already in the diff, so generating it would spend money and latency to
 * restate data we hold, and would introduce the one failure mode this surface
 * cannot afford: a model inventing a trade a fund did not make.
 *
 * "Notable" is weight-based, not percentage-based. A fund tripling a 0.02%
 * position is a bigger percentage move than trimming a 22% one, and nobody
 * cares about the former. Ranking on the position's share of the portfolio is
 * what makes the sentence read like a person wrote it.
 */
export function quarterHeadline(
  diff: HoldingsDiff | null,
  allocation: Allocation,
  sharesHistory: Record<string, number[]> = {}
): string | null {
  if (!diff) return null;

  /** Only moves in positions big enough for a reader to have heard of. */
  const NOTABLE_WEIGHT_PCT = 1;

  const weight = (cusip: string) =>
    allocation.top.find((h) => h.key === cusip)?.pct ??
    allocation.rest.find((h) => h.key === cusip)?.pct ??
    0;

  const biggest = <T extends { cusip: string }>(rows: T[]): T | undefined =>
    [...rows].sort((a, b) => weight(b.cusip) - weight(a.cusip))[0];

  const notable = <T extends { cusip: string }>(rows: T[]): T | undefined => {
    const top = biggest(rows);
    return top && weight(top.cusip) >= NOTABLE_WEIGHT_PCT ? top : undefined;
  };

  const clauses: string[] = [];

  const trim = notable(diff.decreased);
  if (trim) {
    clauses.push(`trimmed ${friendlyIssuerName(trim.nameOfIssuer)}${streakSuffix(sharesHistory[trim.cusip], 'down')}`);
  }

  // A brand-new position is more notable than adding to an existing one, so
  // it wins the "bought" slot when both happened.
  const opened = notable(diff.newPositions);
  const added = notable(diff.increased);
  if (opened) {
    clauses.push(`opened a new position in ${friendlyIssuerName(opened.nameOfIssuer)}`);
  } else if (added) {
    clauses.push(`added to ${friendlyIssuerName(added.nameOfIssuer)}${streakSuffix(sharesHistory[added.cusip], 'up')}`);
  }

  // An exited position has no current weight, so rank it by what it was worth
  // last quarter instead.
  if (clauses.length === 0) {
    const exit = [...diff.exited].sort((a, b) => (b.portfolioPct ?? 0) - (a.portfolioPct ?? 0))[0];
    if (exit && (exit.portfolioPct ?? 0) >= NOTABLE_WEIGHT_PCT) {
      clauses.push(`sold out of ${friendlyIssuerName(exit.nameOfIssuer)}`);
    }
  }

  if (clauses.length === 0) return null;

  // A clause carrying a streak goes first. Left in place it lands at the end
  // of the sentence, where "trimmed X and added to Y for the second straight
  // quarter" reads as if the streak covers both halves. Fronting it keeps the
  // suffix next to the position it describes.
  const ordered = [...clauses].sort(
    (a, b) => Number(b.includes(STREAK_MARKER)) - Number(a.includes(STREAK_MARKER))
  );

  const sentence = ordered.join(' and ');
  return sentence[0].toUpperCase() + sentence.slice(1) + '.';
}



const STREAK_MARKER = ' straight quarter';

/** Ordinals for the streak clause. Beyond this a reader stops counting and
 *  "for years" would be the honest phrasing, which needs data we don't keep. */
const ORDINALS = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth'];

/**
 * " for the third straight quarter", when the fund has moved this position the
 * same way in consecutive filings. Needs at least three data points (two
 * moves) to say anything, and returns '' rather than guessing when the history
 * is short — the sentence still reads fine without it.
 */
function streakSuffix(series: number[] | undefined, direction: 'up' | 'down'): string {
  if (!series || series.length < 3) return '';

  // series is newest-first, so each pair is (newer, older).
  let moves = 0;
  for (let i = 0; i < series.length - 1; i++) {
    const newer = series[i];
    const older = series[i + 1];
    if (older <= 0) break;
    const changePct = ((newer - older) / older) * 100;
    const matches = direction === 'up'
      ? changePct > UNCHANGED_BAND_PCT
      : changePct < -UNCHANGED_BAND_PCT;
    if (!matches) break;
    moves++;
  }

  if (moves < 2) return '';
  const ordinal = ORDINALS[Math.min(moves, ORDINALS.length - 1)];
  return ` for the ${ordinal} straight quarter`;
}
