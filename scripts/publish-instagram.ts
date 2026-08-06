/**
 * Publish a staged Instagram post — the human-in-the-loop step of the
 * automated pipeline. app/api/cron/instagram-earnings-weekly generates and
 * stages content automatically; this script is the deliberate, manual
 * "actually make it go live" action, run after reviewing the Discord
 * preview it posts.
 *
 * Usage: npm run instagram-publish -- --id=<postId>
 *
 * If INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ACCOUNT_ID aren't set yet
 * (see docs/instagram-setup.md), this runs as a dry run: prints what would
 * have been published and exits cleanly without touching the row's status,
 * so the whole pipeline is testable before real Meta credentials exist.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createServerClient } from '../lib/supabase/client';
import { publishCarousel, isInstagramConfigured } from '../lib/instagram/client';
import { totalSlideCount } from '../lib/instagram/render/slides';
import { postToDiscord } from '../lib/discord/post-message';

interface InstagramPostRow {
  id: string;
  status: string;
  caption: string;
  slides: { companies: unknown[] };
}

function parseId(): string {
  const arg = process.argv.find((a) => a.startsWith('--id='));
  if (!arg) {
    console.error('Usage: npm run instagram-publish -- --id=<postId>');
    process.exit(1);
  }
  return arg.slice('--id='.length);
}

async function main() {
  const id = parseId();
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  const { data: post } = (await db
    .from('instagram_posts')
    .select('id, status, caption, slides')
    .eq('id', id)
    .maybeSingle()) as { data: InstagramPostRow | null };

  if (!post) {
    console.error(`No instagram_posts row found for id ${id}.`);
    process.exit(1);
  }
  if (post.status !== 'ready') {
    console.error(`Post ${id} has status "${post.status}", not "ready" — nothing to publish.`);
    process.exit(1);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  const slideCount = totalSlideCount(post.slides.companies.length);
  const imageUrls = Array.from({ length: slideCount }, (_, i) => `${appUrl}/api/instagram/render/${post.id}/${i}`);

  if (!isInstagramConfigured()) {
    console.log('Instagram is not configured (INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ACCOUNT_ID unset) — dry run only.\n');
    console.log('Would publish:');
    console.log(`  Caption:\n${post.caption}\n`);
    console.log('  Slides:');
    imageUrls.forEach((url, i) => console.log(`    ${i + 1}. ${url}`));
    console.log('\nSet up Meta credentials (see docs/instagram-setup.md) and re-run this command to publish for real.');
    return;
  }

  console.log(`Publishing post ${id} (${slideCount} slides)...`);
  try {
    const result = await publishCarousel({ imageUrls, caption: post.caption });

    await db
      .from('instagram_posts')
      .update({
        status: 'published',
        instagram_media_id: result.mediaId,
        instagram_permalink: result.permalink,
        published_at: new Date().toISOString(),
      })
      .eq('id', id);

    console.log(`Published. Media id: ${result.mediaId}`);
    if (result.permalink) console.log(`Permalink: ${result.permalink}`);

    const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
    if (webhookUrl) {
      await postToDiscord(webhookUrl, {
        content: `✅ Published to Instagram: ${result.permalink ?? result.mediaId}`,
      }).catch((err) => console.error('Discord confirmation failed (post still published):', err));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Publish failed:', message);

    await db.from('instagram_posts').update({ status: 'failed', error: message }).eq('id', id);

    const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
    if (webhookUrl) {
      await postToDiscord(webhookUrl, { content: `❌ Instagram publish failed for post ${id}: ${message}` }).catch(() => {});
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
