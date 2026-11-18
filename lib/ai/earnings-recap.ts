/**
 * Earnings recap: three plain-English bullets on a quarter, read from the
 * company's own earnings press release (8-K item 2.02, exhibit 99.1).
 *
 * One recap per ticker per report, shared by every reader, stored in
 * market_data_cache under `earnings-recap:SYM`. Pro readers get it as a
 * notification, a push and a morning-email card (lib/earnings/recap-run.ts);
 * the stock page shows it to Pro and a locked cue to everyone else.
 *
 * No web search and no analyst numbers: the only input is the filing, and
 * every figure the model writes must be found in it (ungroundedNumbers), or
 * the recap is dropped. A dropped recap is stored too, so a report is paid
 * for once whatever happens.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { resolveCik } from '@/lib/segments/cik';
import { fetchExhibitText, fetchFilingIndex, findEarnings8K, pickPressReleaseFile, type EdgarFiling } from '@/lib/edgar/edgar-watch';
import { addDays } from '@/lib/dates/calendar-format';
import { logAiCall } from '@/lib/billing/log-ai-call';

export const EARNINGS_RECAP_MODEL = 'claude-sonnet-5-5';

/** Long enough to cover the stock page until the story is old; the run only looks two days back. */
const TTL_SECONDS = 45 * 24 * 60 * 60;
/** Releases run 15k-58k characters (feasibility doc §1). The tables sit at the end, the outlook near the top. */
const MAX_SOURCE_CHARS = 60_000;
/** Shorter than this is a cover page or a shareholder-letter stub, not a release with numbers. */
const MIN_SOURCE_CHARS = 2_000;
const MAX_WORDS_PER_BULLET = 45;

export interface EarningsRecap {
  symbol: string;
  /** Calendar report date, YYYY-MM-DD (New York). */
  reportDate: string;
  accession: string;
  /** EDGAR acceptance time, UTC ISO. */
  filedAt: string | null;
  /** The press release on sec.gov, for "Read the release". */
  sourceUrl: string | null;
  /** Null when the recap was dropped; `rejected` says why. */
  bullets: string[] | null;
  rejected?: string;
  /** The quarter's EPS as the release states it, checked by parseReleaseEps. Null when it failed or was missing. */
  eps?: ReleaseEps | null;
  /** Revenue and next-quarter outlook as the release states them, checked by parseReleaseFigures. Absent on recaps written before 2026-11-18. */
  figures?: ReleaseFigures | null;
  generatedAt: string;
  /** Set once Pro readers were notified, so a crash between store and notify retries the notify only. */
  notifiedAt?: string | null;
}

/** Diluted EPS for the quarter, copied from the release. `adjusted` (non-GAAP) is the basis analysts' estimates use. */
export interface ReleaseEps { adjusted: number; gaap: number }

/**
 * Dollar figures for the earnings story, each printed in the release. Growth
 * and the outlook midpoint are worked out in code from these, never by the
 * model. A field is null when the release doesn't state it or it failed a check.
 */
export interface ReleaseFigures {
  /** This quarter's total revenue. */
  revenue: number | null;
  /** The same quarter a year earlier. */
  revenueYearAgo: number | null;
  /** The company's revenue outlook for next quarter; low = high when it gave one figure. */
  guidanceLow: number | null;
  guidanceHigh: number | null;
}

export const recapKey = (symbol: string) => `earnings-recap:${symbol.toUpperCase()}`;

export function readRecap(symbol: string): Promise<EarningsRecap | null> {
  return getCached<EarningsRecap>(recapKey(symbol));
}

export function storeRecap(recap: EarningsRecap): Promise<void> {
  return setCached(recapKey(recap.symbol), recap.symbol, 'earnings_recap', recap, TTL_SECONDS);
}

// ─── Source: the 8-K press release ──────────────────────────────────────────

export interface PressRelease {
  filing: EdgarFiling;
  url: string | null;
  /** Null when the 8-K has no readable release exhibit. */
  text: string | null;
}

