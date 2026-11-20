/**
 * Turns Reel beats (reel.tsx) into MP4s: frames through next/og's
 * ImageResponse, piped as PNGs into ffmpeg as a silent video, then two sound
 * mixes laid over it (reel-audio.ts): `manual` (voice + SFX, for David to post
 * with a song) and `auto` (SFX only, no AI voice, for the fallback).
 * Runs where ffmpeg exists (David's PC for the earnings watcher, a GitHub
 * runner later), never on Vercel.
 *
 * ffmpeg is not a repo dependency: set FFMPEG_PATH, or have `ffmpeg` on PATH.
 * libx264 when the build has it (GitHub runners, winget's Gyan build), else
 * NVIDIA's h264_nvenc; FFMPEG_VCODEC forces one. Windows' h264_mf segfaults
 * after 3 frames in CapCut's bundled ffmpeg.
 *
 * Output follows Meta's Reels spec: H.264 yuv420p, closed GOP, 30 fps,
 * AAC 48 kHz stereo, moov atom first.
 */
import { spawn, execFileSync } from 'child_process';
import { once } from 'events';
import { rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ImageResponse } from 'next/og';
import { loadSlideFonts } from './slides';
import { ReelFrame, narration, timeBeats, deepDiveReelBeats, deepDiveReelLabel, DEEP_DIVE_FOOTER, REEL_W, REEL_H, REEL_FPS, type Beat } from './reel';
import { ffmpegBin, muxReelAudio, synthesizeVoice, type VoiceTrack } from './reel-audio';
import { resultsReelBeats, resultsReelLabel, RESULTS_FOOTER } from './reel-results';
import type { EarningsDeepDiveData, EarningsResultsSlides } from '@/lib/instagram/content/schema';

export interface RenderReelResult {
  /** Voice + SFX: the one David posts. Same as `auto` when there's no voice. */
  manual: string;
  /** SFX only, no AI voice: the fallback auto-publish. */
  auto: string;
  voiced: boolean;
  seconds: number;
  frames: number;
  vcodec: string;
  stills: string[];
}

/** Fetches an image once as a data URL; otherwise Satori fetches it again for every frame. */
export async function inlineImage(url: string | null | undefined): Promise<string | null> {
  if (!url || url.startsWith('data:')) return url ?? null;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return url;
  return `data:${res.headers.get('content-type') ?? 'image/png'};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}

/**
 * outPath is the manual mix; the auto mix goes next to it as `-auto.mp4`.
 * voice: omit to synthesize from the beats' narration (null without an ElevenLabs key); pass null for none.
 * stillsPrefix: also write `${prefix}-cover.png` and one PNG per beat, for review.
 */
export async function renderReel(opts: { beats: Beat[]; label: string; footer: string; outPath: string; stillsPrefix?: string; voice?: VoiceTrack | null }): Promise<RenderReelResult> {
  const { beats, label, footer, outPath, stillsPrefix } = opts;
  const ffmpeg = ffmpegBin();
  let voice = opts.voice !== undefined ? opts.voice : await synthesizeVoice(narration(beats));
  const timeline = timeBeats(beats, voice?.alignment ?? null);
  if (!timeline.beats.some((b) => b.voice)) voice = null; // alignment didn't match the scenes
  const frames = Math.round(timeline.seconds * REEL_FPS);
  const fonts = await loadSlideFonts();

  const encoders = execFileSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const vcodec = process.env.FFMPEG_VCODEC || (/\blibx264\b/.test(encoders) ? 'libx264' : 'h264_nvenc');
  const gop = String(REEL_FPS * 2);
  // Closed GOP, VBR under Meta's 25 Mbps cap.
  const video = vcodec === 'libx264'
    ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-maxrate', '20M', '-bufsize', '40M', '-x264-params', `keyint=${gop}:min-keyint=${gop}:scenecut=0:open-gop=0`]
    : ['-c:v', vcodec, '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-maxrate', '20M', '-bufsize', '40M', '-g', gop, '-bf', '0', '-profile:v', 'high'];

  const silent = join(tmpdir(), `reel-${process.pid}-${Date.now()}.mp4`);
  const proc = spawn(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(REEL_FPS), '-i', '-',
    ...video, '-pix_fmt', 'yuv420p', '-r', String(REEL_FPS), '-an', silent,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const exited = once(proc, 'close');
  // If ffmpeg dies, a pending 'drain' never fires and Node exits silently with code 0. Fail loudly instead.
  let died: Error | null = null;
  proc.on('exit', (code) => { if (code !== 0) died = new Error(`ffmpeg exited with ${code} (${vcodec})`); });

  const stills = new Map<number, string>();
  if (stillsPrefix) {
    stills.set(0, `${stillsPrefix}-cover.png`);
    timeline.beats.forEach((b, i) => stills.set(Math.round((b.start + b.dur - 0.35) * REEL_FPS), `${stillsPrefix}-beat${i + 1}.png`));
  }

  for (let f = 0; f < frames; f++) {
    if (died) throw died;
    const png = Buffer.from(await new ImageResponse(ReelFrame({ timeline, t: f / REEL_FPS, label, footer }), { width: REEL_W, height: REEL_H, fonts }).arrayBuffer());
    const still = stills.get(f);
    if (still) writeFileSync(still, png);
    if (!proc.stdin.write(png)) await Promise.race([once(proc.stdin, 'drain'), exited]);
  }
  proc.stdin.end();
  const [code] = await exited;
  if (code !== 0) throw died ?? new Error(`ffmpeg exited with ${code} (${vcodec})`);

  const auto = outPath.replace(/\.mp4$/, '') + '-auto.mp4';
  try {
    muxReelAudio({ video: silent, out: outPath, timeline, voice });
    muxReelAudio({ video: silent, out: auto, timeline, voice: null });
  } finally {
    rmSync(silent, { force: true });
  }
  return { manual: outPath, auto, voiced: !!voice, seconds: timeline.seconds, frames, vcodec, stills: [...stills.values()] };
}

export async function renderResultsReel(source: EarningsResultsSlides, outPath: string, opts: { stillsPrefix?: string; voice?: VoiceTrack | null } = {}): Promise<RenderReelResult> {
  const companies = await Promise.all(source.companies.map(async (c) => ({ ...c, logoUrl: await inlineImage(c.logoUrl) })));
  const data = { ...source, companies };
  return renderReel({ beats: resultsReelBeats(data), label: resultsReelLabel(data), footer: RESULTS_FOOTER, outPath, ...opts });
}

export async function renderDeepDiveReel(source: EarningsDeepDiveData, outPath: string, opts: { stillsPrefix?: string; voice?: VoiceTrack | null } = {}): Promise<RenderReelResult> {
  const data = { ...source, logoUrl: await inlineImage(source.logoUrl) };
  return renderReel({ beats: deepDiveReelBeats(data), label: deepDiveReelLabel(data), footer: DEEP_DIVE_FOOTER, outPath, ...opts });
}
