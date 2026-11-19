/**
 * Renders an earnings deep dive as a 9:16 Reel MP4, locally, from a real
 * instagram_posts row, plus one PNG still per beat. Read-only against the
 * database; publishes nothing. See lib/instagram/render/reel-video.ts for
 * the ffmpeg requirements (FFMPEG_PATH).
 *
 * npx tsx scripts/render-reel.ts --id=<postId> [--out=.playwright-mcp/reels]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { mkdirSync } from 'fs';
import { join } from 'path';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const id = arg('id');
  if (!id) throw new Error('Usage: npx tsx scripts/render-reel.ts --id=<postId>');
  const outDir = arg('out') ?? '.playwright-mcp/reels';

  const { createServerClient } = await import('../lib/supabase/client');
  const { renderDeepDiveReel } = await import('../lib/instagram/render/reel-video');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any;
  const { data: post, error } = await db.from('instagram_posts').select('content_type, period_key, slides').eq('id', id).single();
  if (error || !post) throw new Error(`Post ${id} not found`);
  if (post.content_type !== 'earnings_deep_dive') throw new Error(`Only earnings_deep_dive has a Reel template so far (got ${post.content_type})`);

  mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const r = await renderDeepDiveReel(post.slides.data, join(outDir, `${post.period_key}.mp4`), join(outDir, post.period_key));
  console.log(`${r.path}: ${r.frames} frames, ${r.seconds.toFixed(1)}s, ${r.vcodec}, rendered in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((err) => { console.error(err); process.exit(1); });
