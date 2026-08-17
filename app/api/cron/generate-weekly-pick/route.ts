/**
 * Bull's Weekly Pick — generation cron
 * GET /api/cron/generate-weekly-pick
 *
 * Runs Mondays at 06:30 UTC (01:30 ET) via GitHub Actions — published before
 * pre-market, so the first price any reader could act on is that session's open.
 * Idempotent per calendar week (ET, Monday-anchored): any call between this
 * week's Monday and the next is a no-op once one pick exists for the week —
 * not just a same-day retry. Matters because this endpoint also accepts a
 * manual `workflow_dispatch`/curl trigger, which could otherwise publish a
 * second real pick inside the same 7 days.
 *
 * Three stages, in this order for a reason (see lib/ai/picks/system-prompt.ts):
 *   1. Scout   — Claude + web search produces 6–10 candidate tickers.
 *   2. Ground  — we check every one against our own tables; hallucinations and
 *                sub-$2B names die here. Near-zero TwelveData credits.
 *   3. Commit  — Claude, with NO web access, picks one from the survivors and
 *                argues it from the numbers we gave it.
 *
 * If any stage fails, nothing is published. A missing week is honest; a pick we
 * can't stand behind is not. The row is written with entry_price = NULL and
 * stamped later by /api/picks/performance from that session's actual open.
 *
 * Cost: ~2 Claude calls (~$0.15–0.30/run). TwelveData: one batched /quote for
 * the shortlist, plus at most 2 rescue fetches.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase/client';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { getLogoUrl } from '@/lib/twelvedata/twelvedata-client';
import { createWeeklyPickNotification } from '@/lib/notifications/notification-creators';
import {
  SCOUT_SYSTEM_PROMPT,
  buildScoutPrompt,
  COMMIT_SYSTEM_PROMPT,
  buildCommitPrompt,
} from '@/lib/ai/picks/system-prompt';
import { parseCandidateList, parseModelPick, type StoredThesis } from '@/lib/ai/picks/schema';
import { groundCandidates, formatScorecards, toMetricsSnapshot } from '@/lib/ai/picks/ground-candidates';

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const SCOUT_THINKING_BUDGET = 3000;
const COMMIT_THINKING_BUDGET = 5000;

/** How many past picks the scout is told to avoid repeating. */
const RECENT_WINDOW = 12;

function toETDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** True once the regular session has opened (9:30 ET) on `date`'s ET calendar day. */
function isPastMarketOpenET(date: Date): boolean {
  const etTime = date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
  const [h, m] = etTime.split(':').map(Number);
  return h * 60 + m >= 9 * 60 + 30;
}

/** ET calendar date of the Monday on/before `date` — the start of that date's pick week. */
function mondayOfWeekET(date: Date): string {
  const etWeekday = date.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const daysSinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(etWeekday);
  const monday = new Date(date.getTime() - daysSinceMonday * 86_400_000);
  return toETDateString(monday);
}

/**
 * Collect the model's final text output, skipping the narration Claude emits
 * between web-search tool calls. Only the trailing run of text blocks is the
 * actual answer — same shape as the daily-brief cron.
 */
