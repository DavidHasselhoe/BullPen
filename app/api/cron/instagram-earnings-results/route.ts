/**
 * Instagram Earnings-Results Weekly Generation Cron
 * GET /api/cron/instagram-earnings-results
 *
 * Runs Saturday, looking back at the Monday-Friday that just ended (see
 * .github/workflows/cron-instagram-earnings-results.yml). Generates the
 * "how did the week's earnings go" beat/missed recap carousel, stages it in
 * instagram_posts (status: 'ready'), and posts a Discord preview with a
 * "Publish Now" button. app/api/cron/instagram-earnings-results-publish
 * auto-publishes whatever is still 'ready' the next day — same
 * review-then-auto-publish flow as instagram-earnings-weekly. This route
 * itself never calls the Instagram API.
 *
 * Idempotent per ISO week (period_key), scoped to this content_type so it
 * can share the same period_key as an earnings_calendar row for the same
 * week without colliding (see the UNIQUE (content_type, period_key)
 * constraint in migration 102).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { generateEarningsResultsContent } from '@/lib/instagram/content/earnings-results';
import { totalSlideCount } from '@/lib/instagram/render/slides';
import { sendDiscordBotMessage } from '@/lib/discord/bot-message';
import { isoWeekKey, lastTradingWeek } from '@/lib/instagram/period-key';
import { instagramBioLink } from '@/lib/instagram/utm-link';
import type { EarningsResultsSlides } from '@/lib/instagram/content/schema';

export const maxDuration = 60;

const CONTENT_TYPE = 'earnings_results';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/instagram-earnings-results' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  const referenceET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const { weekStart, weekEnd } = lastTradingWeek(referenceET);
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
  let content: EarningsResultsSlides | null;
  try {
    content = await generateEarningsResultsContent(weekStart, weekEnd);
  } catch (err) {
    console.error('[instagram-earnings-results] content generation failed:', err);
    return NextResponse.json(
      { success: false, error: 'content_generation_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  // No allowlisted company had a confirmed estimate+actual pair for the
  // week — skip entirely rather than stage a filler post.
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
    console.error('[instagram-earnings-results] insert failed:', insertError);
    return NextResponse.json({ success: false, error: insertError?.message ?? 'insert_failed' }, { status: 500 });
  }

  const postId = inserted.id as string;

  // ── Review notification ─────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  const slideCount = totalSlideCount(content);
  const previewLinks = Array.from({ length: slideCount }, (_, i) =>
    `[Slide ${i + 1}](${appUrl}/api/instagram/render/${postId}/${i})`
  ).join(' · ');

  const bioLink = instagramBioLink(CONTENT_TYPE, periodKey);

  const channelId = process.env.DISCORD_INSTAGRAM_CHANNEL_ID;
  if (channelId) {
    try {
      await sendDiscordBotMessage(channelId, {
        embeds: [
          {
            title: `Earnings results ready for review — week of ${content.weekLabel}`,
            description: `${content.beatCount} beat, ${content.missedCount} missed (${content.companies.length} companies), ${slideCount} slides.\n\n${previewLinks}\n\n**Caption:**\n${content.caption}`,
            color: 0x34d399,
            fields: [{ name: 'Bio link (if publishing)', value: bioLink }],
            timestamp: new Date().toISOString(),
          },
        ],
        buttons: [{ label: 'Publish Now', customId: `publish:${postId}`, style: 'success' }],
      });
    } catch (err) {
      // Never fail the cron over a notification failure — the row is already
      // staged and can still be published manually via app/api/instagram/publish-by-id.
      console.error('[instagram-earnings-results] Discord notification failed:', err);
    }
  } else {
    console.warn('[instagram-earnings-results] DISCORD_INSTAGRAM_CHANNEL_ID not set, skipping review notification');
  }

  return NextResponse.json({
    success: true,
    postId,
    periodKey,
    weekLabel: content.weekLabel,
    beatCount: content.beatCount,
    missedCount: content.missedCount,
    companies: content.companies.length,
    slideCount,
  });
}
