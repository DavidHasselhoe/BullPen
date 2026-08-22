/**
 * Earnings-results content for the automated Instagram pipeline — the
 * Saturday "how did the week's earnings go" recap. Companion to
 * earnings-calendar.ts's forward-looking week-ahead post; reuses the exact
 * same visual template (lib/instagram/render/slides.tsx) and house style
 * (./shared.ts), just for the week that just ended instead of the week
 * ahead.
 *
 * WHICH companies reported, and their actual-vs-estimate EPS, both come
 * from the same free Nasdaq calendar API earnings-calendar.ts already uses
 * (nasdaq-earnings-calendar.ts) — queried for the week that just ended
 * instead of the week ahead. Verified live 2026-08-22: unlike the ~3-day
 * forward-population gap that forces a Claude web-search fallback for the
 * lookahead post, a PAST date's response already carries `eps` (actual),
 * `epsForecast` (estimate), and `surprise` (%) together, so no discovery
 * fallback is needed here — Nasdaq's historical calendar is reliably
 * populated. This also means this generator does NOT depend on last week's
 * earnings_calendar post existing in instagram_posts; it re-derives the
 * week's reporters independently, the same way the lookahead post does.
 *
 * A per-company TwelveData getCompanyEarnings() call (20 credits/symbol,
 * the same endpoint components/stock/EarningsCalendar.tsx already uses
 * in-app) is a narrow FALLBACK only for whatever gap Nasdaq's feed leaves —
 * an allowlisted company Nasdaq confirmed reported that week but didn't
 * carry a full estimate+actual pair for. Never called for the whole
 * universe, only for that small confirmed-but-incomplete set.
 *
 * Claude never produces the actual EPS numbers or the beat/missed
 * classification — only the hook/caption copy, grounded in a real,
 * pre-computed list (same "real data first, Claude only writes copy" rule
 * as earnings-calendar.ts).
 *
 * Beat/missed uses `actual >= estimate`, the same rule already shown to
 * users in-app (components/stock/EarningsCalendar.tsx's beat/miss streak) —
 * a company that met the number exactly counts as a beat there, so it does
 * here too, rather than inventing a third "in line" state nothing else in
 * the app has.
 */

import Anthropic from '@anthropic-ai/sdk';
import { fetchNasdaqEarningsCalendar } from './nasdaq-earnings-calendar';
import { getCompanyEarnings, TwelveDataRateLimitError } from '@/lib/market-data';
import { attachCalendarMeta } from '@/lib/market-data/calendar-market-cap';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { parseHookAndCaption } from './schema';
import { INSTAGRAM_ALLOWLIST, NASDAQ100_SET } from './allowlist';
import { FIXED_DISCLAIMER, FIXED_HASHTAGS, formatWeekLabel, resolveLogoUrl } from './shared';
import type { EarningsResultsSlides, EarningsResultCompany } from './schema';
import type { WebSearchEarningsHit } from './earnings-web-search';

const MODEL = 'claude-sonnet-4-6';
/** Same cap as earnings-calendar.ts, kept as an independent constant since
 *  the two generators are otherwise decoupled modules. */
const MAX_COMPANIES = 24;
/** Concurrency for the TwelveData gap-fill pass — this set is always small
 *  (Nasdaq-confirmed reporters missing one data point, not the whole
 *  week), but chunking keeps it a bounded, polite burst rather than an
 *  unbounded Promise.all across however many companies came up short. */
const FALLBACK_CHUNK_SIZE = 5;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface FallbackEarnings {
  estimate: number | null;
  actual: number | null;
  surprisePercent: number | null;
}

/**
 * TwelveData /earnings fallback for symbols Nasdaq confirmed reported this
 * week but didn't supply a full estimate+actual pair for. Never throws —
 * a rate limit or lookup failure for one symbol just leaves it out of the
 * result map, which the caller treats as "still unconfirmed" (that company
 * gets dropped from the post rather than shown with a fabricated number).
 */
async function fetchFallbackActuals(
  symbols: string[],
  weekStart: string,
  weekEnd: string
): Promise<Map<string, FallbackEarnings>> {
  const result = new Map<string, FallbackEarnings>();
  if (symbols.length === 0) return result;

  for (let i = 0; i < symbols.length; i += FALLBACK_CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + FALLBACK_CHUNK_SIZE);
    const settled = await Promise.allSettled(chunk.map((symbol) => getCompanyEarnings(symbol, 4)));
    settled.forEach((outcome, idx) => {
      const symbol = chunk[idx];
      if (outcome.status !== 'fulfilled') {
        if (!(outcome.reason instanceof TwelveDataRateLimitError)) {
          console.error(`[earnings-results] getCompanyEarnings failed for ${symbol}:`, outcome.reason);
        }
        return;
      }
      const match = outcome.value.find(
        (e) => e.period >= weekStart && e.period <= weekEnd && e.actual != null && e.estimate != null
      );
      if (match) {
        result.set(symbol, { estimate: match.estimate, actual: match.actual, surprisePercent: match.surprisePercent });
      }
    });
  }
  return result;
}

