/**
 * Instagram Market Movers Daily Generation Cron
 * GET /api/cron/market-movers-daily
 *
 * Runs Monday/Wednesday/Friday at 21:30 UTC, after US market close (see
 * .github/workflows/cron-market-movers.yml — same time-of-day as
 * check-price-moves, chosen for the same "reliably after close in both
 * EDT/EST" reason; nothing in this codebase hardcodes a fixed UTC close
 * time. 3x/week rather than every weekday to avoid feed fatigue on top of
 * the existing 2x/week earnings content). Generates that day's
 * top-10-gainers/top-10-losers carousel (S&P 500 + Nasdaq 100 only), stages
 * it in instagram_posts (status: 'ready'), and posts a Discord preview — no
 * auto-publish yet, same review-then-manual-publish flow as
 * instagram-earnings-results. This route itself never calls the Instagram
 * API.
 *
 * Idempotent per ET trading day (period_key), scoped to this content_type.
 * Unlike the earnings posts, there is no "skip if nothing happened" case —
 * there's always a top 10/top 10 by rank, so this always stages a post.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { generateMarketMoversContent } from '@/lib/instagram/content/market-movers';
import { totalSlideCount } from '@/lib/instagram/render/slides';
import { postToDiscord } from '@/lib/discord/post-message';
import { instagramBioLink } from '@/lib/instagram/utm-link';
import type { MarketMoversSlides } from '@/lib/instagram/content/schema';

export const maxDuration = 60;

const CONTENT_TYPE = 'market_movers';

/** Today's date in ET as YYYY-MM-DD — the daily idempotency key for this
 *  content type, sibling to isoWeekKey's weekly key for the earnings posts.
 *  en-CA locale formats as YYYY-MM-DD directly, no manual reformatting. */
function todayEtDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/market-movers-daily' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  const periodKey = todayEtDateKey();

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
  let content: MarketMoversSlides;
  try {
    content = await generateMarketMoversContent(periodKey);
  } catch (err) {
    console.error('[market-movers-daily] content generation failed:', err);
    return NextResponse.json(
      { success: false, error: 'content_generation_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
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
    console.error('[market-movers-daily] insert failed:', insertError);
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
  const topGainer = content.winners[0];
  const topLoser = content.losers[0];

  const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await postToDiscord(webhookUrl, {
        embeds: [
          {
            title: `Market movers ready for review — ${content.dateLabel}`,
            description: `Top gainer: ${topGainer.symbol} +${topGainer.changePercent.toFixed(2)}%. Top loser: ${topLoser.symbol} ${topLoser.changePercent.toFixed(2)}%. ${slideCount} slides.\n\n${previewLinks}\n\n**Caption:**\n${content.caption}`,
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
      console.error('[market-movers-daily] Discord notification failed:', err);
    }
  } else {
    console.warn('[market-movers-daily] DISCORD_INSTAGRAM_WEBHOOK_URL not set, skipping review notification');
  }

  return NextResponse.json({
    success: true,
    postId,
    periodKey,
    dateLabel: content.dateLabel,
    topGainer: `${topGainer.symbol} +${topGainer.changePercent.toFixed(2)}%`,
    topLoser: `${topLoser.symbol} ${topLoser.changePercent.toFixed(2)}%`,
    slideCount,
  });
}
