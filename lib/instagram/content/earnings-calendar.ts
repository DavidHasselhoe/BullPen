/**
 * Earnings-calendar content for the automated Instagram pipeline.
 *
 * WHICH companies report and WHEN comes from two sources, in order:
 *
 * 1. nasdaq-earnings-calendar.ts — Nasdaq's free public calendar API. Zero
 *    cost, and verified live 2026-08-17 to be complete and accurate for
 *    near-term days (this week's 9-company retail-earnings week came back
 *    with every date, every BMO/AMC, and every EPS estimate correct).
 * 2. earnings-web-search.ts — Claude web search, now a FALLBACK only. Told
 *    which companies Nasdaq's API already confirmed so it doesn't re-search
 *    them; its job is just to find whatever Nasdaq's calendar doesn't have
 *    yet. This still matters because Nasdaq's calendar has the same "not
 *    populated for large caps until ~3 days out" gap that got TwelveData's
 *    /earnings_calendar dropped in the first place — the tail of a
 *    Sunday-generated Mon-Fri week (Thu/Fri) routinely falls inside that
 *    gap. See earnings-web-search.ts's file header for the full history.
 *
 * Everything else — company name, logo, market cap — still comes from
 * BullPen's own data (screener_stats via attachCalendarMeta, the logo
 * proxy), never from Claude or Nasdaq's payload. The result is filtered to
 * INSTAGRAM_ALLOWLIST (see ./allowlist.ts) — S&P 500 + Nasdaq 100 plus
 * curated additions — shared with earnings-results.ts so both content types
 * name the same set of companies.
 * Deliberately narrower than app/api/calendar/earnings/route.ts's in-app
 * Market Calendar, which widened to the full ~1200-ticker active screener
 * universe earlier this session — that's the right call for a browsable
 * in-app tool, but public Instagram content should only ever name companies
 * a general audience would actually recognize.
 *
 * Claude never produces the hook/caption's factual data either — that call
 * only writes copy, grounded in the real list already resolved above. This
 * keeps hallucination risk on the slide's numbers at zero, not just "low":
 * there is no code path where the model's own knowledge could reach them.
 *
 * Claude cost: the web-search gap-fill (now usually cheaper than the old
 * whole-week search, see earnings-web-search.ts) plus a short, non-web-search
 * hook/caption call (~$0.01/run) — see lib/billing/log-ai-call.ts for where
 * both are logged (feature: 'instagram_content').
 */

import Anthropic from '@anthropic-ai/sdk';
import { fetchConfirmedEarnings } from './earnings-web-search';
import { fetchNasdaqEarningsCalendar } from './nasdaq-earnings-calendar';
import { attachCalendarMeta } from '@/lib/market-data/calendar-market-cap';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { parseHookAndCaption } from './schema';
import { INSTAGRAM_ALLOWLIST, NASDAQ100_SET } from './allowlist';
import { FIXED_DISCLAIMER, FIXED_HASHTAGS, formatWeekLabel, resolveLogoUrl } from './shared';
import type { EarningsCalendarSlides, EarningsSlideCompany } from './schema';
import type { WebSearchEarningsHit } from './earnings-web-search';

const MODEL = 'claude-sonnet-4-6';
/** Companies per carousel — caps the list slides at a sane carousel length
 *  (1 hook + up to this many list rows, paginated in the renderer, + 1 CTA). */
const MAX_COMPANIES = 24;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  time: 'BMO' | 'AMC' | null;
  market_cap: number | null;
}

async function writeHookAndCaption(
  companies: RawEarningsRow[],
  weekLabel: string
): Promise<{ headline: string; caption: string }> {
  // Never called with an empty list — generateEarningsCalendarContent
  // returns null before reaching here when there's nothing to report.
  const listText = companies
    .map((c) => `- ${c.symbol}${c.name ? ` (${c.name})` : ''} on ${c.date}${c.time ? ` [${c.time}]` : ''}`)
    .join('\n');

  const userPrompt = `Week of ${weekLabel}. Companies reporting earnings (use ONLY these):\n${listText}\n\nWrite the headline and caption now.`;

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
  return { headline, caption: `${caption}\n\n${FIXED_DISCLAIMER}\n\n${FIXED_HASHTAGS}` };
}

/**
 * Builds the full slide content for a week's earnings-calendar carousel.
 * Real data first, Claude second, grounded in that data — see file header.
 *
 * Returns null when no allowlisted company has a confirmed report that
 * week — the caller skips posting entirely rather than publishing a
 * "quiet week" filler post. The Claude fallback call still runs even on an
 * apparently-quiet week (Nasdaq's calendar coming back empty isn't
 * distinguishable from "not populated yet" without asking), but it's a
 * single targeted search rather than the old whole-week discovery call.
 */
export async function generateEarningsCalendarContent(
  weekStart: string,
  weekEnd: string
): Promise<EarningsCalendarSlides | null> {
  // WHICH companies + WHEN: Nasdaq's free calendar API first (zero cost),
  // then Claude web search only for whatever it's missing — see this file's
  // header and earnings-web-search.ts's for why both are needed. Neither
  // supplies company name/market cap; those are hydrated below from
  // BullPen's own screener_stats, never trusted from either source.
  const nasdaqHits = await fetchNasdaqEarningsCalendar(weekStart, weekEnd, INSTAGRAM_ALLOWLIST);
  const gapFillHits = await fetchConfirmedEarnings(weekStart, weekEnd, nasdaqHits.map((h) => h.symbol));

  const bySymbol = new Map<string, WebSearchEarningsHit>();
  for (const hit of nasdaqHits) bySymbol.set(hit.symbol, hit);
  for (const hit of gapFillHits) {
    if (!bySymbol.has(hit.symbol)) bySymbol.set(hit.symbol, hit); // Nasdaq wins any overlap
  }
  const hits = [...bySymbol.values()];

  const filtered = hits
    .filter((item) => INSTAGRAM_ALLOWLIST.has(item.symbol))
    .sort((a, b) => {
      const aTier = NASDAQ100_SET.has(a.symbol) ? 0 : 1;
      const bTier = NASDAQ100_SET.has(b.symbol) ? 0 : 1;
      if (aTier !== bTier) return aTier - bTier;
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.symbol.localeCompare(b.symbol);
    });

  if (filtered.length === 0) return null;

  const withMeta = await attachCalendarMeta(filtered);
  const shown = withMeta.slice(0, MAX_COMPANIES);
  const overflowCount = Math.max(0, withMeta.length - shown.length);

  const weekLabel = formatWeekLabel(weekStart, weekEnd);

  const { headline, caption } = await writeHookAndCaption(
    shown.map((c) => ({ symbol: c.symbol, name: c.name, date: c.date, time: c.time, market_cap: c.market_cap })),
    weekLabel
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  const logoUrls = await Promise.all(shown.map((c) => resolveLogoUrl(appUrl, c.symbol)));

  const companies: EarningsSlideCompany[] = shown.map((c, i) => ({
    symbol: c.symbol,
    name: c.name ?? c.symbol,
    date: c.date,
    time: c.time,
    epsEstimate: c.epsEstimate ?? null,
    marketCap: c.market_cap,
    logoUrl: logoUrls[i],
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
