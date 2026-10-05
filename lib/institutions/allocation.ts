/**
 * One allocation model shared by the donut chart and the holdings bar list on
 * a fund's detail page, so a ticker's color is identical in both. Computing it
 * twice from the same holdings array would work until one side changed its
 * TOP_N or sort and the two visuals silently stopped agreeing.
 */

import { ALLOCATION_COLORS, ALLOCATION_OTHER_COLOR } from '@/lib/charts/allocation-colors';
import { UNCHANGED_BAND_PCT, holdingKey } from './compute-diff';
import type { DiffableHolding, HoldingsDiff } from './compute-diff';

/** How many holdings get their own color + detail row before the tail is
 *  collapsed. 8 is the legibility ceiling for a donut — past it, adjacent
 *  wedges stop being tellable apart, especially under color-vision deficiency. */
export const ALLOCATION_TOP_N = 8;

export interface AllocationEntry {
  key: string;
  symbol: string | null;
  /** Readable name: the catalogue's when known, else the SEC issuer field. Pass through friendlyIssuerName to display. */
  name: string;
  /** An ETF or fund, not a company. */
  isFund: boolean;
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
  // Shares only. A 13F values an option at the shares it covers, not at what
  // the fund paid for it, so counting puts here would make a bet against a
  // stock read as one of its largest holdings. See optionPositions().
  const shares = holdings.filter((h) => !h.putCall);
  const total = shares.reduce((sum, h) => sum + h.valueUsd, 0);
  const sorted = [...shares].sort((a, b) => b.valueUsd - a.valueUsd);
  const pctOf = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const toEntry = (h: DiffableHolding, color: string): AllocationEntry => ({
    key: holdingKey(h),
    symbol: h.symbol,
    name: h.companyName ?? h.nameOfIssuer,
    isFund: !!h.isFund,
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

/** A fund's puts and calls, largest reported value first. */
export function optionPositions(holdings: DiffableHolding[]): DiffableHolding[] {
  return holdings.filter((h) => !!h.putCall).sort((a, b) => b.valueUsd - a.valueUsd);
}

const NAME_SUFFIXES = new Set([
  'INC', 'INC.', 'CORP', 'CORP.', 'CO', 'CO.', 'COM', 'PLC', 'LTD', 'LTD.',
  'LP', 'LLC', 'NV', 'SA', 'AG', 'TR', 'TRUST', 'CL', 'THE', 'HLDG', 'HLDGS',
  'HOLDINGS', 'GROUP', 'GRP', '&',
  // SEC truncates the issuer field at a fixed width, so a trailing legal
  // suffix often arrives cut in half: "LIVE NATION ENTERTAINMENT IN",
  // "SEAGATE TECHNOLOGY HLDNGS PL". Drop those the same way.
  'IN', 'PL', 'HLDNGS', 'INTL', 'CORPORATIO', 'INCORPORAT',
  // Catalogue names spell them out: "The Coca-Cola Company", "Chubb Limited".
  'CORPORATION', 'COMPANY', 'LIMITED', 'INCORPORATED',
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
  // Catalogue names arrive already cased ("NVIDIA", "iShares Core S&P 500
  // ETF"); re-casing them would turn NVIDIA into Nvidia. Only the SEC field,
  // which is all capitals, gets cased here. Both lose a share-class tail
  // ("Alphabet Inc. Class A Common Stock") and their legal suffix.
  const cased = /[a-z]/.test(name);
  const cleaned = name
    .replace(/\s+(class [a-z]\s+)?(common stock|ordinary shares|common shares)\b.*$/i, '')
    .replace(/^the\s+/i, '');
  const words = cleaned.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1].toUpperCase())) {
    words.pop();
  }
  // "AMAZON.COM, INC" loses its suffix but kept the comma before it, which
  // read "Amazon.com, and Forge Investments, alone make up..." in a headline.
  words[words.length - 1] = words[words.length - 1].replace(/,+$/, '');
  if (cased) return words.join(' ');
  return words
    .map((w, i) => {
      const upper = w.toUpperCase();
      if (NAME_EXPANSIONS[upper]) return NAME_EXPANSIONS[upper];
      if (i > 0 && MINOR_WORDS.has(upper)) return upper.toLowerCase();
      return /[^A-Za-z]/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/** The display name for a holding row: catalogue name first, SEC field as the fallback. */
export function holdingName(h: Pick<DiffableHolding, 'nameOfIssuer' | 'companyName'>): string {
  return friendlyIssuerName(h.companyName ?? h.nameOfIssuer);
}

/**
 * Optional translation for the two headline builders: the 'discover' t and the
 * reader's language, for its list joining. Server callers (the filing
 * notification) pass nothing and get English.
 */
export interface HeadlineTranslator {
  t: (key: string, opts?: Record<string, unknown>) => string;
  lang: string;
}

/** "A, B and C" in the reader's language, or English without a translator. */
function joinList(items: string[], tr?: HeadlineTranslator): string {
  if (tr) return new Intl.ListFormat(tr.lang, { type: 'conjunction' }).format(items);
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];
}

/**
 * One plain-language read on how concentrated the fund is — the thing a
 * beginner should take away before parsing any individual number. Deliberately
 * describes shape ("concentrated" vs "spread out"), never advice.
 */
export function allocationHeadline(allocation: Allocation, tr?: HeadlineTranslator): string | null {
  const { top, total } = allocation;
  if (total <= 0 || top.length === 0) return null;

  const leaders = top.slice(0, 3);
  const leaderPct = leaders.reduce((sum, h) => sum + h.pct, 0);
  const names = leaders.map((h) => friendlyIssuerName(h.name));
  const nameList = joinList(names, tr);
  const rounded = Math.round(leaderPct);

  if (leaderPct >= 50) {
    return tr
      ? tr.t('fundHeadHigh', { names: nameList, pct: rounded })
      : `Highly concentrated. ${nameList} alone make up ${rounded}% of the portfolio.`;
  }
  if (leaderPct >= 25) {
    return tr
      ? tr.t('fundHeadFair', { names: nameList, pct: rounded })
      : `Fairly concentrated. ${nameList} are ${rounded}% of the portfolio between them.`;
  }
  const largest = top[0].pct.toFixed(1);
  return tr
    ? tr.t('fundHeadSpread', { name: names[0], pct: largest })
    : `Spread out. Even the largest position, ${names[0]}, is only ${largest}% of the portfolio.`;
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
  sharesHistory: Record<string, number[]> = {},
  tr?: HeadlineTranslator
): string | null {
  if (!diff) return null;

  /** Only moves in positions big enough for a reader to have heard of. */
  const NOTABLE_WEIGHT_PCT = 1;

  // Map lookup, not a linear .find() over allocation.rest -- that scan ran
  // inside a sort comparator called once per candidate, which on a
  // 7000+-position fund like Citadel was tens of millions of comparisons.
  // Options have no weight here (buildAllocation leaves them out), so they can
  // never be the move a headline names.
  const pctByKey = new Map<string, number>();
  for (const h of allocation.top) pctByKey.set(h.key, h.pct);
  for (const h of allocation.rest) pctByKey.set(h.key, h.pct);
  const weight = (h: DiffableHolding) => pctByKey.get(holdingKey(h)) ?? 0;

  const biggest = <T extends DiffableHolding>(rows: T[]): T | undefined =>
    [...rows].sort((a, b) => weight(b) - weight(a))[0];

  const notable = <T extends DiffableHolding>(rows: T[]): T | undefined => {
    const top = biggest(rows);
    return top && weight(top) >= NOTABLE_WEIGHT_PCT ? top : undefined;
  };

  // Each clause is a whole phrase, streak included, so a translation can put
  // the streak wherever its grammar needs it rather than after the name.
  const clauses: { text: string; streak: boolean }[] = [];
  const moveClause = (kind: 'trimmed' | 'added', name: string, moves: number) => {
    const streak = moves >= 2;
    if (tr) {
      return {
        text: streak
          ? tr.t(`fundMove_${kind}Streak`, { name, count: moves, ordinal: true })
          : tr.t(`fundMove_${kind}`, { name }),
        streak,
      };
    }
    const verb = kind === 'trimmed' ? 'trimmed' : 'added to';
    return { text: `${verb} ${name}${streak ? englishStreak(moves) : ''}`, streak };
  };
  const plainClause = (kind: 'opened' | 'sold', name: string) => ({
    text: tr ? tr.t(`fundMove_${kind}`, { name }) : kind === 'opened' ? `opened a new position in ${name}` : `sold out of ${name}`,
    streak: false,
  });

  const trim = notable(diff.decreased);
  if (trim) {
    clauses.push(moveClause('trimmed', holdingName(trim), streakMoves(sharesHistory[holdingKey(trim)], 'down')));
  }

  // A brand-new position is more notable than adding to an existing one, so
  // it wins the "bought" slot when both happened.
  const opened = notable(diff.newPositions);
  const added = notable(diff.increased);
  if (opened) {
    clauses.push(plainClause('opened', holdingName(opened)));
  } else if (added) {
    clauses.push(moveClause('added', holdingName(added), streakMoves(sharesHistory[holdingKey(added)], 'up')));
  }

  // An exited position has no current weight, so rank it by what it was worth
  // last quarter instead.
  if (clauses.length === 0) {
    const exit = diff.exited.filter((h) => !h.putCall).sort((a, b) => (b.portfolioPct ?? 0) - (a.portfolioPct ?? 0))[0];
    if (exit && (exit.portfolioPct ?? 0) >= NOTABLE_WEIGHT_PCT) {
      clauses.push(plainClause('sold', holdingName(exit)));
    }
  }

  if (clauses.length === 0) return null;

  // A clause carrying a streak goes first. Left in place it lands at the end
  // of the sentence, where "trimmed X and added to Y for the second straight
  // quarter" reads as if the streak covers both halves. Fronting it keeps the
  // suffix next to the position it describes.
  const ordered = [...clauses].sort((a, b) => Number(b.streak) - Number(a.streak)).map((c) => c.text);

  // A name can already end the sentence with its own dot ("Nebius Group N.V.").
  const joined = joinList(ordered, tr).replace(/\.$/, '');
  const sentence = tr ? tr.t('fundHeadlineSentence', { clauses: joined }) : `${joined}.`;
  return sentence[0].toUpperCase() + sentence.slice(1);
}



/** Ordinals for the streak clause. Beyond this a reader stops counting and
 *  "for years" would be the honest phrasing, which needs data we don't keep. */
const ORDINALS = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth'];

/** " for the third straight quarter": the English streak phrase. */
function englishStreak(moves: number): string {
  return ` for the ${ORDINALS[Math.min(moves, ORDINALS.length - 1)]} straight quarter`;
}

/**
 * How many consecutive filings moved this position the same way. Needs at
 * least three data points (two moves) to matter, and anything under 2 means no
 * streak: the sentence still reads fine without one.
 */
function streakMoves(series: number[] | undefined, direction: 'up' | 'down'): number {
  if (!series || series.length < 3) return 0;

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

  return moves;
}
