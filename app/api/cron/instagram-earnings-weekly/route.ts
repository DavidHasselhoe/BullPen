/**
 * Instagram Earnings-Calendar Weekly Generation Cron
 * GET /api/cron/instagram-earnings-weekly
 *
 * Runs Sunday, ahead of the coming trading week (see
 * .github/workflows/cron-instagram-earnings.yml). Generates the earnings-
 * calendar carousel for next Monday-Friday, stages it in instagram_posts
 * (status: 'ready'), and posts a Discord preview. Monday morning,
 * app/api/cron/instagram-earnings-publish auto-publishes whatever is still
 * 'ready' — the Discord preview is the review window, not a manual gate
 * anymore. This route itself never calls the Instagram API.
 *
 * Idempotent per ISO week (period_key): skips if a row already exists.
 *
 * Claude cost: one short, non-web-search call (~$0.01/run) — see
 * lib/instagram/content/earnings-calendar.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { generateEarningsCalendarContent } from '@/lib/instagram/content/earnings-calendar';
import { totalSlideCount } from '@/lib/instagram/render/slides';
import { postToDiscord } from '@/lib/discord/post-message';
import { isoWeekKey } from '@/lib/instagram/period-key';
import type { EarningsCalendarSlides } from '@/lib/instagram/content/schema';

export const maxDuration = 60;

const CONTENT_TYPE = 'earnings_calendar';

/**
 * The upcoming Monday-Friday relative to `reference`. Always jumps to a
 * future week even if `reference` itself is a Monday, so a manual
 * mid-week trigger still targets "next week" rather than the one in
 * progress — the cron is expected to run Sunday, but this stays correct
 * regardless of what day it's actually invoked.
 */
function nextTradingWeek(reference: Date): { weekStart: string; weekEnd: string } {
  const dow = reference.getDay(); // 0=Sun..6=Sat
  const daysUntilNextMonday = ((1 - dow + 7) % 7) || 7;
  const monday = new Date(reference);
  monday.setDate(reference.getDate() + daysUntilNextMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: fmt(monday), weekEnd: fmt(friday) };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  const referenceET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const { weekStart, weekEnd } = nextTradingWeek(referenceET);
  const periodKey = isoWeekKey(new Date(weekStart + 'T12:00:00Z'));

  // ── Idempotency ──────────────────────────────────────────────────────────
  const { data: existing } = await db
    .from('instagram_posts')
    .select('id, status')
    .eq('content_type', CONTENT_TYPE)
    .eq('period_key', periodKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, skipped: true, periodKey, reason: 'already_exists', status: existing.status });
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  let content: EarningsCalendarSlides | null;
  try {
    content = await generateEarningsCalendarContent(weekStart, weekEnd);
  } catch (err) {
    console.error('[instagram-earnings-weekly] content generation failed:', err);
    return NextResponse.json(
      { success: false, error: 'content_generation_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  // No allowlisted (S&P 500 / Nasdaq 100 / TSM) company has a confirmed
  // report this week — skip entirely rather than stage a "quiet week"
  // filler post. No row, no Discord notification, no Claude cost (the
  // generator already returned before calling Claude in this case).
  if (content === null) {
    return NextResponse.json({ success: true, skipped: true, periodKey, reason: 'no_companies' });
  }

  // ── Persist ──────────────────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await db
    .from('instagram_posts')
    .insert({
      content_type: CONTENT_TYPE,
      period_key: periodKey,
      status: 'ready',
      slides: content,
      caption: content.caption,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[instagram-earnings-weekly] insert failed:', insertError);
    return NextResponse.json({ success: false, error: insertError?.message ?? 'insert_failed' }, { status: 500 });
  }

  const postId = inserted.id as string;

  // ── Review notification ─────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  const slideCount = totalSlideCount(content.companies.length);
  const previewLinks = Array.from({ length: slideCount }, (_, i) =>
    `[Slide ${i + 1}](${appUrl}/api/instagram/render/${postId}/${i})`
  ).join(' · ');

  const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await postToDiscord(webhookUrl, {
        embeds: [
          {
            title: `Earnings calendar ready for review — week of ${content.weekLabel}`,
            description: `${content.companies.length} companies, ${slideCount} slides.\n\n${previewLinks}\n\n**Caption:**\n${content.caption}`,
            color: 0x34d399,
            fields: [
              { name: 'Publish', value: `\`npm run instagram-publish -- --id=${postId}\`` },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (err) {
      // Never fail the cron over a notification failure — the row is already
      // staged and can still be published manually by id.
      console.error('[instagram-earnings-weekly] Discord notification failed:', err);
    }
  } else {
    console.warn('[instagram-earnings-weekly] DISCORD_INSTAGRAM_WEBHOOK_URL not set, skipping review notification');
  }

  return NextResponse.json({
    success: true,
    postId,
    periodKey,
    weekLabel: content.weekLabel,
    companies: content.companies.length,
    slideCount,
  });
}
