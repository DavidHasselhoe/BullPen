/**
 * Why Today, shared between the streamed "Why?" panel and the explanations
 * Home shows inline.
 *
 * One explanation per stock per trading day per language, cached in Redis and
 * served to every user who asks. A call averages ~$0.10 (the web search pulls
 * ~36k input tokens), so the second person asking about META today should
 * cost nothing.
 *
 * A shared answer must be built from numbers the server fetched itself: a
 * prompt taking the browser's word for "META is up 40%" would let one person
 * put a made-up explanation in front of everyone else.
 */

import Anthropic from '@anthropic-ai/sdk';
import { languageName, isSupportedLanguage } from '@/lib/i18n/language-names';
import { WHY_TODAY_MIN_MOVE } from '@/lib/ai/why-today-shared';

export { WHY_TODAY_MIN_MOVE };
export type { InlineWhy } from '@/lib/ai/why-today-shared';

export const WHY_TODAY_MODEL = 'claude-sonnet-5';

const CACHE_TTL_SECONDS = 36 * 60 * 60;

export interface WhyTodayMove {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
}

export interface CachedWhyToday {
  text: string;
  /** The move the text explains, to tell when it has gone stale. */
  changePct: number;
  generatedAt: string;
}

export function whyTodayLanguage(raw: unknown): string {
  const code = String(raw ?? 'en').slice(0, 5);
  return isSupportedLanguage(code) ? code : 'en';
}

/**
 * The ET trading day whose move a quote's change describes. Before 4:00 ET a
 * stock quote still shows the previous session's move, and a weekend shows
 * Friday's (holidays aside: that costs one extra generation, not a wrong
 * answer). Crypto trades around the clock, so its day is the ET date.
 */
export function whyTodaySessionDate(ticker: string, now = new Date()): string {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  if (!ticker.includes('/')) {
    if (et.getHours() < 4) et.setDate(et.getDate() - 1);
    while (et.getDay() === 0 || et.getDay() === 6) et.setDate(et.getDate() - 1);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${et.getFullYear()}-${pad(et.getMonth() + 1)}-${pad(et.getDate())}`;
}

/** A holding pinned to a listing (mic_code) keeps its own entry: bare KOG is Kroger, not Kongsberg. */
export function whyTodayKey(ticker: string, language: string, mic?: string | null): string {
  return `whytoday:v1:${whyTodaySessionDate(ticker)}:${language}:${ticker}${mic ? `@${mic}` : ''}`;
}

export const whyTodayLockKey = (key: string) => `${key}:lock`;
export const WHY_TODAY_CACHE_TTL = CACHE_TTL_SECONDS;

/** The same stock can move further or turn around after it was explained. */
export function isStale(cached: CachedWhyToday, currentPct: number): boolean {
  const flipped = Math.sign(cached.changePct) !== Math.sign(currentPct) && Math.abs(currentPct) >= WHY_TODAY_MIN_MOVE;
  return flipped || Math.abs(currentPct - cached.changePct) >= 3;
}

/** Request body shared by the streamed and the one-shot call, so both say the same thing. */
export function whyTodayRequest(move: WhyTodayMove, language: string) {
  const languagePrefix = language !== 'en'
    ? `[Language: You MUST respond entirely in ${languageName(language)}. Do not switch to English under any circumstance.]\n\n`
    : '';
  const direction = move.changePct >= 0 ? 'up' : 'down';
  return {
    model: WHY_TODAY_MODEL,
    // Thinking is off: max_tokens is sized for 2-3 bullets, and Sonnet 5's
    // default adaptive thinking would spend the same budget and could cut them.
    max_tokens: 600,
    thinking: { type: 'disabled' as const },
    betas: ['web-search-2025-03-05'],
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const }],
    system:
      languagePrefix +
      'You are a concise financial analyst. Explain why a stock moved today using only what you find in current news. ' +
      'Respond with exactly 2–3 bullet points (each starting with "• "). ' +
      'Name the specific catalyst, event, or news item. Keep each bullet under 25 words. ' +
      'Do not use headers, bold text, or generic market commentary. ' +
      'Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead.',
    messages: [{
      role: 'user' as const,
      content:
        `$${move.ticker} is ${direction} ${Math.abs(move.changePct).toFixed(2)}% ($${Math.abs(move.change).toFixed(2)}) today. ` +
        `Current price: $${move.price.toFixed(2)}. ` +
        `Search for the specific news or catalyst driving this move right now.`,
    }],
  };
}

let anthropic: Anthropic | null = null;

/** One-shot generation for Home. Returns the text and token usage for cost logging. */
export async function generateWhyToday(move: WhyTodayMove, language: string) {
  anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await anthropic.beta.messages.create(whyTodayRequest(move, language));
  const text = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}