function tailText(content: Array<{ type: string; text?: string }>): string {
  const tail: string[] = [];
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (block.type === 'text') {
      tail.unshift(block.text ?? '');
    } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
      // Thinking blocks can appear interleaved; they're not output but they
      // also don't terminate the answer run.
      continue;
    } else {
      break;
    }
  }
  return tail.join('').trim();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/generate-weekly-pick' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const now = new Date();
  const todayET = toETDateString(now);
  const weekStartET = mondayOfWeekET(now);

  // ── Idempotency ───────────────────────────────────────────────────────────
  // `.returns<>()` throughout this file: the generated Supabase `Database` type
  // in this repo doesn't carry the newer tables, so rows infer as `never`
  // without an explicit row type. Same pattern as the deep-dive routes.
  const { data: existing } = await supabase
    .from('ai_stock_picks')
    .select('id, symbol, pick_date')
    .gte('pick_date', weekStartET)
    .order('pick_date', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; symbol: string; pick_date: string }>();

  if (existing) {
    return NextResponse.json({
      success: true, skipped: true, date: todayET,
      symbol: existing.symbol, existingPickDate: existing.pick_date, reason: 'already_exists_this_week',
    });
  }

  const todayFormatted = new Date(`${todayET}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });

  // ── Timing guard ──────────────────────────────────────────────────────────
  // entry_price is always stamped later from the real historical open (see
  // header), so a late run doesn't corrupt that number. But the "published
  // before pre-market" premise this cron is scheduled around can still slip —
  // GitHub Actions has been observed delaying a scheduled run by hours (not
  // just the ~5-15 min usually assumed), and a pick generated after the open
  // no longer reflects what a same-day reader could have acted on. Surfacing
  // this loudly (rather than publishing silently) is why this cron moved to
  // Vercel's cron infra, which doesn't have GitHub's queueing drift — this
  // stays as a backstop in case the schedule itself ever slips.
  const lateGeneration = isPastMarketOpenET(now);
  if (lateGeneration) {
    console.warn(
      `[weekly-pick] generating after 9:30 ET market open — scheduler drift, not a code bug. now=${now.toISOString()}`
    );
  }

  // ── Recent picks (do-not-repeat list) ─────────────────────────────────────
  const { data: recent } = await supabase
    .from('ai_stock_picks')
    .select('symbol')
    .order('pick_date', { ascending: false })
    .limit(RECENT_WINDOW)
    .returns<Array<{ symbol: string }>>();

  const recentSymbols = (recent ?? []).map((r) => r.symbol);

  // ── Stage 1: scout ────────────────────────────────────────────────────────
  let candidates;
  try {
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      temperature: 1,
      thinking: { type: 'enabled', budget_tokens: SCOUT_THINKING_BUDGET },
      betas: ['web-search-2025-03-05'],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
      system: [{ type: 'text', text: SCOUT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildScoutPrompt({ today: todayFormatted, recentSymbols }) }],
    });

    const final = await stream.finalMessage();
    void logAiCall({
      userId: null,
      feature: 'weekly_pick_scout',
      model: MODEL,
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      metadata: { date: todayET },
    });

    candidates = parseCandidateList(tailText(final.content));
  } catch (err) {
    console.error('[weekly-pick] scout stage failed:', err);
    return NextResponse.json(
      { success: false, stage: 'scout', error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }

  // Never propose something we picked recently, even if the scout ignored the
  // instruction — the prompt is guidance, this is the guarantee.
  const recentSet = new Set(recentSymbols);
  const fresh = candidates.filter((c) => !recentSet.has(c.symbol));

  if (fresh.length === 0) {
    console.error('[weekly-pick] scout returned only recently-picked symbols');
    return NextResponse.json(
      { success: false, stage: 'scout', error: 'no fresh candidates' },
      { status: 500 }
    );
  }

  // ── Stage 2: ground ───────────────────────────────────────────────────────
  const { survivors, rejected } = await groundCandidates(fresh);

  if (survivors.length === 0) {
    console.error('[weekly-pick] every candidate failed grounding:', rejected);
    return NextResponse.json(
      { success: false, stage: 'ground', error: 'no candidate survived grounding', rejected },
      { status: 500 }
    );
  }

  // ── Stage 3: commit ───────────────────────────────────────────────────────
  let pick;
  try {
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      temperature: 1,
      thinking: { type: 'enabled', budget_tokens: COMMIT_THINKING_BUDGET },
      system: [{ type: 'text', text: COMMIT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: buildCommitPrompt({ today: todayFormatted, scorecards: formatScorecards(survivors) }),
      }],
    });

    const final = await stream.finalMessage();
    void logAiCall({
      userId: null,
      feature: 'weekly_pick_commit',
      model: MODEL,
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      metadata: { date: todayET, candidates: survivors.length },
    });

    pick = parseModelPick(tailText(final.content));
  } catch (err) {
    console.error('[weekly-pick] commit stage failed:', err);
    return NextResponse.json(
      { success: false, stage: 'commit', error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }

  // ── Stage 4: validate + persist ───────────────────────────────────────────
  // The model may only pick from the grounded shortlist. A substituted symbol
  // means it ignored the constraint, and that pick is not trustworthy.
  const chosen = survivors.find((s) => s.symbol === pick.symbol);
  if (!chosen) {
    console.error(`[weekly-pick] model chose ${pick.symbol}, not on the shortlist`, {
      shortlist: survivors.map((s) => s.symbol),
    });
    return NextResponse.json(
      { success: false, stage: 'validate', error: `symbol ${pick.symbol} was not on the shortlist` },
      { status: 500 }
    );
  }

  // Logo is nice-to-have; never fail a pick over it.
  let logoUrl = chosen.logoUrl;
  if (!logoUrl) {
    try {
      logoUrl = await getLogoUrl(chosen.symbol);
    } catch { /* keep null */ }
  }

  const thesis: StoredThesis = {
    sections: pick.thesis.sections,
    evidence: pick.thesis.evidence,
    invalidation: pick.invalidation,
  };

  const row = {
    pick_date: todayET,
    symbol: chosen.symbol,
    company_name: chosen.name,
    logo_url: logoUrl,
    sector: chosen.sector,
    // entry_price / benchmark_entry_price stay NULL — stamped from the first
    // regular-session open once it exists. See /api/picks/performance.
    headline: pick.headline,
    one_liner: pick.oneLiner,
    catalyst_type: pick.catalystType,
    conviction: pick.conviction,
    horizon: pick.horizon,
    thesis,
    risks: pick.risks,
    metrics_snapshot: toMetricsSnapshot(chosen),
    model: MODEL,
  };

  const { error: insertError } = await supabase
    .from('ai_stock_picks')
    .insert(row as never);

  if (insertError) {
    console.error('[weekly-pick] insert failed:', insertError);
    return NextResponse.json({ success: false, stage: 'persist', error: insertError.message }, { status: 500 });
  }

  // ── Fan out: notify users who want to know when the pick drops ────────────
  // Ticker/headline/entry are free-tier content (only the thesis is
  // Pro-gated — see /api/picks/current), so this goes to everyone, not just
  // Pro. Scheduled via after() so it runs post-response without risking the
  // published pick over a notification failure; a run-summary success has
  // already been earned by this point regardless of fan-out outcome.
  after(async () => {
    try {
      const { data: eligibleUsers } = await supabase
        .from('users')
        .select('id')
        .or('settings->notifications->weekly_pick.is.null,settings->notifications->weekly_pick.eq.true') as unknown as
        { data: Array<{ id: string }> | null };
      for (const u of eligibleUsers ?? []) {
        await createWeeklyPickNotification(u.id, {
          symbol: chosen.symbol,
          headline: pick.headline,
          pickDate: todayET,
        });
      }
    } catch (err) {
      console.error('[weekly-pick] notification fan-out failed:', err);
    }
  });

  return NextResponse.json({
    success: true,
    date: todayET,
    symbol: chosen.symbol,
    company: chosen.name,
    headline: pick.headline,
    conviction: pick.conviction,
    shortlist: survivors.map((s) => s.symbol),
    rejected,
    lateGeneration,
  });
}
