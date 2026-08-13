/**
 * Earnings-calendar content for the automated Instagram pipeline.
 *
 * WHICH companies report and WHEN comes from Claude's web search (see
 * earnings-web-search.ts) rather than TwelveData's /earnings_calendar —
 * that endpoint only carries dates TwelveData has confirmed, which lags
 * 3-6 weeks behind for most companies, routinely later than this post's
 * one-week-ahead publish schedule. See earnings-web-search.ts's file
 * header for the full reasoning, including source-legitimacy notes.
 *
 * Everything else — company name, logo, market cap — still comes from
 * BullPen's own data (screener_stats via attachCalendarMeta, the logo
 * proxy), never from Claude. The result is filtered to SIGNIFICANT_TICKERS
 * (S&P 500 + Nasdaq 100) plus one manual exception (see INSTAGRAM_ALLOWLIST
 * below), same scope as before.
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
 * Claude cost: the web-search lookup (~a few cents/run, see
 * earnings-web-search.ts) plus a short, non-web-search hook/caption call
 * (~$0.01/run) — see lib/billing/log-ai-call.ts for where both are logged
 * (feature: 'instagram_content').
 */

import Anthropic from '@anthropic-ai/sdk';
import { fetchConfirmedEarnings } from './earnings-web-search';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';
import { attachCalendarMeta } from '@/lib/market-data/calendar-market-cap';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { parseHookAndCaption } from './schema';
import type { EarningsCalendarSlides, EarningsSlideCompany } from './schema';

const NASDAQ100_SET = new Set(NASDAQ100_TICKERS);
const MODEL = 'claude-sonnet-4-6';
/** Companies per carousel — caps the list slides at a sane carousel length
 *  (1 hook + up to this many list rows, paginated in the renderer, + 1 CTA). */
const MAX_COMPANIES = 24;

/**
 * SIGNIFICANT_TICKERS (S&P 500 + Nasdaq 100) plus manual, individually-
 * vetted additions — index membership alone misses genuinely relevant
 * names that are simply too newly public to be index-eligible yet.
 * Deliberately a curated list, not a dynamic trending feed: precise and
 * auditable, at the cost of needing a human to add the next one.
 *
 * - TSM (Taiwan Semiconductor, NYSE ADR): neither S&P 500-eligible
 *   (foreign-domiciled) nor Nasdaq 100-eligible (NYSE-listed, not Nasdaq),
 *   but its TwelveData earnings history is clean and reliable, and it's
 *   genuinely market-moving for a tech-focused audience. Checked live
 *   against TwelveData before adding: Samsung's only US data is a thin
 *   OTC pink-sheet ticker (SSNLF) with irregular/unreliable report dates,
 *   and SK Hynix has no usable US ticker at all — neither is a realistic
 *   addition through this data source.
 * - CRWV (CoreWeave) and NBIS (Nebius Group): both real, sizable
 *   companies ($58B/$66B market cap as of 2026-08-13, per screener_stats —
 *   larger than plenty of S&P 500 constituents) at the center of the AI
 *   infrastructure trade, too recently public to be index members yet.
 *   Confirmed clean name/market-cap coverage in screener_stats before
 *   adding (2026-08-13).
 */
const INSTAGRAM_ALLOWLIST: Set<string> = new Set([...SIGNIFICANT_TICKERS, 'TSM', 'CRWV', 'NBIS']);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Resolves one ticker's logo via the same self-healing proxy CompanyLogo
 * uses everywhere else in the app (/api/logo/[ticker] — cache lookup first,
 * then companies.logo_url, then a 1-credit TwelveData fetch on a true cold
 * miss). Resolved once here, at generation time, rather than left for the
 * render route to fetch — the renderer should only ever see a known-good
 * URL or null, never have to follow a redirect or handle a 404 itself.
 * Almost always a cache hit in practice: every ticker here is S&P 500/
 * Nasdaq 100/TSM, the same major names already displayed constantly
 * elsewhere in the app.
 */
async function resolveLogoUrl(appUrl: string, ticker: string): Promise<string | null> {
  try {
    const res = await fetch(`${appUrl}/api/logo/${encodeURIComponent(ticker)}`, { redirect: 'follow' });
    if (!res.ok) return null;
    return res.url;
  } catch {
    return null;
  }
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

const FIXED_DISCLAIMER = 'Not financial advice. Report dates gathered from public sources as of posting. Dates can change; always confirm before the market moves.';

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
  return { headline, caption: `${caption}\n\n${FIXED_DISCLAIMER}` };
}

/**
 * Builds the full slide content for a week's earnings-calendar carousel.
 * Real data first, Claude second, grounded in that data — see file header.
 *
 * Returns null when no allowlisted company has a confirmed report that
 * week — the caller skips posting entirely rather than publishing a
 * "quiet week" filler post. No Claude call is made in that case either,
 * since there would be nothing real to write about.
 */
export async function generateEarningsCalendarContent(
  weekStart: string,
  weekEnd: string
): Promise<EarningsCalendarSlides | null> {
  // WHICH companies + WHEN comes from Claude's web search, not TwelveData —
  // see earnings-web-search.ts's file header for why. Claude supplies only
  // symbol/date/time; name and market cap are hydrated below from BullPen's
  // own screener_stats, never trusted from the model.
  const hits = await fetchConfirmedEarnings(weekStart, weekEnd);

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
