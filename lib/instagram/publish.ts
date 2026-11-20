/**
 * Publish a single staged instagram_posts row — shared by the manual
 * publish script (scripts/publish-instagram.ts), app/api/instagram/publish-by-id,
 * and every generation cron (they all call this immediately after staging,
 * so the fetch → dry-run-or-publish → status update → Discord notify
 * sequence only needs implementing once).
 */
import { createServerClient } from '@/lib/supabase/client';
import { publishCarousel, publishReel, findReelPostedSince, isInstagramConfigured } from '@/lib/instagram/client';
import { REEL_THUMB_OFFSET_MS } from '@/lib/instagram/render/reel';
import { totalSlideCount, altTextForSlide } from '@/lib/instagram/render/slides';
import { postToDiscord } from '@/lib/discord/post-message';
import { instagramBioLink } from '@/lib/instagram/utm-link';
import { checkPublishable } from '@/lib/instagram/content/publish-guard';
import type { InstagramPostSlides } from '@/lib/instagram/content/schema';

import { SITE_URL } from '@/lib/site';
interface InstagramPostRow {
  id: string;
  status: string;
  caption: string;
  slides: InstagramPostSlides;
  content_type: string;
  period_key: string;
  media_format: 'carousel' | 'reel';
  video_url: string | null;
  handoff_at: string | null;
}

export type PublishStagedPostResult =
  | { outcome: 'not_found' }
  | { outcome: 'not_ready'; status: string }
  | { outcome: 'blocked'; problems: string[] }
  | { outcome: 'dry_run'; imageUrls: string[]; caption: string }
  | { outcome: 'published'; mediaId: string; permalink: string | null }
  | { outcome: 'failed'; error: string };

export async function publishStagedPost(id: string): Promise<PublishStagedPostResult> {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  const { data: post } = (await db
    .from('instagram_posts')
    .select('id, status, caption, slides, content_type, period_key, media_format, video_url, handoff_at')
    .eq('id', id)
    .maybeSingle()) as { data: InstagramPostRow | null };

  if (!post) return { outcome: 'not_found' };
  if (post.status !== 'ready') return { outcome: 'not_ready', status: post.status };

  // Every publish path in the app comes through here, so this is the one place
  // that can stop an incomplete post reaching Instagram. Deliberately before
  // the dry-run branch: a dry run should report the same verdict a real
  // publish would, or it isn't a rehearsal.
  const guard = checkPublishable(post.slides);
  if (!guard.ok) {
    // Left at 'ready' on purpose: the data may be fixable, and a person can
    // still publish deliberately once it is.
    const webhookUrl = process.env.DISCORD_EARNINGS_DEEPDIVE_WEBHOOK_URL || process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
    if (webhookUrl) {
      await postToDiscord(webhookUrl, {
        content:
          `🚧 **Held back a post that wasn't complete.** \`${post.content_type}\` · \`${post.period_key}\`\n` +
          guard.problems.map((p) => `• ${p}`).join('\n') +
          `\n\nNothing was published. Fix the data and publish with \`npm run instagram-publish -- --id=${post.id}\`, or leave it.`,
      }).catch((err) => console.error('[instagram-publish] Discord block notice failed:', err));
    }
    console.error(`[instagram-publish] blocked ${post.id} (${post.period_key}):`, guard.problems.join('; '));
    return { outcome: 'blocked', problems: guard.problems };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
  const slideCount = totalSlideCount(post.slides);
  // `v` is ignored by the route. It gives every publish attempt fresh URLs, so
  // neither our CDN nor Meta can hand back a slide rendered before a fix.
  const v = Date.now();
  const imageUrls = Array.from({ length: slideCount }, (_, i) => `${appUrl}/api/instagram/render/${post.id}/${i}?v=${v}`);
  const altTexts = Array.from({ length: slideCount }, (_, i) => altTextForSlide(post.slides, i));

  const isReel = post.media_format === 'reel';
  if (isReel && !post.video_url) return { outcome: 'blocked', problems: ['Reel row has no video_url'] };

  if (!isInstagramConfigured()) {
    return { outcome: 'dry_run', imageUrls: isReel ? [post.video_url!] : imageUrls, caption: post.caption };
  }

  try {
    let result: { mediaId?: string; permalink?: string | null };
    let how = 'Published to Instagram';
    if (isReel) {
      // A handed-off Reel is David's to post by hand with a trending sound (the
      // API can't attach one); this run is the fallback. If he already posted
      // it, record his post instead of publishing a second copy.
      const manual = post.handoff_at ? await findReelPostedSince(post.handoff_at) : null;
      if (manual) {
        result = manual;
        how = 'Found the Reel you posted';
      } else {
        result = await publishReel({ videoUrl: post.video_url!, caption: post.caption, thumbOffsetMs: REEL_THUMB_OFFSET_MS });
        if (post.handoff_at) how = 'Nobody posted the Reel in time, so the version with no voice and no music went out automatically';
      }
    } else {
      result = await publishCarousel({ imageUrls, altTexts, caption: post.caption });
    }

    await db
      .from('instagram_posts')
      .update({
        status: 'published',
        instagram_media_id: result.mediaId,
        instagram_permalink: result.permalink,
        published_at: new Date().toISOString(),
      })
      .eq('id', id);

    const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
    if (webhookUrl) {
      const bioLink = instagramBioLink(post.content_type, post.period_key);
      await postToDiscord(webhookUrl, {
        content: `✅ ${how}: ${result.permalink ?? result.mediaId}\nBio link should be: ${bioLink}`,
      }).catch((err) => console.error('Discord confirmation failed (post still published):', err));
    }

    return { outcome: 'published', mediaId: result.mediaId as string, permalink: result.permalink ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db.from('instagram_posts').update({ status: 'failed', error: message }).eq('id', id);

    const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
    if (webhookUrl) {
      await postToDiscord(webhookUrl, { content: `❌ Instagram publish failed for post ${id}: ${message}` }).catch(() => {});
    }

    return { outcome: 'failed', error: message };
  }
}
