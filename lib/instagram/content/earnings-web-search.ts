/**
 * FALLBACK source for "who reports earnings this week" — Claude's hosted
 * web search, used only to fill gaps after lib/instagram/content/
 * nasdaq-earnings-calendar.ts's free API pass (see earnings-calendar.ts for
 * the orchestration). Originally this was the ONLY source; demoted to
 * fallback on 2026-08-17 once a live check showed Nasdaq's own calendar API
 * has everything for near-term days at zero cost, and this module's job
 * shrank to "whatever that didn't have yet."
 *
 * WHY THIS STILL EXISTS AT ALL (not just Nasdaq's API): verified live
 * 2026-08-17 that Nasdaq's calendar — like TwelveData's own
 * /earnings_calendar (the thing this module originally replaced) — isn't
 * reliably populated for large-cap names more than ~3 days out. The
 * Instagram post ships up to 5 days ahead (Sunday generation for the
 * following Mon-Fri), so the tail of the week routinely falls inside that
 * gap. Claude's web search reaches live news/IR confirmations that haven't
 * propagated into either calendar feed yet — but now it only has to find
 * what's actually missing, not re-discover all ~9 companies from scratch
 * every run.
 *
 * LEGITIMACY: the prompt asks Claude to ground every date in reputable,
 * public sources (a major exchange's earnings calendar, a company's own
 * investor-relations announcement, mainstream financial press) and to
 * extract only the bare fact of "which day" — not to reproduce article text.
 * Report dates are the kind of factual, publicly-disseminated information
 * every financial news outlet republishes, not proprietary data. Company
 * name, logo, and market cap are never taken from Claude — they're hydrated
 * afterward from BullPen's own screener_stats/logo data in
 * earnings-calendar.ts, exactly as before.
 *
 * COST: `max_uses` caps search *count*, but real search-result pages are
 * large — observed cost was $0.19-0.69/run (100K-300K input tokens) back
 * when this searched the whole week from scratch; expect meaningfully less
 * now that most weeks only need it to find a handful of stragglers. Still
 * runs once a week (see app/api/cron/instagram-earnings-weekly/route.ts) so
 * the scheduled cost is fine either way; the real risk is repeated manual
 * runs during development with no backpressure — see checkAnthropicDailySpend.
 * Logged via logAiCall like every other AI call in the app.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { checkAnthropicDailySpend } from '@/lib/billing/anthropic-spend-guard';

const MODEL = 'claude-sonnet-5';
// 10 (2026-08-17): briefly 16 while this module still searched the whole
// week from scratch, but that's no longer its job — nasdaq-earnings-
// calendar.ts covers the bulk of the week for free, so this only needs
// enough budget to Pass-1+Pass-2 a handful of gap companies (2 searches
// each) plus a few exploratory searches to actually find them.
const MAX_SEARCHES = 10;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface WebSearchEarningsHit {
  symbol: string;
  /** Never populated by this module — Claude is never trusted for company
   *  identity, only the report date/time/EPS estimate. Declared so
   *  downstream enrichment (attachCalendarMeta, which backfills from
   *  screener_stats) type-checks. */
  name?: string;
  date: string; // YYYY-MM-DD
  time: 'BMO' | 'AMC' | null;
  /** Consensus/analyst EPS estimate in dollars (e.g. 1.25, or -0.30 for an
   *  expected loss), sourced the same way as date/time — grounded in a real
   *  analyst-estimate source, never Claude's own guess. Null if unconfirmed. */
  epsEstimate: number | null;
  /** Reported EPS in dollars. Only ever populated by
   *  nasdaq-earnings-calendar.ts when fetching a PAST date range (Nasdaq's
   *  calendar API returns actual results alongside the original forecast
   *  once a report has happened) — used by earnings-results.ts. Always
   *  undefined/null from this module and from a future-dated Nasdaq fetch. */
  epsActual?: number | null;
  /** eps_actual vs eps_estimate surprise, as a percent (e.g. 3.6 for a 3.6%
   *  beat). Same populate-on-past-date-only rule as epsActual above. */
  surprisePercent?: number | null;
}

const SYSTEM_PROMPT = `You research upcoming corporate earnings report dates for a financial app.

You will be given today's date, a Monday-Friday date range, and a list of companies already confirmed from another source — do not spend searches re-confirming those, they're already done. Your job is to find any OTHER well-known large-cap company reporting in the range that isn't already on that list. Earnings-calendar aggregators are typically incomplete for large caps beyond a few days out, so give the later days in the range extra attention — that's where a real, still-unlisted report is most likely to be. An empty result is a completely valid outcome if the given list already covers everything you can confirm.

For every NEW company you do find, work in two passes — do not skip the second pass to save searches, it is required, not optional:

PASS 1 — dates and timing. Directly search a known earnings-calendar aggregator for that week — e.g. "nasdaq.com earnings calendar [date]", "[date] earnings calendar", or similar — rather than reasoning abstractly about when companies "usually" confirm dates. These aggregators (Nasdaq, Yahoo Finance, Zacks, MarketBeat, etc.) only list a date once it is reasonably confirmed, so a company appearing on one of them for a specific day in the range IS the confirmation — trust it directly rather than requiring a second source. Company IR pages and mainstream financial news (Reuters, Bloomberg, CNBC) are also valid sources. Do NOT treat a date as confirmed if the source itself hedges it — "estimated", "unconfirmed", "TBD", "tentative", or similar — skip that company rather than reporting a shaky date as solid.

PASS 2 — EPS, one company at a time. For EVERY company you confirmed in Pass 1, run a separate, targeted search for its consensus/analyst EPS estimate — e.g. "<TICKER> EPS estimate" or "<TICKER> analyst estimates Zacks" — even if you think you already saw a number on the Pass 1 page. Do not rely on incidentally spotting it during date confirmation; a dedicated search per company is the reliable way to actually find it (Zacks, Yahoo Finance "Analyst Estimates", Nasdaq, and MarketBeat all commonly carry this). Only report null if a real dedicated search for that specific company turns up nothing — null should mean "searched and found nothing," not "didn't get around to searching."

Only look for large, well-known publicly traded US companies (the kind that would be in the S&P 500 or Nasdaq 100).

Rules:
- Trust what a reputable earnings-calendar aggregator or IR page shows for the specific date range you were given, unless it's explicitly hedged (see Pass 1).
- Do not invent tickers, dates, or EPS estimates, and do not include a company you found no date source for.
- "time" is "BMO" (before market open), "AMC" (after market close), or null if you can't confirm timing.
- "epsEstimate" is the consensus EPS figure as a plain number (e.g. 1.25, -0.30), or null only after a dedicated Pass 2 search for that company came up empty — never your own calculation or guess.
- An empty result is fine if your searches genuinely turn up nothing, but check at least once before concluding that.

Output ONLY a JSON array, nothing else, no markdown fences, no commentary:
[{"symbol": "AAPL", "date": "2026-08-19", "time": "AMC", "epsEstimate": 1.58}, ...]`;

