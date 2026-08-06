/**
 * Earnings-calendar content for the automated Instagram pipeline.
 *
 * Every fact (ticker, company name, date, time) comes straight from
 * getEarningsCalendarRange() + getActiveUniverse() — the same pair
 * app/api/calendar/earnings/route.ts uses for the in-app Market Calendar.
 * Claude never sees or produces any of that; it only writes the hook
 * headline and caption, grounded in the real list handed to it. This keeps
 * hallucination risk on the facts at zero, not just "low" — there is no
 * code path where the model's own knowledge could reach a slide's numbers.
 *
 * Claude cost: a single short, non-web-search call (~$0.01/run) — see
 * lib/billing/log-ai-call.ts for where this is logged (feature: 'instagram_content').
 */

import Anthropic from '@anthropic-ai/sdk';
import { getEarningsCalendarRange } from '@/lib/twelvedata/twelvedata-client';
import { getActiveUniverse } from '@/lib/market-data/screener-universe';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';
import { attachMarketCap } from '@/lib/market-data/calendar-market-cap';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { parseHookAndCaption } from './schema';
import type { EarningsCalendarSlides, EarningsSlideCompany } from './schema';

const NASDAQ100_SET = new Set(NASDAQ100_TICKERS);
const MODEL = 'claude-sonnet-4-6';
/** Companies per carousel — caps the list slides at a sane carousel length
 *  (1 hook + up to this many list rows, paginated in the renderer, + 1 CTA). */
const MAX_COMPANIES = 24;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function timeTag(time?: string): 'BMO' | 'AMC' | null {
  if (time === 'BMO' || time === 'pre_market' || time === 'before-market-open') return 'BMO';
  if (time === 'AMC' || time === 'after_close' || time === 'after-market-close') return 'AMC';
  return null;
}

function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T12:00:00Z');
  const end = new Date(weekEnd + 'T12:00:00Z');
  const startMonth = start.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = end.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'UTC' });
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  return startMonth === endMonth
    ? `${startMonth} ${startDay}-${endDay}, ${year}`
    : `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

const FIXED_DISCLAIMER = 'Not financial advice. Data from Twelve Data, current as of posting. Dates can change; always confirm before the market moves.';

const SYSTEM_PROMPT = `You write short, punchy Instagram copy for BullPen, a financial app for beginner-to-intermediate investors.

Voice: confident, clear, never hype-y. No emoji spam (0-1 max, only if it genuinely fits). Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead.

DATA FIDELITY (critical): you are given a real, fixed list of companies reporting earnings this week. Use ONLY those company names and tickers. Do not add, invent, or imply any other company. Do not state specific dates, times, or numbers beyond what's given — the slide images already show the exact schedule.

Output ONLY a JSON object with exactly two fields, nothing else, no markdown fences:
{
  "headline": "a punchy hook under 10 words for the first slide, no ticker required",
  "caption": "a 2-4 sentence Instagram caption teasing the week ahead, mentioning at most 3 of the given companies by name, ending with a soft call to action to check the full calendar on BullPen"
}`;

interface RawEarningsRow {
  symbol: string;
  name?: string;
  date: string;
  time?: string;
  market_cap: number | null;
}

async function writeHookAndCaption(
  companies: RawEarningsRow[],
  weekLabel: string
): Promise<{ headline: string; caption: string }> {
  const listText = companies
    .map((c) => `- ${c.symbol}${c.name ? ` (${c.name})` : ''} on ${c.date}${c.time ? ` [${c.time}]` : ''}`)
    .join('\n');

  const userPrompt = `Week of ${weekLabel}. Companies reporting earnings (use ONLY these):\n${listText || '(no major companies confirmed yet this week)'}\n\nWrite the headline and caption now.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  void logAiCall({
    userId: null,
    feature: 'instagram_content',
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { contentType: 'earnings_calendar', weekLabel },
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content for earnings-calendar hook/caption');
  }

  const { headline, caption } = parseHookAndCaption(textBlock.text);
  return { headline, caption: `${caption}\n\n${FIXED_DISCLAIMER}` };
}

/**
 * Builds the full slide content for a week's earnings-calendar carousel.
 * Real data first, Claude second, grounded in that data — see file header.
 */
export async function generateEarningsCalendarContent(
  weekStart: string,
  weekEnd: string
): Promise<EarningsCalendarSlides> {
  const [raw, activeUniverse] = await Promise.all([
    getEarningsCalendarRange(weekStart, weekEnd),
    getActiveUniverse(),
  ]);

  const activeSet = new Set(activeUniverse);
  const filtered = raw
    .filter((item) => activeSet.has(item.symbol))
    .sort((a, b) => {
      const aTier = NASDAQ100_SET.has(a.symbol) ? 0 : 1;
      const bTier = NASDAQ100_SET.has(b.symbol) ? 0 : 1;
      if (aTier !== bTier) return aTier - bTier;
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.symbol.localeCompare(b.symbol);
    });

  const withCaps = await attachMarketCap(filtered);
  const shown = withCaps.slice(0, MAX_COMPANIES);
  const overflowCount = Math.max(0, withCaps.length - shown.length);

  const weekLabel = formatWeekLabel(weekStart, weekEnd);

  const { headline, caption } = await writeHookAndCaption(
    shown.map((c) => ({ symbol: c.symbol, name: c.name, date: c.date, time: c.time, market_cap: c.market_cap })),
    weekLabel
  );

  const companies: EarningsSlideCompany[] = shown.map((c) => ({
    symbol: c.symbol,
    name: c.name ?? c.symbol,
    date: c.date,
    time: timeTag(c.time),
    marketCap: c.market_cap,
  }));

  return {
    contentType: 'earnings_calendar',
    headline,
    weekLabel,
    companies,
    overflowCount,
    caption,
  };
}
