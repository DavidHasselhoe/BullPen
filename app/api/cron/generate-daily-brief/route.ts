/**
 * Daily Brief Generation Cron
 * GET /api/cron/generate-daily-brief
 *
 * Runs at 6:30 AM UTC daily (1:30 AM ET) — ready before pre-market open.
 * Generates one shared brief per calendar date for all pro users.
 * Idempotent: skips generation if today's brief already exists.
 *
 * Claude prompt credit cost: ~$0.05–0.10 per run (web search + 600-word response).
 * TwelveData credit cost: ~50–80 credits (earnings calendar x2 + movers).
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase/client';
import { getEarningsCalendarRange } from '@/lib/twelvedata/twelvedata-client';
import { getTopMovers } from '@/lib/market-data';
import { logAiCall } from '@/lib/billing/log-ai-call';

export const maxDuration = 120;

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

  // ── Idempotency: skip if today's brief already exists ─────────────────────
  const { data: existing } = await supabase
    .from('daily_briefs')
    .select('id, published_date')
    .eq('published_date', todayET)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, skipped: true, date: todayET, reason: 'already_exists' });
  }

  // ── Gather context data in parallel ──────────────────────────────────────
  const [yesterdayEarnings, todayEarnings, moversResult, yesterdayBrief] = await Promise.allSettled([
    getEarningsCalendarRange(yesterdayET, yesterdayET),
    getEarningsCalendarRange(todayET, todayET),
    getTopMovers(5),
    supabase
      .from('daily_briefs')
      .select('title, content')
      .eq('published_date', yesterdayET)
      .maybeSingle(),
  ]);

  const yesterdayEarningsData = yesterdayEarnings.status === 'fulfilled' ? yesterdayEarnings.value : [];
  const todayEarningsData = todayEarnings.status === 'fulfilled' ? todayEarnings.value : [];
  const movers = moversResult.status === 'fulfilled' ? moversResult.value : { gainers: [], losers: [] };
  const prevBrief = yesterdayBrief.status === 'fulfilled' ? yesterdayBrief.value.data : null;

  // ── Build context strings for the prompt ──────────────────────────────────
  const earningsResultsText = yesterdayEarningsData.length > 0
    ? yesterdayEarningsData.slice(0, 15).map(formatEarningsRow).join('\n')
    : 'No major earnings reported yesterday.';

  const todayReportersText = todayEarningsData.length > 0
    ? todayEarningsData.slice(0, 10).map(formatEarningsRow).join('\n')
    : 'No major earnings scheduled today.';

  const topGainers = movers.gainers.slice(0, 5).map(
    (m) => `${m.symbol} +${m.changePercent.toFixed(1)}%`
  ).join(', ') || 'N/A';
  const topLosers = movers.losers.slice(0, 5).map(
    (m) => `${m.symbol} ${m.changePercent.toFixed(1)}%`
  ).join(', ') || 'N/A';

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
- Begin with a one-line title (no # prefix, no quotes, no markdown).
- Use ## section headers exactly as listed below, in order.
- Use • for bullet points inside sections.
- Use **bold** for company names on first mention and for key metrics.
- Target ~550 words total. Hard ceiling: 650.

Banned phrases (do not use): "investors are watching", "in a sign that", "as the saying goes", "remains to be seen", "only time will tell", "amid", "on the heels of", "broader market", "risk-on", "risk-off", "Wall Street".`;

  const userPrompt = `Write today's Daily Market Brief for ${todayFormatted}.

REQUIRED STRUCTURE (in this order, exactly these headers):

## TL;DR
2–3 punchy sentences capturing today's single most important narrative. Max 60 words. Hook the reader. Mention 1–2 $TICKERs if relevant.

## The Setup
Overnight + premarket context. Futures, key macro data dropping today, any overseas moves that matter for US trade. ~120 words.

## Earnings Pulse
Yesterday's beats/misses that still matter + today's most important reporters. Use the data below as factual anchors — don't invent numbers. ~140 words.

## Movers & Stories
Top 2–3 stories driving stocks today — the *why*, not just the *what*. Skip pure mechanical movers; lead with catalysts (downgrades, product news, litigation, M&A chatter). ~140 words.

## Watch Today
Specific events to monitor: Fed speakers + times, key economic releases, technical levels for major indices, upcoming catalysts. Bullet list. ~80 words.

YESTERDAY'S EARNINGS RESULTS (factual anchors, use exact numbers):
${earningsResultsText}

TODAY'S SCHEDULED REPORTERS:
${todayReportersText}

YESTERDAY'S TOP MOVERS:
Gainers: ${topGainers}
Losers:  ${topLosers}
${avoidanceSection}
Use live web search to verify the latest news for "Movers & Stories" and "Watch Today". Cite specific events, not generic narratives.`;

  let fullText = '';
  try {
    const stream = anthropic.beta.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      betas: ['web-search-2025-03-05'],
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        fullText += event.delta.text;
      }
    }

    // Log the cron run's cost (no user → null user_id)
    try {
      const final = await stream.finalMessage();
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

  // ── Parse title (first non-empty line) and body ───────────────────────────
  const lines = fullText.trim().split('\n');
  const titleLine = lines[0].replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
  const content = lines.slice(1).join('\n').trim();

  const featured = extractTickers(fullText);

  // ── Store in Supabase ─────────────────────────────────────────────────────
  const { error: insertError } = await supabase.from('daily_briefs').insert({
    published_date: todayET,
    title: titleLine || `Market Brief — ${todayFormatted}`,
    content,
    featured_tickers: featured,
  });

  if (insertError) {
    console.error('[generate-daily-brief] Supabase insert error:', insertError);
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    date: todayET,
    title: titleLine,
    length: fullText.length,
    featured_tickers: featured,
  });
}
