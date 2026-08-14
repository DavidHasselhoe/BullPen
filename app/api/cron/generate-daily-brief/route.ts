/**
 * Daily Brief Generation Cron
 * GET /api/cron/generate-daily-brief
 *
 * Runs at 6:30 AM UTC daily (1:30 AM ET) — ready before pre-market open.
 * Generates one shared brief per calendar date for all pro users.
 * Idempotent: skips generation if today's brief already exists.
 *
 * Claude prompt credit cost: dominated by web search input tokens, not output — the
 * ~650-word brief is ~2K output tokens. `web_search_20260209` (dynamic filtering) plus
 * a `max_uses` cap keeps raw search-result content from ballooning the resent context
 * across searches; without both, a run can spike to 150K+ input tokens.
 * TwelveData credit cost: ~60–100 credits (earnings calendar x3 + movers + market quotes).
 */

import { NextRequest, NextResponse, after } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase/client';
import type { EarningsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { getCalendarDay } from '@/lib/market-data/calendar-days';
import { getTopMovers, getStockQuotes } from '@/lib/market-data';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { checkAnthropicDailySpend } from '@/lib/billing/anthropic-spend-guard';
import { createDailyBriefReadyNotification } from '@/lib/notifications/notification-creators';

// Bumped from 120s after the 2026-08-13 web_search_20260209 switch — dynamic
// filtering adds server-side work per search round, and worst-case latency
// with max_uses:8 could exceed the old ceiling (confirmed live: the first
// production run on the new tool timed out at exactly 120s, 2026-08-14).
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toETDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function formatEarningsRow(e: {
  symbol: string;
  name?: string;
  eps_actual?: number | null;
  eps_estimate?: number | null;
  surprise?: number | null;
  time?: string;
}): string {
  const name = e.name ? ` (${e.name})` : '';
  if (e.eps_actual != null && e.eps_estimate != null) {
    const beat = e.eps_actual >= e.eps_estimate ? 'BEAT' : 'MISSED';
    const surprise = e.surprise != null ? ` ${e.surprise > 0 ? '+' : ''}${e.surprise.toFixed(1)}%` : '';
    return `${e.symbol}${name}: EPS $${e.eps_actual.toFixed(2)} vs est $${e.eps_estimate.toFixed(2)} — ${beat}${surprise}`;
  }
  const tag = e.time === 'BMO' || e.time === 'pre_market' ? 'BMO' : e.time === 'AMC' || e.time === 'after_close' ? 'AMC' : '';
  return `${e.symbol}${name}${tag ? ` [${tag}]` : ''}`;
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  // ── Gather context data in parallel ──────────────────────────────────────
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
    // be filled; see the `?? []` on the unwrap below.
    getCalendarDay<EarningsCalendarItem>('earnings', yesterdayET),
    getCalendarDay<EarningsCalendarItem>('earnings', todayET),
    getCalendarDay<EarningsCalendarItem>('earnings', tomorrowET),
    getTopMovers(5),
    supabase
      .from('daily_briefs')
      .select('title, content')
      .eq('published_date', yesterdayET)
      .maybeSingle(),
    fetchMarketContext(),
  ]);

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

  // ── Build context strings for the prompt ──────────────────────────────────
  const earningsResultsText = confirmedYesterdayEarnings.length > 0
    ? confirmedYesterdayEarnings.slice(0, 15).map(formatEarningsRow).join('\n')
    : 'No analyst-covered earnings with EPS estimates reported yesterday.';

  const todayReportersText = todayEarningsData
    .filter((e) => e.symbol.length <= 5 && /^[A-Z]/.test(e.symbol))
    .slice(0, 10)
    .map(formatEarningsRow)
    .join('\n') || 'No major earnings scheduled today.';

  const tomorrowReportersText = tomorrowEarningsData
    .filter((e) => e.symbol.length <= 5 && /^[A-Z]/.test(e.symbol))
    .slice(0, 8)
    .map(formatEarningsRow)
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
- Never use an em dash (—) or en dash (–) to connect clauses. Use a period, comma, or colon instead.

DATA FIDELITY (critical):
- In "Earnings Results": cite ONLY companies listed in "YESTERDAY'S EARNINGS RESULTS" below. Do not invent additional tickers — especially micro/small-cap names (symbols like AAMMF, ADKT, AGNC-type cross-listings) that are not on that list. If the list is sparse, say so concisely.
- For "Reporting Today": cite ONLY companies from "TODAY'S SCHEDULED REPORTERS" below.
- After-hours or pre-market moves must be flagged [AH] or [PM] immediately after the ticker, e.g. "$INTU [AH] fell 13%".

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
  try {
    // max_uses lowered from 8 to 5 (2026-08-14) — each round now does more
    // server-side work under web_search_20260209's dynamic filtering, so 8
    // sequential rounds pushed worst-case latency past the function's
    // duration budget. 5 still comfortably covers this prompt's 3 search
    // topics (Movers & Stories, Watch Today, Next 24 Hours).
    const requestParams = {
      model: 'claude-sonnet-4-6' as const,
      max_tokens: 1500,
      tools: [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 5 }],
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userPrompt }],
    };

    let final = await anthropic.messages.stream(requestParams).finalMessage();

    // Server-side tool loops cap at 10 iterations internally; a request that
    // hits the cap comes back with stop_reason: "pause_turn" instead of the
    // finished brief. Resume once by re-sending the conversation so far —
    // per Anthropic's docs the server picks up where it left off from the
    // trailing server_tool_use block, no extra prompting needed.
    if (final.stop_reason === 'pause_turn') {
      final = await anthropic.messages
        .stream({
          ...requestParams,
          messages: [...requestParams.messages, { role: 'assistant', content: final.content }],
        })
        .finalMessage();
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

    // Log the cron run's cost (no user → null user_id)
    try {
      void logAiCall({
        userId: null,
        feature: 'daily_brief',
        model: 'claude-sonnet-4-6',
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
        metadata: { date: todayET },
      });
    } catch { /* never block cron on logging */ }
  } catch (err) {
    console.error('[generate-daily-brief] Anthropic error:', err);
    return NextResponse.json(
      { success: false, error: 'Claude generation failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }

  if (!fullText.trim()) {
    return NextResponse.json({ success: false, error: 'Empty response from Claude' }, { status: 500 });
  }

  // ── Post-process: trim any incomplete trailing sentence ────────────────────
  const processedText = trimIncomplete(fullText);

  // ── Parse title (defensive: filters out Claude's tool-orchestration narration) ─
  const titleLine = extractTitle(processedText) ?? `Market Brief — ${todayFormatted}`;

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
