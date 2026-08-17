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
 * SIGNIFICANT_TICKERS (S&P 500 + Nasdaq 100) plus one manual exception (see
 * INSTAGRAM_ALLOWLIST below), same scope as before.
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
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';
import { attachCalendarMeta } from '@/lib/market-data/calendar-market-cap';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { parseHookAndCaption } from './schema';
import type { EarningsCalendarSlides, EarningsSlideCompany } from './schema';
import type { WebSearchEarningsHit } from './earnings-web-search';

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
 *   infrastructure trade. NOTE: both were added to the real Nasdaq 100 in
 *   the June 2026 rebalance, but lib/market-data/nasdaq100.ts hasn't been
 *   refreshed to reflect that yet (confirmed missing from that file
 *   2026-08-13) — kept in this manual list until it is, otherwise they'd
 *   silently drop out again. Worth re-checking after nasdaq100.ts is next
 *   updated; if these are in SIGNIFICANT_TICKERS by then, they're
 *   redundant here (harmless either way — this is a Set).
 * - A wider batch added 2026-08-13, all confirmed to have real name +
 *   market-cap coverage in screener_stats before adding (several needed a
 *   one-off fix first — either the row was missing entirely, tier-0 and
 *   never refreshed, or had name literally equal to its own ticker
 *   symbol, the same bug already found and fixed for TGT). Grouped by
 *   theme purely for readability, not a functional distinction:
 *   - Fintech: SOFI, AFRM, CRCL
 *   - EV / mobility: RIVN, LCID, JOBY, ACHR
 *   - Consumer / social: RDDT, RBLX, CVNA, CAVA, OPEN
 *   - Betting / gaming: DKNG
 *   - Crypto-adjacent: BMNR, MARA, RIOT, CLSK
 *   - AI / speculative tech: IONQ, RGTI, QBTS, SYM
 *   - Software / cloud: SNOW, U
 *   Deliberately NOT added: MSTR and ARM are both already in
 *   lib/market-data/nasdaq100.ts, so SIGNIFICANT_TICKERS already covers
 *   them — adding them here too would just be redundant.
 */
const INSTAGRAM_ALLOWLIST: Set<string> = new Set([
  ...SIGNIFICANT_TICKERS,
  'TSM', 'CRWV', 'NBIS',
  'SOFI', 'AFRM', 'CRCL',
  'RIVN', 'LCID', 'JOBY', 'ACHR',
  'RDDT', 'RBLX', 'CVNA', 'CAVA', 'OPEN',
  'DKNG',
  'BMNR', 'MARA', 'RIOT', 'CLSK',
  'IONQ', 'RGTI', 'QBTS', 'SYM',
  'SNOW', 'U',
]);

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

/**
 * Static, not model-generated — Instagram capped posts at 5 hashtags in
 * Dec 2025, and its 2026 algorithm weighs tag-caption relevance over count
 * (mismatched/generic tags now get suppressed rather than ignored), so a
 * small hand-picked set beats letting Claude invent a fresh batch every
 * week for near-zero benefit at real hallucination/drift risk. Mix is
 * deliberate: one broad reach tag (#investing), one broad-but-topical tag
 * (#stockmarket), one exact-moment tag (#earningsseason), and two
 * audience-specific tags matching BullPen's actual beginner-to-intermediate
 * positioning rather than generic finance-influencer tags (#wallstreet,
 * #financialfreedom, etc.) that would draw the wrong audience.
 */
const FIXED_HASHTAGS = '#StockMarket #EarningsSeason #Investing #StocksToWatch #InvestingForBeginners';

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
