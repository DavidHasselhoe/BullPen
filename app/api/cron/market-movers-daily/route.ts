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
 * it in instagram_posts, then immediately publishes it for real via
 * publishStagedPost — market movers are inherently same-day news, so unlike
 * the weekly earnings-calendar/results posts there's no useful "review
 * window" to wait out; a day-late top-10 list is stale. The pre-publish
 * Discord message still posts slide-preview links for a quick sanity check,
 * and publishStagedPost sends its own follow-up confirmation once live.
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
import { contentVersion } from '@/lib/instagram/render/cache-bust';
import { postToDiscord } from '@/lib/discord/post-message';
import { instagramBioLink } from '@/lib/instagram/utm-link';
import { publishStagedPost } from '@/lib/instagram/publish';
import type { MarketMoversSlides } from '@/lib/instagram/content/schema';

// 60s was too tight and timed out intermittently in production: fetchRankedQuotes
// needs ~518 credits for the full SIGNIFICANT_TICKERS universe against the shared
// CRON_CREDIT_SHARE of 400/60s (lib/twelvedata/credit-budget.ts), so the last chunk
// structurally has to wait for the next minute's bucket before the logo backfill and
// Claude caption call even start. Matches check-price-moves, the closest analog.
export const maxDuration = 300;

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

  // Off-schedule special edition (e.g. a pre-market post ahead of a
  // market-moving event) — ?preMarket=true switches to live pre-market
  // quotes and a distinct period_key so it never collides with (or gets
  // skipped by the idempotency check for) that same day's regular post-close
  // post. contextNote is a real, confirmed fact the caption is allowed to
  // reference (see GenerateMarketMoversOptions) — never invented server-side.
  const sp = request.nextUrl.searchParams;
  const preMarket = sp.get('preMarket') === 'true';
  const contextNote = sp.get('contextNote') ?? undefined;

  const basePeriodKey = todayEtDateKey();
  const periodKey = preMarket ? `${basePeriodKey}-premarket` : basePeriodKey;

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
    content = await generateMarketMoversContent(basePeriodKey, { preMarket, contextNote });
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

  // ── Pre-publish notification ────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  const slideCount = totalSlideCount(content);
  // ?v=<content hash> so a later fix to this same post (a manual DB patch, a
  // re-notify) produces genuinely different URLs — see contentVersion's doc
  // comment for why a same-URL cache silently defeats a same-URL fix.
  const v = contentVersion(content);
  const previewLinks = Array.from({ length: slideCount }, (_, i) =>
    `[Slide ${i + 1}](${appUrl}/api/instagram/render/${postId}/${i}?v=${v})`
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
            title: `${content.sessionLabel ? `${content.sessionLabel} m` : 'M'}arket movers auto-publishing — ${content.dateLabel}`,
            description: `Top gainer: ${topGainer.symbol} +${topGainer.changePercent.toFixed(2)}%. Top loser: ${topLoser.symbol} ${topLoser.changePercent.toFixed(2)}%. ${slideCount} slides.\n\n${previewLinks}\n\n**Caption:**\n${content.caption}`,
            color: 0x34d399,
            fields: [
              { name: 'Bio link', value: bioLink },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (err) {
      // Never fail the cron over a notification failure — publishing below
      // doesn't depend on it.
      console.error('[market-movers-daily] Discord notification failed:', err);
    }
  } else {
    console.warn('[market-movers-daily] DISCORD_INSTAGRAM_WEBHOOK_URL not set, skipping pre-publish notification');
  }

  // ── Publish ──────────────────────────────────────────────────────────────
  // Same-day news — publish immediately rather than waiting for a manual
  // step or a next-cycle cron. publishStagedPost posts its own Discord
  // confirmation (or failure) message and updates the row's status.
  const publishResult = await publishStagedPost(postId);

  return NextResponse.json({
    success: true,
    postId,
    periodKey,
    dateLabel: content.dateLabel,
    topGainer: `${topGainer.symbol} +${topGainer.changePercent.toFixed(2)}%`,
    publish: publishResult,
    topLoser: `${topLoser.symbol} ${topLoser.changePercent.toFixed(2)}%`,
    slideCount,
  });
}
