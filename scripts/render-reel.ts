/**
 * Renders an earnings deep dive as a 9:16 Reel MP4, locally, from a real
 * instagram_posts row. Read-only against the database; publishes nothing.
 *
 * npx tsx scripts/render-reel.ts --id=<postId> [--out=.playwright-mcp/reels]
 *
 * Frames come from lib/instagram/render/reel.tsx through next/og's
 * ImageResponse (the same engine as the carousel slides), piped as PNGs into
 * ffmpeg. ffmpeg is not a repo dependency: set FFMPEG_PATH, or have `ffmpeg`
 * on PATH. libx264 is used when the build has it (GitHub runners, winget's
 * Gyan build), else NVIDIA's h264_nvenc; FFMPEG_VCODEC forces one. (Windows'
 * h264_mf segfaults after 3 frames in CapCut's bundled ffmpeg.)
 *
 * Output follows Meta's Reels spec: H.264 yuv420p, closed GOP, 30 fps,
 * AAC 48 kHz stereo (silent), moov atom first. Also writes one PNG still
 * per beat for quick review.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { spawn, execFileSync } from 'child_process';
import { once } from 'events';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const id = arg('id');
  if (!id) throw new Error('Usage: npx tsx scripts/render-reel.ts --id=<postId>');
  const outDir = arg('out') ?? '.playwright-mcp/reels';
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

  const { ImageResponse } = await import('next/og');
  const { createServerClient } = await import('../lib/supabase/client');
  const { loadSlideFonts } = await import('../lib/instagram/render/slides');
  const { DeepDiveReelFrame, deepDiveReelBeats, deepDiveReelBeatStarts, REEL_W, REEL_H, REEL_FPS } = await import('../lib/instagram/render/reel');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any;
  const { data: post, error } = await db.from('instagram_posts').select('content_type, period_key, slides').eq('id', id).single();
  if (error || !post) throw new Error(`Post ${id} not found`);
  if (post.content_type !== 'earnings_deep_dive') throw new Error(`Only earnings_deep_dive has a Reel template so far (got ${post.content_type})`);
  const data = post.slides.data;

  // Inline the logo once; otherwise Satori fetches it again for every frame.
  if (data.logoUrl) {
    const res = await fetch(data.logoUrl);
    if (res.ok) data.logoUrl = `data:${res.headers.get('content-type') ?? 'image/png'};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  }

  const fonts = await loadSlideFonts();
  const beats = deepDiveReelBeats(data);
  const duration = beats.reduce((s, b) => s + b.dur, 0);
  const frames = Math.round(duration * REEL_FPS);

  const encoders = execFileSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const vcodec = process.env.FFMPEG_VCODEC || (/\blibx264\b/.test(encoders) ? 'libx264' : 'h264_nvenc');
  const gop = String(REEL_FPS * 2);
  // Closed GOP, VBR under Meta's 25 Mbps cap.
  const video = vcodec === 'libx264'
    ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-maxrate', '20M', '-bufsize', '40M', '-x264-params', `keyint=${gop}:min-keyint=${gop}:scenecut=0:open-gop=0`]
    : ['-c:v', vcodec, '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-maxrate', '20M', '-bufsize', '40M', '-g', gop, '-bf', '0', '-profile:v', 'high'];

  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${post.period_key}.mp4`);
  const proc = spawn(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(REEL_FPS), '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    ...video, '-pix_fmt', 'yuv420p', '-r', String(REEL_FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const exited = once(proc, 'close');

  // A still just before each beat starts to fade out (and frame 0, the cover).
  const starts = deepDiveReelBeatStarts(data);
  const stills = new Map<number, string>([[0, 'cover']]);
  beats.forEach((b, i) => stills.set(Math.round((starts[i] + b.dur - 0.35) * REEL_FPS), `beat${i + 1}`));

  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    const png = Buffer.from(await new ImageResponse(DeepDiveReelFrame({ data, t: f / REEL_FPS, beats }), { width: REEL_W, height: REEL_H, fonts }).arrayBuffer());
    if (stills.has(f)) writeFileSync(join(outDir, `${post.period_key}-${stills.get(f)}.png`), png);
    if (!proc.stdin.write(png)) await once(proc.stdin, 'drain');
    if (f % 60 === 0) process.stdout.write(`\rframe ${f}/${frames}`);
  }
  proc.stdin.end();
  const [code] = await exited;
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
  console.log(`\r${out}: ${frames} frames, ${duration.toFixed(1)}s, ${vcodec}, rendered in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((err) => { console.error(err); process.exit(1); });
