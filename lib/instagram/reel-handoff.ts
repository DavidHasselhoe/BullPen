/**
 * Hands a finished deep dive to David as a Reel instead of publishing it.
 * The API can't attach Instagram's trending sounds, so he posts it by hand
 * from the app, and a delayed publish is the fallback if he doesn't:
 *
 *   1. render the MP4 (reel-video.ts; needs ffmpeg, so this runs in the
 *      local earnings watcher, never on Vercel)
 *   2. upload it to the public instagram-reels bucket
 *   3. mark the row media_format 'reel' with video_url + handoff_at
 *   4. send the video and caption to Discord with the deadline
 *   5. ask QStash to call prod publish-by-id after HANDOFF_MINUTES. There,
 *      publishStagedPost records his post if a Reel appeared since the
 *      handoff, else publishes this one with no music.
 *
 * Step 5 lives in QStash rather than in the watcher, so the fallback still
 * fires if the watcher's terminal dies (it has, when the desktop app restarted).
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createServerClient } from '@/lib/supabase/client';
import { postToDiscord } from '@/lib/discord/post-message';
import { renderDeepDiveReel } from '@/lib/instagram/render/reel-video';
import { SITE_URL } from '@/lib/site';

export const HANDOFF_MINUTES = 45;
const BUCKET = 'instagram-reels';

export interface HandoffResult { videoUrl: string; deadline: Date; fallbackScheduled: boolean }

export async function handOffReel(postId: string): Promise<HandoffResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any;
  const { data: post, error } = await db.from('instagram_posts').select('content_type, period_key, status, caption, slides').eq('id', postId).single();
  if (error || !post) throw new Error(`Post ${postId} not found`);
  if (post.content_type !== 'earnings_deep_dive') throw new Error(`No Reel template for ${post.content_type}`);
  if (post.status !== 'ready') throw new Error(`Post ${postId} is '${post.status}', not 'ready'`);

  const file = join(tmpdir(), `${post.period_key}.mp4`);
  const rendered = await renderDeepDiveReel(post.slides.data, file);
  console.log(`[reel-handoff] Rendered ${rendered.seconds.toFixed(1)}s Reel with ${rendered.vcodec}.`);

  // Timestamped name: a re-run never serves Meta or Discord a cached older cut.
  const objectPath = `${post.period_key}-${Date.now()}.mp4`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(objectPath, readFileSync(file), { contentType: 'video/mp4' });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const videoUrl: string = db.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;

  const handoffAt = new Date();
  const deadline = new Date(handoffAt.getTime() + HANDOFF_MINUTES * 60_000);
  const { error: rowErr } = await db
    .from('instagram_posts')
    .update({ media_format: 'reel', video_url: videoUrl, handoff_at: handoffAt.toISOString() })
    .eq('id', postId);
  if (rowErr) throw new Error(`Row update failed: ${rowErr.message}`);

  const fallbackScheduled = await scheduleFallbackPublish(postId).then(() => true, (err) => {
    console.error('[reel-handoff] Could not schedule the fallback publish:', err instanceof Error ? err.message : err);
    return false;
  });

  const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    const unix = Math.floor(deadline.getTime() / 1000);
    // Discord renders <t:…:t> in the reader's own time zone.
    const when = fallbackScheduled
      ? `If no new Reel is on the account by <t:${unix}:t>, this one goes out automatically with no music.`
      : `⚠️ The automatic fallback could not be scheduled, so the watcher will publish it itself in ${HANDOFF_MINUTES} min if it's still running. Post id: ${postId}`;
    // Not fatal: the row is already a Reel and the fallback is set, so a Discord hiccup must not
    // send the caller down its publish-the-carousel-now path.
    await postToDiscord(webhookUrl, {
      content:
        `🎬 **${post.period_key} Reel is ready for you to post.** Add a trending sound in the app and set the cover to about 1.5 s in.\n` +
        `${when}\nVideo: ${videoUrl}`,
    }).catch((err) => console.error('[reel-handoff] Discord notice failed:', err));
    // Caption on its own, so it copies cleanly and never runs into Discord's 2000-character cap with the text above.
    await postToDiscord(webhookUrl, { content: post.caption }).catch((err) => console.error('[reel-handoff] Discord caption failed:', err));
  }

  return { videoUrl, deadline, fallbackScheduled };
}

/** QStash calls prod publish-by-id once, HANDOFF_MINUTES from now. No retries: a retry after a slow publish could post twice. */
async function scheduleFallbackPublish(postId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  const secret = process.env.CRON_SECRET;
  if (!token || !secret) throw new Error('QSTASH_TOKEN and CRON_SECRET are both needed');
  const base = process.env.APP_URL || SITE_URL;
  const res = await fetch(`https://qstash.upstash.io/v2/publish/${base}/api/instagram/publish-by-id?id=${postId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Upstash-Method': 'GET',
      'Upstash-Delay': `${HANDOFF_MINUTES}m`,
      'Upstash-Retries': '0',
      // QStash only passes custom headers on with this prefix.
      'Upstash-Forward-Authorization': `Bearer ${secret}`,
    },
  });
  if (!res.ok) throw new Error(`QStash ${res.status}: ${await res.text()}`);
}
