/**
 * Sources "who reports earnings this week" for the Instagram carousel via
 * Claude's hosted web search, instead of TwelveData's /earnings_calendar.
 *
 * WHY NOT TwelveData: /earnings_calendar only carries CONFIRMED dates, and
 * TwelveData only confirms roughly 3-6 weeks out (see the TTL comment in
 * lib/market-data/calendar-days.ts). The Instagram post ships about a week
 * ahead, which is routinely inside that lag — a real week with real reports
 * can look empty at generation time, indistinguishable from a genuinely
 * quiet week. Claude's web search reaches live news/IR confirmations that
 * haven't propagated into TwelveData's feed yet.
 *
 * LEGITIMACY: the prompt asks Claude to ground every date in reputable,
 * public sources (a major exchange's earnings calendar, a company's own
 * investor-relations announcement, mainstream financial press) and to
 * extract only the bare fact of "which day" — not to reproduce article text.
 * Report dates are the kind of factual, publicly-disseminated information
 * every financial news outlet republishes, not proprietary data. Company
 * name, logo, and market cap are never taken from Claude — they're hydrated
 * afterward from BullPen's own screener_stats/logo data in
 * earnings-calendar.ts, exactly as before. Claude only ever supplies the one
 * fact TwelveData is late on: which day a given ticker reports.
 *
 * COST: `max_uses` caps this at 6 searches per run. At Anthropic's hosted
 * web-search pricing plus a few hundred tokens of search-result content,
 * one run costs low-single-digit cents; this only runs once a week (see
 * app/api/cron/instagram-earnings-weekly/route.ts), so the monthly cost is
 * negligible. Logged via logAiCall like every other AI call in the app.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logAiCall } from '@/lib/billing/log-ai-call';

const MODEL = 'claude-sonnet-5';
const MAX_SEARCHES = 6;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface WebSearchEarningsHit {
  symbol: string;
  /** Never populated by this module — Claude is never trusted for company
   *  identity, only the report date/time. Declared so downstream enrichment
   *  (attachCalendarMeta, which backfills from screener_stats) type-checks. */
  name?: string;
  date: string; // YYYY-MM-DD
  time: 'BMO' | 'AMC' | null;
}

const SYSTEM_PROMPT = `You research upcoming corporate earnings report dates for a financial app.

You will be given today's date and a Monday-Friday date range. Your first move should be to directly search a known earnings-calendar aggregator for that week — e.g. "nasdaq.com earnings calendar [date]", "[date] earnings calendar", or similar — rather than reasoning abstractly about when companies "usually" confirm dates. These aggregators (Nasdaq, Yahoo Finance, Zacks, MarketBeat, etc.) only list a date once it is reasonably confirmed, so a company appearing on one of them for a specific day in the range IS the confirmation — trust it directly rather than requiring a second source. Company IR pages and mainstream financial news (Reuters, Bloomberg, CNBC) are also valid sources.

Only look for large, well-known publicly traded US companies (the kind that would be in the S&P 500 or Nasdaq 100).

Rules:
- Trust what a reputable earnings-calendar aggregator or IR page shows for the specific date range you were given.
- Do not invent tickers or dates, and do not include a company you found no source for.
- "time" is "BMO" (before market open), "AMC" (after market close), or null if you can't confirm timing.
- An empty result is fine if your searches genuinely turn up nothing, but check at least once before concluding that.

Output ONLY a JSON array, nothing else, no markdown fences, no commentary:
[{"symbol": "AAPL", "date": "2026-08-19", "time": "AMC"}, ...]`;

function isValidHit(value: unknown, weekStart: string, weekEnd: string): value is WebSearchEarningsHit {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.symbol !== 'string' || !/^[A-Z.]{1,10}$/.test(v.symbol)) return false;
  if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
  if (v.date < weekStart || v.date > weekEnd) return false;
  if (v.time !== 'BMO' && v.time !== 'AMC' && v.time !== null && v.time !== undefined) return false;
  return true;
}

/**
 * Returns confirmed earnings hits for the given week, deduped by symbol
 * (keeping the earliest date if Claude returns a symbol twice). Never
 * throws on a malformed model response — a parse failure just yields an
 * empty list, which the caller treats as "nothing confirmed yet" and skips
 * posting, the same as a real quiet week.
 */
export async function fetchConfirmedEarnings(
  weekStart: string,
  weekEnd: string
): Promise<WebSearchEarningsHit[]> {
  // thinking disabled + allowed_callers: ['direct'] — without both, this
  // spiraled into an open-ended agentic loop (extended thinking + web search
  // routed through code execution, web_search_20260209's default caller)
  // that ran 20+ tool-use steps for one weekly lookup. 'direct' forces the
  // simple call-and-respond pattern the older web_search_20250305 tool used
  // (same one app/api/ai/why-today/route.ts already relies on), trading
  // dynamic filtering's token savings for predictable, bounded cost here.
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
      content: `Today's date is ${today}. Date range: ${weekStart} to ${weekEnd} (inclusive). Find confirmed earnings report dates for well-known large-cap US companies in this range.`,
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
      bySymbol.set(symbol, { symbol, date: item.date, time: item.time ?? null });
    }
  }

  return [...bySymbol.values()];
}