const archiveUrl = (cik: string, accession: string, file: string) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}/${file}`;

/**
 * The earnings 8-K for a report on `reportDate`, or null while it hasn't
 * landed (or the company has no CIK: foreign filers use 6-K). Item 2.02 is
 * also used for deliveries and other non-earnings results, so the 8-K must
 * fall within a day of the calendar's report date.
 */
export async function fetchPressRelease(symbol: string, reportDate: string): Promise<PressRelease | null> {
  const cik = await resolveCik(symbol);
  if (!cik) return null;
  const filing = await findEarnings8K(cik, addDays(reportDate, -1));
  if (!filing || filing.filingDate > addDays(reportDate, 1)) return null;
  const files = await fetchFilingIndex(cik, filing.accessionNumber);
  const file = pickPressReleaseFile(files, filing.primaryDocument);
  if (!file) return { filing, url: null, text: null };
  const text = await fetchExhibitText(cik, filing.accessionNumber, file.name);
  return { filing, url: archiveUrl(cik, filing.accessionNumber, file.name), text };
}

// ─── Generation ─────────────────────────────────────────────────────────────

const SYSTEM =
  'You write a short recap of a company\'s quarterly earnings press release for beginner investors. ' +
  'Return JSON only: {"bullets": ["...", "...", "..."], "eps": {"gaap": 0.00, "adjusted": 0.00}, ' +
  '"figures": {"revenue": 0, "revenueYearAgo": 0, "guidanceLow": 0, "guidanceHigh": 0}}. Exactly three bullets, each one or two plain sentences, ' +
  `${MAX_WORDS_PER_BULLET - 10} words at most, no markdown.\n` +
  '1. What was reported: revenue and profit for the quarter. Say "adjusted" when a figure is not GAAP.\n' +
  '2. How that compares with the company\'s own figures: the same quarter a year ago, the previous quarter, or ' +
  'guidance the company gave before, whichever the release states.\n' +
  '3. The one thing to watch: the outlook the company gave for the next quarter or year, or, if it gave none, ' +
  'the biggest change or risk the release itself points to.\n' +
  '"eps" is this quarter\'s diluted earnings per share copied from the release as numbers: "gaap" the GAAP figure, ' +
  '"adjusted" the non-GAAP one, negative for a loss. Use null for one the release does not state. Never a ' +
  'year-to-date, year-ago or basic figure.\n' +
  '"figures" are total revenue in whole dollars, copied from the release ("$115.8 billion" becomes 115800000000, ' +
  '"57,006" in a table in millions becomes 57006000000): "revenue" this quarter, "revenueYearAgo" the same quarter a ' +
  'year earlier, "guidanceLow" and "guidanceHigh" the revenue the company expects for the NEXT QUARTER. If it gives ' +
  'one figure, with or without "plus or minus", put that figure in both. Never compute a range end. Use null for one ' +
  'the release does not state, and for an outlook that is only for the full year.\n' +
  'Rules:\n' +
  '- Every number must be copied from the release. Never calculate a new number, growth rate or margin. You may ' +
  'round, and write a table figure in millions as billions ("94,930" in millions becomes "$94.9 billion").\n' +
  '- Use only the release. Never mention analysts, estimates, consensus, Wall Street, or the share price.\n' +
  '- No advice: never say whether to buy, sell or hold.\n' +
  '- Name the company by name, plain words, no jargon a beginner would not know. Never use an em dash or en dash; ' +
  'use a period or comma. Never put a hyphen directly before a number.\n' +
  '- If the document is not a quarterly or annual earnings release, return {"skip": "<why>"}.';

let anthropic: Anthropic | null = null;

export interface RecapGeneration {
  bullets: string[] | null;
  rejected?: string;
  eps: ReleaseEps | null;
  figures: ReleaseFigures | null;
  inputTokens: number;
  outputTokens: number;
}

/** One model call on the release text. Never throws on a bad answer: that comes back as `rejected`. */
export async function generateRecap(
  symbol: string,
  companyName: string,
  source: string,
  model: string = EARNINGS_RECAP_MODEL,
): Promise<RecapGeneration> {
  const text = source.slice(0, MAX_SOURCE_CHARS);
  if (text.length < MIN_SOURCE_CHARS) return { bullets: null, rejected: 'release too short', eps: null, figures: null, inputTokens: 0, outputTokens: 0 };
  anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await anthropic.messages.create({
    model,
    // Thinking is on by default and counts toward max_tokens.
    max_tokens: 3000,
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [{ role: 'user', content: `COMPANY: ${companyName} (${symbol})\n\n=== PRESS RELEASE ===\n${text}` }],
  });
  void logAiCall({
    userId: null,
    feature: 'earnings_recap',
    model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    metadata: { ticker: symbol },
  });
  const raw = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return { ...parseRecap(raw, text), inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}

// ─── Validation (pure) ──────────────────────────────────────────────────────

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Figures in the bullets that appear nowhere in the source, allowing the
 * model to round and to restate millions or thousands as billions. Coarse on
 * purpose: small numbers match something in any release, so this catches an
 * invented "$12.4 billion", not a wrong "up 3%".
 * ponytail: rounding match against every number in the release; per-row matching if a wrong figure slips through.
 */
export function ungroundedNumbers(bullets: string[], source: string): string[] {
  const pool = [...new Set((source.match(NUMBER_RE) ?? []).map((s) => Number(s.replace(/,/g, ''))))].filter(Number.isFinite);
  const missing: string[] = [];
  for (const token of bullets.join(' ').match(NUMBER_RE) ?? []) {
    const clean = token.replace(/,/g, '').replace(/\.$/, '');
    const decimals = clean.split('.')[1]?.length ?? 0;
    const target = Number(clean).toFixed(decimals);
    const found = pool.some((s) => [1, 1e3, 1e6, 1e9].some((k) => (s / k).toFixed(decimals) === target));
    if (!found) missing.push(token);
  }
  return missing;
}

/**
 * The model's EPS pair, kept only when both figures are printed in the release
 * and the adjusted one sits near GAAP. It fills a report's actual until Nasdaq
 * posts one (applyReleaseEps), so a figure that fails is dropped, never guessed.
 * The $1 floor lets a near-zero GAAP quarter with a one-off charge through
 * (GAAP -0.10, adjusted 0.85).
 * ponytail: past the floor the band still rejects big one-off quarters (GAAP
 * well below half of adjusted); those wait for Nasdaq. Widen it if real
 * quarters keep landing outside.
 */
export function parseReleaseEps(value: unknown, source: string): ReleaseEps | null {
  const { gaap, adjusted } = (value ?? {}) as { gaap?: unknown; adjusted?: unknown };
  if (typeof gaap !== 'number' || typeof adjusted !== 'number' || !Number.isFinite(gaap) || !Number.isFinite(adjusted)) return null;
  const printed = new Set((source.match(NUMBER_RE) ?? []).map((s) => Number(s.replace(/,/g, ''))));
  if (!printed.has(Math.abs(gaap)) || !printed.has(Math.abs(adjusted))) return null;
  if (Math.abs(adjusted - gaap) > Math.max(Math.abs(gaap), 1)) return null;
  return { gaap, adjusted };
}

/**
 * True when `value` (whole dollars) is a figure the release prints, as is or
 * in thousands, millions or billions, to the precision printed. A model that
 * rounds "$57.006 billion" to 57.0e9 fails, and that figure is left out.
 */
function printedDollars(value: number, printed: number[]): boolean {
  return printed.some((s) => s > 0 && [1, 1e3, 1e6, 1e9].some((k) => Math.abs(value / k - s) <= s * 1e-9));
}

/** Next-quarter outlook outside this band around this quarter's revenue is a full-year figure or a misread. */
const GUIDANCE_BAND = [0.5, 2] as const;

/**
 * The model's revenue figures, each kept only when the release prints it and
 * it is a plausible quarter: positive, a year-ago figure that isn't this
 * quarter's, an outlook near this quarter's size with low <= high. Pure.
 */
export function parseReleaseFigures(value: unknown, source: string): ReleaseFigures | null {
  const v = (value ?? {}) as Record<string, unknown>;
  const printed = (source.match(NUMBER_RE) ?? []).map((s) => Number(s.replace(/,/g, ''))).filter(Number.isFinite);
  const pick = (key: keyof ReleaseFigures): number | null => {
    const n = v[key];
    return typeof n === 'number' && Number.isFinite(n) && n > 0 && printedDollars(n, printed) ? n : null;
  };
  const revenue = pick('revenue');
  let revenueYearAgo = pick('revenueYearAgo');
  let guidanceLow = pick('guidanceLow');
  let guidanceHigh = pick('guidanceHigh');
  if (revenueYearAgo != null && revenueYearAgo === revenue) revenueYearAgo = null;
  const inBand = (g: number) => revenue != null && g >= revenue * GUIDANCE_BAND[0] && g <= revenue * GUIDANCE_BAND[1];
  if (guidanceLow == null || guidanceHigh == null || guidanceLow > guidanceHigh || !inBand(guidanceLow) || !inBand(guidanceHigh)) {
    guidanceLow = guidanceHigh = null;
  }
  if (revenue == null && revenueYearAgo == null) return null;
  return { revenue, revenueYearAgo, guidanceLow, guidanceHigh };
}

type ParsedRecap = { bullets: string[] | null; rejected?: string; eps: ReleaseEps | null; figures: ReleaseFigures | null };

/** The model's answer as bullets, or why it can't be shown, plus the EPS pair and revenue figures, which stand on their own. */
export function parseRecap(raw: string, source: string): ParsedRecap {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  let parsed: { bullets?: unknown; skip?: unknown; eps?: unknown; figures?: unknown };
  try {
    parsed = JSON.parse(json ?? '');
  } catch {
    return { bullets: null, rejected: 'not json', eps: null, figures: null };
  }
  if (typeof parsed.skip === 'string') return { bullets: null, rejected: `skip: ${parsed.skip.slice(0, 200)}`, eps: null, figures: null };
  return { ...parseBullets(parsed.bullets, source), eps: parseReleaseEps(parsed.eps, source), figures: parseReleaseFigures(parsed.figures, source) };
}

function parseBullets(value: unknown, source: string): { bullets: string[] | null; rejected?: string } {
  const bullets = Array.isArray(value)
    ? value.filter((b): b is string => typeof b === 'string').map((b) => b.replace(/^[\s•*-]+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean)
    : [];
  if (bullets.length !== 3) return { bullets: null, rejected: `${bullets.length} bullets` };
  if (bullets.some((b) => b.split(' ').length > MAX_WORDS_PER_BULLET)) return { bullets: null, rejected: 'too long' };
  if (bullets.some((b) => /[—–]/.test(b))) return { bullets: null, rejected: 'dash' };
  if (bullets.some((b) => /\banalyst|\bconsensus\b|\bwall street\b|\bestimates?\b/i.test(b))) return { bullets: null, rejected: 'analyst language' };
  const missing = ungroundedNumbers(bullets, source);
  if (missing.length) return { bullets: null, rejected: `ungrounded: ${missing.join(', ')}` };
  return { bullets };
}
