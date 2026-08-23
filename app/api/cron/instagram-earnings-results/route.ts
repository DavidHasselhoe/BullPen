/**
 * Instagram Earnings-Results Weekly Generation Cron
 * GET /api/cron/instagram-earnings-results
 *
 * Runs Saturday, looking back at the Monday-Friday that just ended (see
 * .github/workflows/cron-instagram-earnings-results.yml). Generates the
 * "how did the week's earnings go" beat/missed recap carousel, stages it in
 * instagram_posts (status: 'ready'), and posts a Discord preview — same
 * review-then-manual-publish flow as instagram-earnings-weekly. This route
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
import { postToDiscord } from '@/lib/discord/post-message';
import { isoWeekKey } from '@/lib/instagram/period-key';
import { instagramBioLink } from '@/lib/instagram/utm-link';
import type { EarningsResultsSlides } from '@/lib/instagram/content/schema';

export const maxDuration = 60;

const CONTENT_TYPE = 'earnings_results';

/**
 * The most recently completed Monday-Friday relative to `reference`.
 * Designed to be triggered Saturday (daysSinceFriday=1) or Sunday
 * (daysSinceFriday=2), but stays correct for any manual trigger day —
 * e.g. triggered on Friday itself (daysSinceFriday=0) targets that same
 * week, triggered on Monday (daysSinceFriday=3) targets the week that just
 * ended. Mirror image of instagram-earnings-weekly's nextTradingWeek,
 * which jumps forward instead of back.
 */
function lastTradingWeek(reference: Date): { weekStart: string; weekEnd: string } {
  const dow = reference.getDay(); // 0=Sun..6=Sat
  const daysSinceFriday = (dow - 5 + 7) % 7;
  const friday = new Date(reference);
  friday.setDate(reference.getDate() - daysSinceFriday);
  const monday = new Date(friday);
  monday.setDate(friday.getDate() - 4);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: fmt(monday), weekEnd: fmt(friday) };
}

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

  const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await postToDiscord(webhookUrl, {
        embeds: [
          {
            title: `Earnings results ready for review — week of ${content.weekLabel}`,
            description: `${content.beatCount} beat, ${content.missedCount} missed (${content.companies.length} companies), ${slideCount} slides.\n\n${previewLinks}\n\n**Caption:**\n${content.caption}`,
            color: 0x34d399,
            fields: [
              { name: 'Publish', value: `\`npm run instagram-publish -- --id=${postId}\`` },
              { name: 'Bio link (if publishing)', value: bioLink },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (err) {
      // Never fail the cron over a notification failure — the row is already
      // staged and can still be published manually by id.
      console.error('[instagram-earnings-results] Discord notification failed:', err);
    }
  } else {
    console.warn('[instagram-earnings-results] DISCORD_INSTAGRAM_WEBHOOK_URL not set, skipping review notification');
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
