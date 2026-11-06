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
  generatedAt: string;
  /** Set once Pro readers were notified, so a crash between store and notify retries the notify only. */
  notifiedAt?: string | null;
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
  'Return JSON only: {"bullets": ["...", "...", "..."]}. Exactly three bullets, each one or two plain sentences, ' +
  `${MAX_WORDS_PER_BULLET - 10} words at most, no markdown.\n` +
  '1. What was reported: revenue and profit for the quarter. Say "adjusted" when a figure is not GAAP.\n' +
  '2. How that compares with the company\'s own figures: the same quarter a year ago, the previous quarter, or ' +
  'guidance the company gave before, whichever the release states.\n' +
  '3. The one thing to watch: the outlook the company gave for the next quarter or year, or, if it gave none, ' +
  'the biggest change or risk the release itself points to.\n' +
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
  if (text.length < MIN_SOURCE_CHARS) return { bullets: null, rejected: 'release too short', inputTokens: 0, outputTokens: 0 };
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

/** The model's answer as bullets, or why it can't be shown. */
export function parseRecap(raw: string, source: string): { bullets: string[] | null; rejected?: string } {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  let parsed: { bullets?: unknown; skip?: unknown };
  try {
    parsed = JSON.parse(json ?? '');
  } catch {
    return { bullets: null, rejected: 'not json' };
  }
  if (typeof parsed.skip === 'string') return { bullets: null, rejected: `skip: ${parsed.skip.slice(0, 200)}` };
  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.filter((b): b is string => typeof b === 'string').map((b) => b.replace(/^[\s•*-]+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean)
    : [];
  if (bullets.length !== 3) return { bullets: null, rejected: `${bullets.length} bullets` };
  if (bullets.some((b) => b.split(' ').length > MAX_WORDS_PER_BULLET)) return { bullets: null, rejected: 'too long' };
  if (bullets.some((b) => /[—–]/.test(b))) return { bullets: null, rejected: 'dash' };
  if (bullets.some((b) => /\banalyst|\bconsensus\b|\bwall street\b|\bestimates?\b/i.test(b))) return { bullets: null, rejected: 'analyst language' };
  const missing = ungroundedNumbers(bullets, source);
  if (missing.length) return { bullets: null, rejected: `ungrounded: ${missing.join(', ')}` };
  return { bullets };
}
