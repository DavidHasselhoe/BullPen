/**
 * Renders an earnings deep dive or a weekly results post as a 9:16 Reel MP4, locally, from a real
 * instagram_posts row, plus one PNG still per beat. Read-only against the
 * database; publishes nothing. Writes two mixes: <key>.mp4 (voice + SFX, to
 * post by hand) and <key>-auto.mp4 (SFX + bed, the fallback). The voice needs
 * ELEVENLABS_API_KEY and is a paid call (cached per narration, so a re-render
 * is free); --no-voice skips it. See lib/instagram/render/reel-video.ts for
 * the ffmpeg requirements (FFMPEG_PATH).
 *
 * npx tsx scripts/render-reel.ts --id=<postId> [--out=.playwright-mcp/reels] [--no-voice]
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
  const { renderDeepDiveReel, renderResultsReel } = await import('../lib/instagram/render/reel-video');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any;
  const { data: post, error } = await db.from('instagram_posts').select('content_type, period_key, slides').eq('id', id).single();
  if (error || !post) throw new Error(`Post ${id} not found`);
  const results = post.content_type === 'earnings_results';
  if (!results && post.content_type !== 'earnings_deep_dive') throw new Error(`No Reel template for ${post.content_type} (deep dives and results only)`);
  const key = results ? `results-${post.period_key}` : post.period_key;

  mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const out = join(outDir, `${key}.mp4`);
  const opts = { stillsPrefix: join(outDir, key), ...(process.argv.includes('--no-voice') ? { voice: null } : {}) };
  const r = results ? await renderResultsReel(post.slides, out, opts) : await renderDeepDiveReel(post.slides.data, out, opts);
  console.log(`${r.manual} (${r.voiced ? 'voice + SFX' : 'SFX only, no voice'}) and ${r.auto} (SFX + bed): ${r.frames} frames, ${r.seconds.toFixed(1)}s, ${r.vcodec}, rendered in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((err) => { console.error(err); process.exit(1); });
