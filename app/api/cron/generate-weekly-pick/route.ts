/**
 * Bull's Weekly Pick — generation cron
 * GET /api/cron/generate-weekly-pick
 *
 * Runs Mondays at 06:30 UTC (01:30 ET) via Vercel cron — published before
 * pre-market, so the first price any reader could act on is that session's open.
 * Idempotent per calendar week (ET, Monday-anchored): any call between this
 * week's Monday and the next is a no-op once one pick exists for the week —
 * not just a same-day retry. Matters because this endpoint also accepts a
 * manual `workflow_dispatch`/curl trigger, which could otherwise publish a
 * second real pick inside the same 7 days.
 *
 * The pick itself comes from lib/ai/picks/pipeline.ts: factor screen, grounding,
 * Opus 5.5 due diligence with web search, then three independent commit runs
 * and a majority vote. This route only guards, persists and notifies.
 *
 * If any stage fails, nothing is published. A missing week is honest; a pick we
 * can't stand behind is not. The row is written with entry_price = NULL and
 * stamped later by /api/picks/performance from that session's actual open.
 *
 * Cost: 4–5 Opus 5.5 calls (~$1–3/run). TwelveData: one batched /quote for the
 * 25 screened names.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { createWeeklyPickNotification } from '@/lib/notifications/notification-creators';
import { runWeeklyPickPipeline } from '@/lib/ai/picks/pipeline';

export const maxDuration = 300;

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

  // ── Generate ────────────────────────────────────────────────────────────
  const result = await runWeeklyPickPipeline({ todayET });
  const { trace } = result;
  console.log('[weekly-pick] trace', JSON.stringify({
    timingsMs: trace.timingsMs, tokens: trace.costTokens, finalists: trace.finalists,
    votes: trace.votes, tiebreak: trace.tiebreak, groundingRejected: trace.groundingRejected,
  }));

  if (!result.ok) {
    console.error(`[weekly-pick] ${result.stage} stage failed: ${result.error}`);
    return NextResponse.json({ success: false, stage: result.stage, error: result.error }, { status: 500 });
  }
  const { row, chosen, pick } = result;

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
    finalists: trace.finalists,
    votes: trace.votes,
    lateGeneration,
  });
}
