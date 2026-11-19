/**
 * Turns a deep dive into an MP4 Reel: frames from reel.tsx through next/og's
 * ImageResponse, piped as PNGs into ffmpeg. Runs where ffmpeg exists (David's
 * PC for the earnings watcher, a GitHub runner later), never on Vercel.
 *
 * ffmpeg is not a repo dependency: set FFMPEG_PATH, or have `ffmpeg` on PATH.
 * libx264 when the build has it (GitHub runners, winget's Gyan build), else
 * NVIDIA's h264_nvenc; FFMPEG_VCODEC forces one. Windows' h264_mf segfaults
 * after 3 frames in CapCut's bundled ffmpeg, the only one on David's PC.
 *
 * Output follows Meta's Reels spec: H.264 yuv420p, closed GOP, 30 fps,
 * AAC 48 kHz stereo (silent), moov atom first.
 */
import { spawn, execFileSync } from 'child_process';
import { once } from 'events';
import { writeFileSync } from 'fs';
import { ImageResponse } from 'next/og';
import { loadSlideFonts } from './slides';
import { DeepDiveReelFrame, deepDiveReelBeats, deepDiveReelBeatStarts, REEL_W, REEL_H, REEL_FPS } from './reel';
import type { EarningsDeepDiveData } from '@/lib/instagram/content/schema';

export interface RenderReelResult { path: string; seconds: number; frames: number; vcodec: string; stills: string[] }

/** stillsPrefix: also write `${prefix}-cover.png` and one PNG per beat, for review. */
export async function renderDeepDiveReel(source: EarningsDeepDiveData, outPath: string, stillsPrefix?: string): Promise<RenderReelResult> {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const data = { ...source };

  // Inline the logo once; otherwise Satori fetches it again for every frame.
  if (data.logoUrl && !data.logoUrl.startsWith('data:')) {
    const res = await fetch(data.logoUrl);
    if (res.ok) data.logoUrl = `data:${res.headers.get('content-type') ?? 'image/png'};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  }

  const fonts = await loadSlideFonts();
  const beats = deepDiveReelBeats(data);
  const seconds = beats.reduce((s, b) => s + b.dur, 0);
  const frames = Math.round(seconds * REEL_FPS);

  const encoders = execFileSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const vcodec = process.env.FFMPEG_VCODEC || (/\blibx264\b/.test(encoders) ? 'libx264' : 'h264_nvenc');
  const gop = String(REEL_FPS * 2);
  // Closed GOP, VBR under Meta's 25 Mbps cap.
  const video = vcodec === 'libx264'
    ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-maxrate', '20M', '-bufsize', '40M', '-x264-params', `keyint=${gop}:min-keyint=${gop}:scenecut=0:open-gop=0`]
    : ['-c:v', vcodec, '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-maxrate', '20M', '-bufsize', '40M', '-g', gop, '-bf', '0', '-profile:v', 'high'];

  const proc = spawn(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(REEL_FPS), '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    ...video, '-pix_fmt', 'yuv420p', '-r', String(REEL_FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart', outPath,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const exited = once(proc, 'close');
  // If ffmpeg dies, a pending 'drain' never fires and Node exits silently with code 0. Fail loudly instead.
  let died: Error | null = null;
  proc.on('exit', (code) => { if (code !== 0) died = new Error(`ffmpeg exited with ${code} (${vcodec})`); });

  const stills = new Map<number, string>();
  if (stillsPrefix) {
    const starts = deepDiveReelBeatStarts(data);
    stills.set(0, `${stillsPrefix}-cover.png`);
    beats.forEach((b, i) => stills.set(Math.round((starts[i] + b.dur - 0.35) * REEL_FPS), `${stillsPrefix}-beat${i + 1}.png`));
  }

  for (let f = 0; f < frames; f++) {
    if (died) throw died;
    const png = Buffer.from(await new ImageResponse(DeepDiveReelFrame({ data, t: f / REEL_FPS, beats }), { width: REEL_W, height: REEL_H, fonts }).arrayBuffer());
    const still = stills.get(f);
    if (still) writeFileSync(still, png);
    if (!proc.stdin.write(png)) await Promise.race([once(proc.stdin, 'drain'), exited]);
  }
  proc.stdin.end();
  const [code] = await exited;
  if (code !== 0) throw died ?? new Error(`ffmpeg exited with ${code} (${vcodec})`);
  return { path: outPath, seconds, frames, vcodec, stills: [...stills.values()] };
}