function isValidHit(value: unknown, weekStart: string, weekEnd: string): value is WebSearchEarningsHit {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.symbol !== 'string' || !/^[A-Z.]{1,10}$/.test(v.symbol)) return false;
  if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
  if (v.date < weekStart || v.date > weekEnd) return false;
  if (v.time !== 'BMO' && v.time !== 'AMC' && v.time !== null && v.time !== undefined) return false;
  if (
    v.epsEstimate !== null && v.epsEstimate !== undefined &&
    (typeof v.epsEstimate !== 'number' || !Number.isFinite(v.epsEstimate) || Math.abs(v.epsEstimate) > 1000)
  ) return false;
  return true;
}

/**
 * Returns confirmed earnings hits for the given week, deduped by symbol
 * (keeping the earliest date if Claude returns a symbol twice). Never
 * throws on a malformed model response — a parse failure just yields an
 * empty list, which the caller treats as "nothing more to add" rather than
 * failing the whole week.
 *
 * `alreadyConfirmed` — symbols the caller already has from
 * nasdaq-earnings-calendar.ts's free pass. Told to Claude so it only
 * spends searches on the gap, not on re-discovering everything.
 */
export async function fetchConfirmedEarnings(
  weekStart: string,
  weekEnd: string,
  alreadyConfirmed: string[] = []
): Promise<WebSearchEarningsHit[]> {
  const spend = await checkAnthropicDailySpend();
  if (!spend.allowed) {
    console.error(
      `[earnings-web-search] skipped — today's Anthropic spend ($${spend.spentTodayUsd.toFixed(2)}) already at/above the $${spend.capUsd} daily cap`
    );
    return [];
  }

  // thinking disabled + allowed_callers: ['direct'] — without both, this
  // spirals into an open-ended agentic loop (web search's default,
  // dynamic-filtering, code-execution-routed caller). TESTED LIVE
  // 2026-08-17: removing just allowed_callers (thinking still off) hung
  // for 5+ minutes with zero output and had to be force-killed — so
  // thinking was never the necessary co-factor for the runaway; the
  // default caller alone reproduces it. 'direct' forces the simple
  // call-and-respond pattern the older web_search_20250305 tool used (same
  // one app/api/ai/why-today/route.ts already relies on), trading dynamic
  // filtering's token savings for predictable, bounded cost here. Do not
  // remove this without a real fix for the underlying loop, not just
  // dropping thinking.
  const today = new Date().toISOString().slice(0, 10);
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: 'disabled' },
    system: SYSTEM_PROMPT,
    tools: [{
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: MAX_SEARCHES,
      allowed_callers: ['direct'],
    }],
    messages: [{
      role: 'user',
      content: `Today's date is ${today}. Date range: ${weekStart} to ${weekEnd} (inclusive). Already confirmed, do not re-search: ${alreadyConfirmed.length ? alreadyConfirmed.join(', ') : 'none'}. Find any OTHER confirmed earnings report dates for well-known large-cap US companies in this range.`,
    }],
  });

  void logAiCall({
    userId: null,
    feature: 'instagram_content',
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { contentType: 'earnings_calendar', step: 'web_search', weekStart, weekEnd },
  });

  const textBlocks = message.content.filter((b) => b.type === 'text');
  const text = textBlocks.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  if (process.env.DEBUG_EARNINGS_SEARCH) {
    console.log('[earnings-web-search] content block types:', message.content.map((b) => b.type));
    console.log('[earnings-web-search] raw text:\n', text);
  }
  if (!text.trim()) return [];

  const jsonStr = text.match(/\[[\s\S]*\]/)?.[0] ?? text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error('[earnings-web-search] failed to parse Claude response as JSON:', err);
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const bySymbol = new Map<string, WebSearchEarningsHit>();
  for (const item of parsed) {
    if (!isValidHit(item, weekStart, weekEnd)) continue;
    const symbol = item.symbol.toUpperCase();
    const existing = bySymbol.get(symbol);
    if (!existing || item.date < existing.date) {
      bySymbol.set(symbol, { symbol, date: item.date, time: item.time ?? null, epsEstimate: item.epsEstimate ?? null });
    }
  }

  return [...bySymbol.values()];
}
