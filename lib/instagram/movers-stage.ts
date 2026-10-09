/**
 * Stage a carousel in instagram_posts, preview it in Discord, then publish
 * it. stageAndPublishPost is the generic path (also the Weekly Pick
 * scoreboard); stageAndPublishMovers wraps it for the daily, weekly and
 * monthly movers so the three can't drift on how a movers post goes out.
 */

import { createServerClient } from '@/lib/supabase/client';
import { totalSlideCount } from '@/lib/instagram/render/slides';
import { contentVersion } from '@/lib/instagram/render/cache-bust';
import { postToDiscord } from '@/lib/discord/post-message';
import { instagramBioLink } from '@/lib/instagram/utm-link';
import { publishStagedPost } from '@/lib/instagram/publish';
import type { InstagramPostSlides, MarketMoversSlides } from '@/lib/instagram/content/schema';

import { SITE_URL } from '@/lib/site';
export interface StagedMovers {
  postId: string;
  slideCount: number;
  previewLinks: string;
  /** Null for a dry run. */
  publish: Awaited<ReturnType<typeof publishStagedPost>> | null;
}

export async function stageAndPublishMovers(opts: {
  contentType: string;
  periodKey: string;
  content: MarketMoversSlides;
  /** Stage only: no Discord message, no publish. For manual test runs. */
  dryRun?: boolean;
}): Promise<StagedMovers> {
  const { content } = opts;
  const topGainer = content.winners[0];
  const topLoser = content.losers[0];
  return stageAndPublishPost({
    ...opts,
    discordTitle: `${content.sessionLabel ? `${content.sessionLabel} m` : 'M'}arket movers auto-publishing — ${content.dateLabel}`,
    discordSummary: `Top gainer: ${topGainer.symbol} +${topGainer.changePercent.toFixed(2)}%. Top loser: ${topLoser.symbol} ${topLoser.changePercent.toFixed(2)}%.`,
  });
}

export async function stageAndPublishPost(opts: {
  contentType: string;
  periodKey: string;
  content: InstagramPostSlides & { caption: string };
  discordTitle: string;
  /** One line above the slide links in the Discord preview. */
  discordSummary: string;
  dryRun?: boolean;
}): Promise<StagedMovers> {
  const { contentType, periodKey, content, discordTitle, discordSummary, dryRun = false } = opts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any; // instagram_posts isn't in the generated Database type yet

  const { data: inserted, error: insertError } = await db
    .from('instagram_posts')
    .insert({
      content_type: contentType,
      period_key: periodKey,
      status: 'ready',
      slides: content,
      caption: content.caption,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? 'insert_failed');
  }

  const postId = inserted.id as string;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
  const slideCount = totalSlideCount(content);
  // ?v=<content hash> so a later fix to this same post (a manual DB patch, a
  // re-notify) produces genuinely different URLs — see contentVersion's doc
  // comment for why a same-URL cache silently defeats a same-URL fix.
  const v = contentVersion(content);
  const previewLinks = Array.from({ length: slideCount }, (_, i) =>
    `[Slide ${i + 1}](${appUrl}/api/instagram/render/${postId}/${i}?v=${v})`
  ).join(' · ');

  if (dryRun) return { postId, slideCount, previewLinks, publish: null };

  const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await postToDiscord(webhookUrl, {
        embeds: [
          {
            title: discordTitle,
            description: `${discordSummary} ${slideCount} slides.\n\n${previewLinks}\n\n**Caption:**\n${content.caption}`,
            color: 0x34d399,
            fields: [{ name: 'Bio link', value: instagramBioLink(contentType, periodKey) }],
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (err) {
      // Never fail the run over a notification failure — publishing below
      // doesn't depend on it.
      console.error(`[${contentType}] Discord notification failed:`, err);
    }
  } else {
    console.warn(`[${contentType}] DISCORD_INSTAGRAM_WEBHOOK_URL not set, skipping pre-publish notification`);
  }

  // News for the period that just closed: publish immediately.
  // publishStagedPost posts its own Discord confirmation (or failure) message
  // and updates the row's status.
  const publish = await publishStagedPost(postId);
  return { postId, slideCount, previewLinks, publish };
}
