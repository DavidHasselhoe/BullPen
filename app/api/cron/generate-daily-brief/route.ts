/**
 * Daily Brief Generation Cron
 * GET /api/cron/generate-daily-brief
 *
 * Runs at 6:30 AM UTC daily (1:30 AM ET) — ready before pre-market open.
 * Generates one shared brief per calendar date for all pro users.
 * Idempotent: skips generation if today's brief already exists.
 *
 * Claude prompt credit cost: dominated by web search input tokens, not output — the
 * ~650-word brief is ~2K output tokens. Each search round resends the accumulated
 * context, so cost scales with the NUMBER of searches: uncapped runs measured
 * ~194–277K input tokens ($0.61–0.86). `max_uses` is the lever that bounds it.
 * TwelveData credit cost: ~60–100 credits (earnings calendar x3 + movers + market quotes).
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase/client';
import type { EarningsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { getCalendarDay } from '@/lib/market-data/calendar-days';
import { getTopMovers, getStockQuotes } from '@/lib/market-data';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { checkAnthropicDailySpend } from '@/lib/billing/anthropic-spend-guard';
import { createDailyBriefReadyNotification } from '@/lib/notifications/notification-creators';

// 300s is Vercel's ceiling and the hard limit this route lives inside. Under
// web_search_20250305 the whole invocation historically finished well within
// 120s, so this is headroom, not a target — see INITIAL_CALL_TIMEOUT_MS below,
// which deliberately cuts a doomed run off long before this fires.
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toETDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Formats a real price-reaction tag (e.g. "[after-hours +4.7%]") from our own
 * TwelveData quotes, so the model has ground truth instead of inferring the
 * reaction from whatever web search articles say — those are often written
 * minutes after the earnings drop and describe an initial move that reverses
 * by the time after-hours trading actually settles (see the 2026-08-27 $NVDA
 * incident: the brief said shares "slid after hours" sourced from early
 * coverage, while our own after-hours quote had it +4.7%).
 *
 * AMC reporters get the after-hours print (extendedQuotes, fetched with
 * prepost:true); BMO/unknown-timing reporters get the regular session's
 * close-to-close move instead — by the time this cron runs (~1:30 AM ET
 * the next day), a BMO reporter's after-hours drift is marginal compared to
 * the regular-session reaction that already priced in the earnings.
 */
function formatPriceReaction(
  isAmc: boolean,
  symbol: string,
  regularQuotes: Map<string, { dp: number }>,
  extendedQuotes: Map<string, { dp: number }>,
): string {
  const source = isAmc ? extendedQuotes.get(symbol) : regularQuotes.get(symbol);
  if (!source || !Number.isFinite(source.dp)) return '';
  const label = isAmc ? 'after-hours' : 'session';
  return ` [${label} ${source.dp >= 0 ? '+' : ''}${source.dp.toFixed(1)}%]`;
}

function formatEarningsRow(
  e: {
    symbol: string;
    name?: string;
    eps_actual?: number | null;
    eps_estimate?: number | null;
    surprise?: number | null;
    time?: string;
  },
  regularQuotes: Map<string, { dp: number }> = new Map(),
  extendedQuotes: Map<string, { dp: number }> = new Map(),
): string {
  const name = e.name ? ` (${e.name})` : '';
  const isBmo = e.time === 'BMO' || e.time === 'pre_market';
  const isAmc = e.time === 'AMC' || e.time === 'after_close';
  const tag = isBmo ? 'BMO' : isAmc ? 'AMC' : '';
  const reaction = formatPriceReaction(isAmc, e.symbol, regularQuotes, extendedQuotes);

  if (e.eps_actual != null && e.eps_estimate != null) {
    const beat = e.eps_actual >= e.eps_estimate ? 'BEAT' : 'MISSED';
    const surprise = e.surprise != null ? ` ${e.surprise > 0 ? '+' : ''}${e.surprise.toFixed(1)}%` : '';
    return `${e.symbol}${name}: EPS $${e.eps_actual.toFixed(2)} vs est $${e.eps_estimate.toFixed(2)}, ${beat}${surprise}${reaction}`;
  }
  return `${e.symbol}${name}${tag ? ` [${tag}]` : ''}${reaction}`;
}

function extractTickers(text: string): string[] {
  // Prompt mandates $TICKER for every stock mention — only match the dollar form
  // to avoid false positives like "EPS", "CEO", "BEAT" leaking into featured_tickers.
  const tickers = Array.from(text.matchAll(/\$([A-Z]{1,5})\b/g), (m) => m[1]);
  return [...new Set(tickers)].slice(0, 20);
}

