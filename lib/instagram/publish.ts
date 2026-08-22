/**
 * Publish a single staged instagram_posts row — shared by the manual
 * publish script (scripts/publish-instagram.ts) and the automated Monday
 * publish cron (app/api/cron/instagram-earnings-publish). Both need the
 * exact same fetch → dry-run-or-publish → status update → Discord notify
 * sequence; this is the one place it's implemented.
 */
import { createServerClient } from '@/lib/supabase/client';
import { publishCarousel, isInstagramConfigured } from '@/lib/instagram/client';
import { totalSlideCount, altTextForSlide } from '@/lib/instagram/render/slides';
import { postToDiscord } from '@/lib/discord/post-message';
import { instagramBioLink } from '@/lib/instagram/utm-link';
import type { EarningsCalendarSlides, EarningsResultsSlides } from '@/lib/instagram/content/schema';

interface InstagramPostRow {
  id: string;
  status: string;
  caption: string;
  slides: EarningsCalendarSlides | EarningsResultsSlides;
  content_type: string;
  period_key: string;
}

export type PublishStagedPostResult =
  | { outcome: 'not_found' }
  | { outcome: 'not_ready'; status: string }
  | { outcome: 'dry_run'; imageUrls: string[]; caption: string }
  | { outcome: 'published'; mediaId: string; permalink: string | null }
  | { outcome: 'failed'; error: string };

export async function publishStagedPost(id: string): Promise<PublishStagedPostResult> {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  const { data: post } = (await db
    .from('instagram_posts')
    .select('id, status, caption, slides, content_type, period_key')
    .eq('id', id)
    .maybeSingle()) as { data: InstagramPostRow | null };

  if (!post) return { outcome: 'not_found' };
  if (post.status !== 'ready') return { outcome: 'not_ready', status: post.status };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  const slideCount = totalSlideCount(post.slides.companies.length);
  const imageUrls = Array.from({ length: slideCount }, (_, i) => `${appUrl}/api/instagram/render/${post.id}/${i}`);
  const altTexts = Array.from({ length: slideCount }, (_, i) => altTextForSlide(post.slides, i));

  if (!isInstagramConfigured()) {
    return { outcome: 'dry_run', imageUrls, caption: post.caption };
  }

  try {
    const result = await publishCarousel({ imageUrls, altTexts, caption: post.caption });

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
        content: `✅ Published to Instagram: ${result.permalink ?? result.mediaId}\nBio link should be: ${bioLink}`,
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