const SYSTEM_PROMPT = `You write short, punchy Instagram copy for BullPen, a financial app for beginner-to-intermediate investors.

Voice: confident, clear, never hype-y. No emoji spam (0-1 max, only if it genuinely fits). Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead.

DATA FIDELITY (critical): you are given a real, fixed list of companies that reported earnings this past week, each already labeled BEAT or MISSED analyst EPS estimates. Use ONLY those company names and tickers, and ONLY the beat/missed label already given for each. Do not add, invent, or imply any other company or outcome, and do not state specific EPS numbers or surprise percentages beyond what's given — the slide images already show the exact figures.

Output ONLY a JSON object with exactly two fields, nothing else, no markdown fences:
{
  "headline": "a punchy hook under 10 words summarizing how the week went overall, no ticker required",
  "caption": "a 2-4 sentence Instagram caption recapping the week's earnings results, mentioning at most 3 of the given companies by name, ending with a soft call to action to see the full recap on BullPen"
}`;

interface ResultRow {
  symbol: string;
  name?: string;
  date: string;
  time: 'BMO' | 'AMC' | null;
  epsEstimate: number;
  epsActual: number;
  surprisePercent: number | null;
  status: 'beat' | 'missed';
}

async function writeHookAndCaption(
  companies: ResultRow[],
  weekLabel: string,
  beatCount: number,
  missedCount: number
): Promise<{ headline: string; caption: string }> {
  const listText = companies
    .map((c) => `- ${c.symbol}${c.name ? ` (${c.name})` : ''}: ${c.status === 'beat' ? 'BEAT' : 'MISSED'}`)
    .join('\n');

  const userPrompt = `Week of ${weekLabel}. ${beatCount} of ${beatCount + missedCount} companies beat analyst EPS estimates, ${missedCount} missed. Results (use ONLY these):\n${listText}\n\nWrite the headline and caption now.`;

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
    metadata: { contentType: 'earnings_results', weekLabel },
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content for earnings-results hook/caption');
  }

  const { headline, caption } = parseHookAndCaption(textBlock.text);
  return { headline, caption: `${caption}\n\n${FIXED_DISCLAIMER}\n\n${FIXED_HASHTAGS}` };
}

/**
 * Builds the full slide content for the week-just-ended's earnings-results
 * carousel. Returns null when no allowlisted company has a confirmed
 * estimate+actual pair for the week — the caller skips posting entirely
 * rather than publishing a filler post.
 */
export async function generateEarningsResultsContent(
  weekStart: string,
  weekEnd: string
): Promise<EarningsResultsSlides | null> {
  const hits = await fetchNasdaqEarningsCalendar(weekStart, weekEnd, INSTAGRAM_ALLOWLIST);

  const bySymbol = new Map<string, WebSearchEarningsHit>();
  for (const hit of hits) {
    if (!bySymbol.has(hit.symbol)) bySymbol.set(hit.symbol, hit); // first occurrence wins
  }
  const confirmed = [...bySymbol.values()];

  const needsFallback = confirmed.filter((h) => h.epsEstimate == null || h.epsActual == null);
  const fallback = await fetchFallbackActuals(needsFallback.map((h) => h.symbol), weekStart, weekEnd);

  const resolved: ResultRow[] = [];
  for (const h of confirmed) {
    const fb = fallback.get(h.symbol);
    const epsEstimate = h.epsEstimate ?? fb?.estimate ?? null;
    const epsActual = h.epsActual ?? fb?.actual ?? null;
    if (epsEstimate == null || epsActual == null) continue; // still unconfirmed, drop it
    // Prefer whichever source actually supplied the estimate+actual pair
    // used above, rather than mixing e.g. Nasdaq's estimate with a
    // fallback surprise% computed against a different actual.
    const surprisePercent = h.epsEstimate != null && h.epsActual != null
      ? h.surprisePercent ?? null
      : fb?.surprisePercent ?? null;
    resolved.push({
      symbol: h.symbol,
      name: h.name,
      date: h.date,
      time: h.time,
      epsEstimate,
      epsActual,
      surprisePercent,
      status: epsActual >= epsEstimate ? 'beat' : 'missed',
    });
  }

  if (resolved.length === 0) return null;

  const sorted = resolved.sort((a, b) => {
    const aTier = NASDAQ100_SET.has(a.symbol) ? 0 : 1;
    const bTier = NASDAQ100_SET.has(b.symbol) ? 0 : 1;
    if (aTier !== bTier) return aTier - bTier;
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.symbol.localeCompare(b.symbol);
  });
  const shown = sorted.slice(0, MAX_COMPANIES);
  const overflowCount = Math.max(0, sorted.length - shown.length);

  const beatCount = shown.filter((c) => c.status === 'beat').length;
  const missedCount = shown.length - beatCount;

  const weekLabel = formatWeekLabel(weekStart, weekEnd);
  const { headline, caption } = await writeHookAndCaption(shown, weekLabel, beatCount, missedCount);

  const withMeta = await attachCalendarMeta(shown);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  const logoUrls = await Promise.all(withMeta.map((c) => resolveLogoUrl(appUrl, c.symbol)));

  const companies: EarningsResultCompany[] = withMeta.map((c, i) => ({
    symbol: c.symbol,
    name: c.name ?? c.symbol,
    date: c.date,
    time: c.time,
    epsEstimate: c.epsEstimate,
    epsActual: c.epsActual,
    surprisePercent: c.surprisePercent,
    status: c.status,
    marketCap: c.market_cap,
    logoUrl: logoUrls[i],
  }));

  return {
    contentType: 'earnings_results',
    headline,
    weekLabel,
    companies,
    beatCount,
    missedCount,
    overflowCount,
    caption,
  };
}