// Lines that look like Claude's between-tool-call narration, not a real title.
// e.g. "Now I have everything needed for a complete, well-sourced brief. Let me compile it."
//      "All the data I need is now in hand. Here is today's BullPen Daily Market Brief:"
const PREAMBLE_PATTERNS: RegExp[] = [
  /^(now|okay|ok|got it|sure|here|let me|alright|great|perfect|all the|i['’]?(?:ll|ve|m| have| will| can| need)|i need|based on)\b/i,
  /\b(compile|let me|let's|put together|draft|here(?:'s| is)|ready to write|here is today)\b/i,
  // Self-references — a headline never names itself
  /\b(daily (market )?brief|bullpen daily|today['’]?s brief)\b/i,
];

function looksLikePreamble(line: string): boolean {
  if (line.length > 140) return true;                          // titles aren't paragraphs
  if (/^[-*_=]{3,}\s*$/.test(line)) return true;               // horizontal rules (---, ***, ___)
  if (line.trimEnd().endsWith(':')) return true;               // trailing colon = "here comes the brief" intro
  return PREAMBLE_PATTERNS.some((re) => re.test(line));
}

/**
 * Extract the brief's title. The title must appear ABOVE the first `## ` section
 * header. Among candidates, skip lines that look like Claude's tool-orchestration
 * narration (e.g. "Now I have everything needed...") and prefer the line closest
 * to the first `##` (that's the actual headline). Returns null if nothing clean
 * is found — the caller falls back to a date-based title.
 */
function extractTitle(text: string): string | null {
  const firstHeaderIdx = text.search(/(^|\n)##\s/);
  const head = firstHeaderIdx >= 0 ? text.slice(0, firstHeaderIdx) : text;
  const candidates = head
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^["'“]|["'”]$/g, '').trim())
    .filter((l) => l.length > 0);

  for (let i = candidates.length - 1; i >= 0; i--) {
    if (!looksLikePreamble(candidates[i])) return candidates[i];
  }
  return null;
}

/**
 * Trim text that ends mid-sentence (no terminal punctuation on the last line).
 * Walks back to the nearest sentence-ending character so the brief never
 * publishes with a truncated thought.
 */
function trimIncomplete(text: string): string {
  const trimmed = text.trimEnd();
  const lastChar = trimmed[trimmed.length - 1];
  if (['.', '!', '?', ')', '"', '’'].includes(lastChar)) return text;

  // Find the last sentence terminator followed by whitespace or end-of-string
  const lastPeriod = Math.max(
    trimmed.lastIndexOf('. '),
    trimmed.lastIndexOf('.\n'),
    trimmed.lastIndexOf('! '),
    trimmed.lastIndexOf('!\n'),
    trimmed.lastIndexOf('? '),
    trimmed.lastIndexOf('?\n'),
  );
  if (lastPeriod === -1) return text;
  return trimmed.slice(0, lastPeriod + 1).trimEnd();
}

/**
 * Deterministic backstop for the "no em/en dash as a clause connector" rule.
 * The system prompt already instructs this (and CLAUDE.md's UI-copy rule
 * covers every user-facing surface, this one included), but web-search source
 * material is full of dashes and the model doesn't reliably comply — this
 * catches whatever slips through instead of trusting instruction-following
 * alone. Only matches a dash with a space on both sides (the clause-connector
 * usage the rule targets); a true en-dash range like "2024–2026" has no
 * surrounding spaces and is left untouched.
 */
function stripConnectorDashes(text: string): string {
  return text.replace(/ [—–] /g, ', ');
}

interface BriefSource {
  url: string;
  title: string;
  domain: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Dedupe web-search citations by exact URL (a source cited for two different
 * sentences should appear once), attach the display domain, and cap the list
 * so a heavily-cited brief doesn't balloon the stored payload.
 */
function dedupeSources(raw: Array<{ url: string; title: string }>): BriefSource[] {
  const seen = new Set<string>();
  const out: BriefSource[] = [];
  for (const c of raw) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push({ url: c.url, title: c.title || extractDomain(c.url), domain: extractDomain(c.url) });
  }
  return out.slice(0, 20);
}

/**
 * Compute the EPS beat rate (%) from yesterday's earnings with confirmed actuals.
 * Returns null when there's insufficient data (<3 companies with both actual+estimate).
 */
function computeBeatRate(earningsData: Array<{ eps_actual?: number | null; eps_estimate?: number | null }>): string | null {
  const confirmed = earningsData.filter(
    (e) => e.eps_actual != null && e.eps_estimate != null
  );
  if (confirmed.length < 3) return null;
  const beats = confirmed.filter((e) => (e.eps_actual ?? 0) >= (e.eps_estimate ?? 0)).length;
  return `${Math.round((beats / confirmed.length) * 100)}% beat rate (${beats}/${confirmed.length} companies)`;
}

/**
 * Race a promise against a hard deadline. Root cause of the 2026-08-14
 * incident: none of twelvedata-client.ts's ~20 fetch() calls set a timeout
 * or AbortSignal, so a stalled TwelveData response (or network path) hangs
 * a plain `await fetch(url)` indefinitely — Node's native fetch has no
 * default request timeout. That call sat inside the Promise.allSettled
 * block below, which waits for every branch regardless of how long one
 * takes, consuming the entire 300s function budget before the Anthropic
 * call was ever reached (confirmed: zero log output from anywhere in this
 * route despite a full-duration run). Every branch below already has a
 * documented empty/null fallback, so timing one out early is a pure
 * latency win, not a behavior change. The proper fix — a client-side
 * timeout on every twelvedata-client.ts fetch call — is a separate, larger
 * change; this bounds the blast radius for this route in the meantime.
 */
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Accumulate token usage off the raw stream events as they arrive.
 *
 * Root cause of the 2026-08-14 credit drain: logAiCall() only ran on the
 * success path, at the end of the try block. Anthropic bills a cancelled
 * streaming request for everything it consumed before the abort — and this
 * prompt's server-side web_search loop resends its accumulated context on
 * every round, so a run that dies at the deadline has already burned ~200K
 * input tokens (~$0.60). Every one of those runs wrote $0.00 to ai_usage.
 * checkAnthropicDailySpend() sums that table, so the circuit breaker added
 * specifically to stop this drain saw zero spend all day and waved through
 * the next attempt. Six failed runs later the account balance was gone with
 * no record of where it went.
 *
 * Reading usage off the stream (rather than off the final message, which an
 * aborted call never produces) is what makes the failure path accountable.
 * `message_start` carries the message's input tokens; `message_delta` carries
 * output tokens cumulatively *per message*, so we difference successive
 * deltas to stay correct across the initial + resume pair and to keep a
 * partial count when the abort lands mid-message.
 */
function trackStreamUsage(
  stream: { on(event: 'streamEvent', handler: (event: unknown) => void): unknown },
  usage: StreamUsage,
): void {
  let lastOutput = 0;
  stream.on('streamEvent', (event) => {
    const e = event as {
      type?: string;
      message?: { usage?: { input_tokens?: number } };
      usage?: { output_tokens?: number };
    };
    if (e.type === 'message_start') {
      usage.inputTokens += e.message?.usage?.input_tokens ?? 0;
      lastOutput = 0;
      return;
    }
    if (e.type === 'message_delta' && typeof e.usage?.output_tokens === 'number') {
      usage.outputTokens += e.usage.output_tokens - lastOutput;
      lastOutput = e.usage.output_tokens;
    }
  });
}

/**
 * Fetch VIX (volatility index) and TNX (10-year Treasury yield) as supplemental
 * market-context data. Both are optional — failures are silently swallowed so
 * the cron never blocks on these quotes.
 */
async function fetchMarketContext(): Promise<{ vix: string | null; treasury10y: string | null }> {
  try {
    // TwelveData supports VIX (CBOE) and TNX (10Y Treasury) as quotable symbols
    const quotes = await getStockQuotes(['VIX', 'TNX']);
    const vixQ = quotes.get('VIX');
    const tnxQ = quotes.get('TNX');

    const vix = vixQ
      ? `${vixQ.c.toFixed(2)} (${vixQ.dp >= 0 ? '+' : ''}${vixQ.dp.toFixed(1)}% on day)`
      : null;
    const treasury10y = tnxQ
      ? `${tnxQ.c.toFixed(2)}% yield (${tnxQ.d >= 0 ? '+' : ''}${tnxQ.d.toFixed(2)}bp on day)`
      : null;

    return { vix, treasury10y };
  } catch {
    return { vix: null, treasury10y: null };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/generate-daily-brief' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[generate-daily-brief] invocation started');
  const supabase = createServerClient();

  // ── Date math (ET) ────────────────────────────────────────────────────────
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayET = toETDateString(new Date());
  const yesterdayET = toETDateString(new Date(nowET.getTime() - 86_400_000));
  const tomorrowET = toETDateString(new Date(nowET.getTime() + 86_400_000));

  // ── Idempotency: skip if today's brief already exists ─────────────────────
  const { data: existing } = await supabase
    .from('daily_briefs')
    .select('id, published_date')
    .eq('published_date', todayET)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, skipped: true, date: todayET, reason: 'already_exists' });
  }

  // ── Anthropic spend guard ────────────────────────────────────────────────
  // Checked before gathering data too, so a blocked run doesn't also burn
  // TwelveData credits on a brief that won't get generated.
  const spend = await checkAnthropicDailySpend();
  if (!spend.allowed) {
    console.error(
      `[generate-daily-brief] skipped — today's Anthropic spend ($${spend.spentTodayUsd.toFixed(2)}) already at/above the $${spend.capUsd} daily cap`
    );
    return NextResponse.json(
      { success: false, skipped: true, date: todayET, reason: 'anthropic_spend_cap' },
      { status: 200 }
    );
  }

  console.log('[generate-daily-brief] idempotency + spend guard passed, gathering data');

  // ── Gather context data in parallel ──────────────────────────────────────
  const DATA_GATHER_TIMEOUT_MS = 25_000;
  const [
    yesterdayEarnings,
    todayEarnings,
    tomorrowEarnings,
    moversResult,
    yesterdayBrief,
    marketContextResult,
  ] = await Promise.allSettled([
    // Shared per-day cache, warmed by the 04:00 prefetch-calendar cron two
    // hours before this runs — normally three cache hits instead of 120
    // credits. Resolves with null (rather than rejecting) when a day cannot
    // be filled; see the `?? []` on the unwrap below. Each wrapped in
    // withTimeout() so a stalled upstream fetch can't block this cron for
    // its full duration budget — see withTimeout's doc comment.
    withTimeout<EarningsCalendarItem[] | null>(getCalendarDay<EarningsCalendarItem>('earnings', yesterdayET), DATA_GATHER_TIMEOUT_MS),
    withTimeout<EarningsCalendarItem[] | null>(getCalendarDay<EarningsCalendarItem>('earnings', todayET), DATA_GATHER_TIMEOUT_MS),
    withTimeout<EarningsCalendarItem[] | null>(getCalendarDay<EarningsCalendarItem>('earnings', tomorrowET), DATA_GATHER_TIMEOUT_MS),
    withTimeout<Awaited<ReturnType<typeof getTopMovers>>>(getTopMovers(5), DATA_GATHER_TIMEOUT_MS),
    withTimeout<{ data: { title: string; content: string } | null }>(
      (async () =>
        supabase
          .from('daily_briefs')
          .select('title, content')
          .eq('published_date', yesterdayET)
          .maybeSingle())(),
      DATA_GATHER_TIMEOUT_MS
    ),
    withTimeout<Awaited<ReturnType<typeof fetchMarketContext>>>(fetchMarketContext(), DATA_GATHER_TIMEOUT_MS),
  ]);
  console.log(
    `[generate-daily-brief] data gathering done: ${[yesterdayEarnings, todayEarnings, tomorrowEarnings, moversResult, yesterdayBrief, marketContextResult].map((r) => r.status).join(',')}`
  );

  // `?? []` matters: getCalendarDay resolves with null (rather than rejecting)
  // when a day cannot be filled, so `status === 'fulfilled'` alone would let a
  // null through into the .filter() calls below.
  const yesterdayEarningsData = (yesterdayEarnings.status === 'fulfilled' ? yesterdayEarnings.value : []) ?? [];
  const todayEarningsData = (todayEarnings.status === 'fulfilled' ? todayEarnings.value : []) ?? [];
  const tomorrowEarningsData = (tomorrowEarnings.status === 'fulfilled' ? tomorrowEarnings.value : []) ?? [];
  const movers = moversResult.status === 'fulfilled' ? moversResult.value : { gainers: [], losers: [] };
  const prevBrief = yesterdayBrief.status === 'fulfilled' ? yesterdayBrief.value.data : null;
  const marketCtx = marketContextResult.status === 'fulfilled' ? marketContextResult.value : { vix: null, treasury10y: null };

  // ── Filter earnings to confirmed large/mid-caps only (prevent small-cap hallucination) ───
  // Only pass through tickers with EPS estimates — these are analyst-covered companies.
  // Symbols longer than 5 chars (foreign cross-listings) are also excluded.
  const confirmedYesterdayEarnings = yesterdayEarningsData.filter(
    (e) => e.symbol.length <= 5 && /^[A-Z]/.test(e.symbol) && (e.eps_estimate != null || e.eps_actual != null)
  );

  // ── Real price-reaction ground truth for yesterday's earnings tickers ──────
  // Two batched quote fetches (regular + prepost:true), 1 credit/symbol each —
  // cheap next to this route's ~60-100 credit budget. See formatPriceReaction's
  // doc comment for why the model can't be trusted to get this right from web
  // search alone: articles are often written minutes after the print and can
  // describe a reaction that reverses before after-hours trading settles.
  const earningsSymbols = confirmedYesterdayEarnings.slice(0, 15).map((e) => e.symbol);
  const [regularQuotesResult, extendedQuotesResult] = await Promise.allSettled([
    withTimeout(getStockQuotes(earningsSymbols), DATA_GATHER_TIMEOUT_MS),
    withTimeout(getStockQuotes(earningsSymbols, { prepost: true }), DATA_GATHER_TIMEOUT_MS),
  ]);
  const regularQuotes = regularQuotesResult.status === 'fulfilled' ? regularQuotesResult.value : new Map();
  const extendedQuotes = extendedQuotesResult.status === 'fulfilled' ? extendedQuotesResult.value : new Map();

  // ── Build context strings for the prompt ──────────────────────────────────
  const earningsResultsText = confirmedYesterdayEarnings.length > 0
    ? confirmedYesterdayEarnings.slice(0, 15).map((e) => formatEarningsRow(e, regularQuotes, extendedQuotes)).join('\n')
    : 'No analyst-covered earnings with EPS estimates reported yesterday.';

  const todayReportersText = todayEarningsData
    .filter((e) => e.symbol.length <= 5 && /^[A-Z]/.test(e.symbol))
    .slice(0, 10)
    .map((e) => formatEarningsRow(e))
    .join('\n') || 'No major earnings scheduled today.';

  const tomorrowReportersText = tomorrowEarningsData
    .filter((e) => e.symbol.length <= 5 && /^[A-Z]/.test(e.symbol))
    .slice(0, 8)
    .map((e) => formatEarningsRow(e))
    .join('\n') || 'No major earnings scheduled tomorrow.';

  const topGainers = movers.gainers.slice(0, 5).map(
    (m) => `${m.symbol} +${m.changePercent.toFixed(1)}%`
  ).join(', ') || 'N/A';
  const topLosers = movers.losers.slice(0, 5).map(
    (m) => `${m.symbol} ${m.changePercent.toFixed(1)}%`
  ).join(', ') || 'N/A';

  const beatRateText = computeBeatRate(confirmedYesterdayEarnings);

  // Optional market context lines (omit block when data is unavailable)
  const marketContextLines = [
    marketCtx.vix ? `VIX: ${marketCtx.vix}` : null,
    marketCtx.treasury10y ? `10Y Treasury: ${marketCtx.treasury10y}` : null,
    beatRateText ? `EPS beat rate yesterday: ${beatRateText}` : null,
  ].filter(Boolean);

  const marketContextBlock = marketContextLines.length > 0
    ? `\nMARKET CONTEXT (use in "The Setup" or "TL;DR"):\n${marketContextLines.join('\n')}\n`
    : '';

  const avoidanceSection = prevBrief
    ? `\nDO NOT REPEAT any topics, companies, or stories already covered in yesterday's brief (${yesterdayET}). Yesterday's brief:\n---\n${prevBrief.content.slice(0, 1200)}\n---\n`
    : '';

  const todayFormatted = new Date(todayET + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });

  // ── Call Claude with web search ───────────────────────────────────────────
  const systemPrompt = `You are the lead writer of the BullPen Daily Market Brief — a premium morning read for retail investors who follow markets daily. Voice: smart, specific, a touch witty. Think Robinhood Snacks meets Stratechery — not stiff financial-journalese.

Hard rules:
- Lead every stock mention with $TICKER (e.g. "$NVDA beat by 8%"). Always.
- Use concrete numbers, named companies, and the *why* behind moves — never generic filler ("markets were mixed", "investors weighed", "Wall Street watched").
- The VERY FIRST line of your output must be the headline. NO preamble. NO meta-commentary. NO horizontal rules before it. Do not announce what you're about to do.
  * BAD first lines: "All the data I need is now in hand. Here is today's brief:", "Now I have everything I need.", "Here is today's BullPen Daily Market Brief:", "Let me compile this..."
  * GOOD first lines: "Eight Up, One New Fed Chair, and a Consumer Quietly Falling Apart", "Dow Hits Record, $DELL Explodes 17%", "Quantum Surge, Retail Warning"
- Headline must be 6–14 words, punchy, NEVER end in a colon, NEVER contain the words "Daily Brief" / "Market Brief" / "today's brief" (the headline must not name itself).
- Use ## section headers exactly as listed below, in order.
- Use • for bullet points inside sections.
- Use **bold** for company names on first mention and for key metrics.
- Target ~650 words total. Hard ceiling: 800.
- COMPLETE EVERY SENTENCE. Never end a section or the brief mid-thought. If you are running long, cut earlier content — never trail off.
- Never use an em dash (—) or en dash (–) anywhere in your output, for any reason. Not to connect clauses, not for a parenthetical, not for a range. Use a period, comma, or colon instead. This is a hard rule, not a style preference: an em dash is one of the clearest tells that text was AI-written, and it will be mechanically stripped from your output before publishing regardless, so a dash you write is wasted effort at best and a mangled sentence at worst.

DATA FIDELITY (critical):
- In "Earnings Results": cite ONLY companies listed in "YESTERDAY'S EARNINGS RESULTS" below. Do not invent additional tickers — especially micro/small-cap names (symbols like AAMMF, ADKT, AGNC-type cross-listings) that are not on that list. If the list is sparse, say so concisely.
- For "Reporting Today": cite ONLY companies from "TODAY'S SCHEDULED REPORTERS" below.
- After-hours or pre-market moves must be flagged [AH] or [PM] immediately after the ticker, e.g. "$INTU [AH] fell 13%".
- A "YESTERDAY'S EARNINGS RESULTS" row may end with a bracketed tag like "[after-hours +4.7%]" or "[session -1.6%]" — this is the ACTUAL price move, pulled directly from our own live market data at generation time, not from a news article. It is ground truth. Web search results describing that stock's reaction (e.g. "shares fell after the report") are frequently written minutes after the print and capture an initial move that reverses by the time trading actually settles — when a source's narrative conflicts with the bracketed number, the bracketed number is what happened and the source is describing a moment that already passed. Never describe a stock's post-earnings move in a direction that contradicts its bracketed tag. If a row has no bracketed tag, no verified reaction is available. Don't state a specific price move for it. Describe the earnings result itself instead.

Sector analysis:
- When citing a sector gain or loss in "Movers & Stories", add one sentence explaining the specific catalyst (not just "on strong earnings" — why did that sector move relative to others today?).

Sourcing and originality (critical):
- When search results turn up multiple articles on the same story, read across all of them and write your own synthesis. Pull the specific facts and numbers you need, then explain them in your own words and your own structure.
- Never lift a single article's paragraph order, framing, or sentence-by-sentence structure and lightly reword it. That is still a copy even with zero direct quotes and different word choices. If a section of your draft is tracking one source that closely, stop and rewrite it from the underlying facts instead of editing the borrowed sentence.
- Never quote source text directly, even in scare quotes.

Banned phrases (do not use): "investors are watching", "in a sign that", "as the saying goes", "remains to be seen", "only time will tell", "amid", "on the heels of", "broader market", "risk-on", "risk-off", "Wall Street".`;

  const userPrompt = `Write today's Daily Market Brief for ${todayFormatted}.

REQUIRED STRUCTURE (in this order, exactly these headers):

## TL;DR
2–3 punchy sentences capturing today's single most important narrative. Max 60 words. Hook the reader. Mention 1–2 $TICKERs if relevant. If VIX data is available, note whether fear is elevated or subdued.

## The Setup
Overnight + premarket context. Futures, key macro data dropping today, any overseas moves that matter for US trade. Include VIX level and 10Y Treasury yield if provided. ~120 words.

## Headlines
Top 2–3 stories driving stocks today — the *why*, not just the *what*. For each sector mentioned (+2%+), add one sentence on the specific catalyst. Skip pure mechanical movers; lead with catalysts (downgrades, product news, litigation, M&A chatter). ~140 words.

## Earnings Results
Yesterday's beats/misses that still matter + today's most important reporters. Use ONLY the data below as factual anchors — do not invent numbers or add tickers not in the list. Tag after-hours moves [AH]. Include the EPS beat rate if provided. ~140 words.

## Watch Today
Specific events to monitor: Fed speakers + times, key economic releases, technical levels for major indices, upcoming catalysts. Bullet list. ~80 words.

## Next 24 Hours
Tomorrow's forward catalysts: key earnings reporters (from data below), any scheduled Fed speakers or economic releases, and one sentence on what traders will be watching most closely. Bullet list. ~80 words.

YESTERDAY'S EARNINGS RESULTS (use ONLY these — no additions):
${earningsResultsText}

TODAY'S SCHEDULED REPORTERS (use ONLY these):
${todayReportersText}

TOMORROW'S SCHEDULED REPORTERS (for "Next 24 Hours"):
${tomorrowReportersText}

YESTERDAY'S TOP MOVERS:
Gainers: ${topGainers}
Losers:  ${topLosers}
${marketContextBlock}${avoidanceSection}
Use live web search to verify the latest news for "Movers & Stories", "Watch Today", and "Next 24 Hours". Cite specific events, not generic narratives.`;

  let fullText = '';
  let sources: BriefSource[] = [];
  const usage: StreamUsage = { inputTokens: 0, outputTokens: 0 };
  try {
    // Reverted from web_search_20260209 back to web_search_20250305 on
    // 2026-08-15. The 08-13 switch was a cost optimization, and it cost us
    // three days of briefs instead: dynamic filtering runs server-side code
    // execution on every search round, which trims context but adds wall
    // clock this route does not have. Evidence — the last brief in
    // daily_briefs is 2026-08-13, generated at 06:30 UTC that morning, hours
    // BEFORE the 13:04 switch; every run afterwards died at whatever ceiling
    // was in place that hour (120s, then 150s, 240s, 300s). Raising the
    // budget was never going to work, because the real ceiling is Vercel's
    // 300s function limit, not ours.
    //
    // max_uses is kept at 5, which is what we actually wanted from the
    // switch. Cost here scales with search count (each round resends the
    // accumulated context), and the old tool supports the cap too — it was
    // simply never set. 5 covers this prompt's 3 search topics (Movers &
    // Stories, Watch Today, Next 24 Hours) with room to spare, and should
    // land under the ~194K uncapped baseline. Verify against ai_usage after
    // the first successful run rather than assuming.
    const requestParams = {
      model: 'claude-sonnet-4-6' as const,
      max_tokens: 1500,
      betas: ['web-search-2025-03-05'],
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 5 }],
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userPrompt }],
    };

    // 2026-08-14, four incidents in a row, each timing out at exactly the
    // function's own maxDuration (120s, then 300s x3 after raising it and
    // after two different mitigations). Live logs proved data gathering
    // finishes in ~1.4s and the initial Anthropic call starts logging
    // normally, then produces nothing — no resume log, no caught-error log
    // — until Vercel's own hard kill. Two mitigations were tried and both
    // failed to change the outcome:
    //   1. The SDK's `timeout` option on .stream() — evidence points to
    //      this being an idle/per-chunk timer that a web_search tool loop's
    //      sparse SSE activity keeps resetting, so it likely never fires.
    //   2. A local withTimeout() (Promise.race + setTimeout) so OUR code
    //      stops waiting after N ms. This makes our own control flow move
    //      on, but it does not cancel the underlying HTTP/SSE connection —
    //      the abandoned request keeps running. Node/Vercel's runtime can
    //      hold the invocation open until outstanding I/O handles settle,
    //      so even though our code "gave up" on the promise, the function
    //      itself may still be blocked from actually returning, and
    //      Vercel's platform-level maxDuration kills it regardless.
    // The real fix is genuine cancellation: pass an AbortSignal that fires
    // at the deadline, so the SDK actually tears down the connection (not
    // just our promise chain). withTimeout() is kept as a backstop in case
    // the abort itself doesn't propagate a rejection promptly.
    // Confirmed live 2026-08-14: the AbortSignal fix works — a run that hit
    // its budget returned a real, fast 500 ({"error": "Claude generation
    // failed", "detail": "Request was aborted."}) instead of hanging to
    // Vercel's 300s kill. That fix stays; it is the reason a bad run now
    // fails cleanly instead of silently.
    //
    // Budget deliberately tightened back from 240s to 180s. Under this tool
    // the whole invocation historically finished inside a 120s maxDuration,
    // so 180s is generous headroom for the Anthropic call alone. The reason
    // not to spend the full remaining budget: a timeout is not free. Anthropic
    // bills every token consumed before the abort, so a doomed run costs
    // strictly more the longer we let it sit. 240s bought no extra chance of
    // success and ~$0.60 of billed tokens per attempt.
    const INITIAL_CALL_TIMEOUT_MS = 180_000;
    const RESUME_CALL_TIMEOUT_MS = 40_000;

    console.log('[generate-daily-brief] starting initial Anthropic call');
    const initialStream = anthropic.beta.messages.stream(requestParams, {
      timeout: INITIAL_CALL_TIMEOUT_MS,
      maxRetries: 0,
      signal: AbortSignal.timeout(INITIAL_CALL_TIMEOUT_MS),
    });
    trackStreamUsage(initialStream, usage);
    let final = await withTimeout(initialStream.finalMessage(), INITIAL_CALL_TIMEOUT_MS);
    console.log(
      `[generate-daily-brief] initial call finished, stop_reason=${final.stop_reason}, in=${usage.inputTokens}, out=${usage.outputTokens}`
    );

    // Server-side tool loops cap at 10 iterations internally; a request that
    // hits the cap comes back with stop_reason: "pause_turn" instead of the
    // finished brief. Resume once by re-sending the conversation so far —
    // per Anthropic's docs the server picks up where it left off from the
    // trailing server_tool_use block, no extra prompting needed.
    if (final.stop_reason === 'pause_turn') {
      console.log('[generate-daily-brief] pause_turn — resuming');
      const resumeStream = anthropic.beta.messages.stream(
        {
          ...requestParams,
          messages: [...requestParams.messages, { role: 'assistant', content: final.content }],
        },
        {
          timeout: RESUME_CALL_TIMEOUT_MS,
          maxRetries: 0,
          signal: AbortSignal.timeout(RESUME_CALL_TIMEOUT_MS),
        }
      );
      trackStreamUsage(resumeStream, usage);
      final = await withTimeout(resumeStream.finalMessage(), RESUME_CALL_TIMEOUT_MS);
      console.log(`[generate-daily-brief] resume call finished, stop_reason=${final.stop_reason}`);
    }

    // Web search produces interleaved text blocks: brief commentary between
    // tool calls ("Let me search for...", "Now I have everything I need...")
    // followed by the FINAL synthesized brief in the last text block(s).
    // We must only keep the trailing run of text blocks — anything before a
    // tool_use / web_search_tool_result block is orchestration narration.
    const tail: string[] = [];
    const rawCitations: Array<{ url: string; title: string }> = [];
    for (let i = final.content.length - 1; i >= 0; i--) {
      const block = final.content[i];
      if (block.type === 'text') {
        tail.unshift(block.text);
        // Citations attach only to the text that actually made it into the
        // published brief — a block's citations describe exactly what backs
        // that block's sentences, so this is the honest "sources" list.
        for (const citation of block.citations ?? []) {
          if (citation.type === 'web_search_result_location') {
            rawCitations.push({ url: citation.url, title: citation.title ?? '' });
          }
        }
      } else {
        break;
      }
    }
    fullText = tail.join('').trim();
    sources = dedupeSources(rawCitations.reverse());

    // Log the cron run's cost (no user → null user_id).
    // Uses the streamed tally rather than final.usage: on a pause_turn resume,
    // `final` is only the second message, so final.usage undercounts the run
    // by whatever the initial call burned.
    try {
      void logAiCall({
        userId: null,
        feature: 'daily_brief',
        model: 'claude-sonnet-4-6',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        metadata: { date: todayET, searchRounds: requestParams.tools[0].max_uses },
      });
    } catch { /* never block cron on logging */ }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    console.error(
      `[generate-daily-brief] Anthropic error (billed in=${usage.inputTokens}, out=${usage.outputTokens}):`,
      err
    );

    // Awaited, not fire-and-forget: this is the last thing the invocation does
    // before returning, and a `void` write can lose the race with the function
    // freezing. Recording the spend is the whole point of this branch — a
    // failed run that bills tokens but logs nothing is what emptied the
    // account on 2026-08-14. See trackStreamUsage() above.
    await logAiCall({
      userId: null,
      feature: 'daily_brief',
      model: 'claude-sonnet-4-6',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      status: 'error',
      metadata: { date: todayET, detail },
    });

    return NextResponse.json(
      { success: false, error: 'Claude generation failed', detail },
      { status: 500 }
    );
  }

  if (!fullText.trim()) {
    return NextResponse.json({ success: false, error: 'Empty response from Claude' }, { status: 500 });
  }

  // ── Post-process: trim any incomplete trailing sentence, then strip any
  // em/en dash the model used anyway despite the system prompt's rule — a
  // deterministic backstop, since instruction-following alone has proven
  // unreliable here (see stripConnectorDashes's doc comment).
  const processedText = stripConnectorDashes(trimIncomplete(fullText));

  // ── Parse title (defensive: filters out Claude's tool-orchestration narration) ─
  const titleLine = extractTitle(processedText) ?? `Market Brief: ${todayFormatted}`;

  // Body = everything from the first `##` section onward. If no header was found
  // (degenerate response), fall back to dropping the matched title line.
  const firstHeaderIdx = processedText.search(/(^|\n)##\s/);
  const content = firstHeaderIdx >= 0
    ? processedText.slice(firstHeaderIdx).trimStart()
    : processedText.split('\n').slice(1).join('\n').trim();

  const featured = extractTickers(processedText);

  // ── Store in Supabase ─────────────────────────────────────────────────────
  const { error: insertError } = await supabase.from('daily_briefs').insert({
    published_date: todayET,
    title: titleLine,
    content,
    featured_tickers: featured,
    sources,
  });

  if (insertError) {
    console.error('[generate-daily-brief] Supabase insert error:', insertError);
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
  }

  // ── Fan out: notify Pro users the brief is ready ───────────────────────────
  // Only Pro/admin can actually read it (see /api/briefs/today's isPro gate),
  // so non-Pro users would just hit a paywall from the notification.
  // Scheduled via after() so it runs post-response, never risking the
  // published brief over a notification failure.
  after(async () => {
    try {
      const { data: proUsers } = await supabase
        .from('users')
        .select('id')
        .or('role.eq.admin,account_tier.gte.3') as unknown as
        { data: Array<{ id: string }> | null };
      for (const u of proUsers ?? []) {
        await createDailyBriefReadyNotification(u.id, { title: titleLine, publishedDate: todayET });
      }
    } catch (err) {
      console.error('[generate-daily-brief] notification fan-out failed:', err);
    }
  });

  return NextResponse.json({
    success: true,
    date: todayET,
    title: titleLine,
    length: processedText.length,
    featured_tickers: featured,
    sources: sources.length,
  });
}
