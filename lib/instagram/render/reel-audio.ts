/**
 * Sound for Reels: an ElevenLabs voice reading the beats' narration, sound
 * effects on the beats' cues, and a music bed, mixed by ffmpeg.
 *
 * Two mixes per Reel (reel-video.ts):
 *   - manual: voice + SFX, no bed. David posts it by hand and adds a trending
 *     song in the app, which would clash with our bed.
 *   - auto: SFX + bed, NO voice. The 45-min fallback publishes this one: Meta
 *     wants realistic AI voices labelled "Made with AI" and the API can't set
 *     the label.
 *
 * Voice: ELEVENLABS_API_KEY (+ optional ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL).
 * No key, no voice: the manual mix is SFX only and nothing fails. Each
 * narration is cached by its text, so re-rendering a Reel costs nothing.
 *
 * SFX and bed: a file named lib/instagram/render/audio/<name>.(mp3|wav|m4a)
 * wins (tick, pop, hit, bed); otherwise a synthesized stand-in is made
 * once with ffmpeg into the temp folder. ponytail: the synthesized bed is a
 * plain four-chord pad, fine for a fallback; drop a real royalty-free track
 * in as audio/bed.mp3 to replace it.
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Alignment, ReelTimeline, Sfx } from './reel';

export interface VoiceTrack { path: string; alignment: Alignment }

export const ffmpegBin = () => process.env.FFMPEG_PATH || 'ffmpeg';

// ── Voice ───────────────────────────────────────────────────────────────────

/** A stock ElevenLabs voice until David picks one (ELEVENLABS_VOICE_ID). */
const DEFAULT_VOICE = 'nPczCjzI2devNBz1zQrb';
const DEFAULT_MODEL = 'eleven_multilingual_v2';

/** Null when there is no ELEVENLABS_API_KEY. Throws on an API error: a paid call that fails should be seen. */
export async function synthesizeVoice(text: string): Promise<VoiceTrack | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;

  const dir = join(tmpdir(), 'bullpen-reel-voice');
  mkdirSync(dir, { recursive: true });
  const id = createHash('sha256').update(`${voice}|${model}|${text}`).digest('hex').slice(0, 16);
  const mp3 = join(dir, `${id}.mp3`);
  const json = join(dir, `${id}.json`);
  if (existsSync(mp3) && existsSync(json)) return { path: mp3, alignment: JSON.parse(readFileSync(json, 'utf8')) };

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { audio_base64: string; alignment: Alignment | null };
  if (!body.alignment) throw new Error('ElevenLabs returned no alignment');
  writeFileSync(mp3, Buffer.from(body.audio_base64, 'base64'));
  writeFileSync(json, JSON.stringify(body.alignment));
  console.log(`[reel-audio] Voice: ${text.length} characters (${model}, voice ${voice}).`);
  return { path: mp3, alignment: body.alignment };
}

// ── SFX + bed ───────────────────────────────────────────────────────────────

type Asset = Sfx | 'bed';

/** ffmpeg aevalsrc expression of one chord, two slightly detuned sines per note for some width. */
const chord = (fs: number[]) => fs.map((f) => `sin(2*PI*${f}*t)+sin(2*PI*${(f * 1.004).toFixed(2)}*t)`).join('+');

// Am, F, C, G, four seconds each; every note's phase lands back on 0 at the 16 s loop point except the pad, which the chord envelope fades there.
const BED_EXPR = [
  `0.045*(if(lt(mod(t,16),4),${chord([110, 220, 261.63, 329.63])},if(lt(mod(t,16),8),${chord([87.31, 174.61, 220, 261.63])},if(lt(mod(t,16),12),${chord([130.81, 196, 261.63, 329.63])},${chord([98, 196, 246.94, 293.66])}))))`,
  '*(1-exp(-mod(t,4)*5))*(1-exp(-(4-mod(t,4))*5))',
  '+0.35*sin(2*PI*55*t)*exp(-mod(t,0.6667)*9)', // soft kick at 90 bpm
  '+0.05*(2*random(0)-1)*exp(-mod(t+0.3333,0.6667)*70)', // off-beat hat
].join('');

const SYNTH: Record<Asset, string[]> = {
  tick: ['-f', 'lavfi', '-i', 'aevalsrc=0.6*sin(2*PI*2400*t)*exp(-mod(t\\,0.055)*180)*(1-t/1.4):s=48000:d=1.2'],
  pop: ['-f', 'lavfi', '-i', 'aevalsrc=0.8*min(1\\,t*400)*sin(2*PI*(1200*t-2500*t*t))*exp(-t*22):s=48000:d=0.2'],
  hit: ['-f', 'lavfi', '-i', 'aevalsrc=0.9*sin(2*PI*(70*t-12*t*t))*exp(-t*3.2)+0.35*sin(2*PI*140*t)*exp(-t*9)+0.25*(2*random(0)-1)*exp(-t*50):s=48000:d=1.4'],
  bed: ['-f', 'lavfi', '-i', `aevalsrc=${BED_EXPR.replace(/,/g, '\\,')}:s=48000:d=32`, '-af', 'lowpass=f=5000,aecho=0.8:0.6:300:0.2', '-ac', '2', '-c:a', 'aac', '-b:a', '160k'],
};
/** Bump when a SYNTH recipe changes, so cached stand-ins are remade. */
const SYNTH_VERSION = 2;

export function audioAsset(name: Asset): string {
  for (const ext of ['mp3', 'wav', 'm4a']) {
    const own = join(process.cwd(), 'lib/instagram/render/audio', `${name}.${ext}`);
    if (existsSync(own)) return own;
  }
  const dir = join(tmpdir(), `bullpen-reel-audio-v${SYNTH_VERSION}`);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, name === 'bed' ? 'bed.m4a' : `${name}.wav`);
  if (!existsSync(out)) execFileSync(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', ...SYNTH[name], out]);
  return out;
}

// ── Mix ─────────────────────────────────────────────────────────────────────

const SFX_GAIN: Record<Sfx, number> = { tick: 0.3, pop: 0.55, hit: 0.8 };
const BED_GAIN = 0.8;

/**
 * Lays voice, SFX and (optionally) the bed over a silent video and writes the
 * final MP4: video copied, AAC 48 kHz stereo, normalized to -14 LUFS (where
 * Instagram plays audio), moov atom first.
 */
export function muxReelAudio(opts: { video: string; out: string; timeline: ReelTimeline; voice: VoiceTrack | null; bed: boolean }): void {
  const { video, out, timeline, voice, bed } = opts;
  const D = timeline.seconds;
  const fmt = 'aformat=sample_rates=48000:channel_layouts=stereo';
  const ms = (s: number) => Math.max(0, Math.round(s * 1000));
  const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error', '-i', video];
  const chains: string[] = [];
  const mix: string[] = [];
  let input = 1;

  if (bed) {
    args.push('-stream_loop', '-1', '-i', audioAsset('bed'));
    chains.push(`[${input++}:a]${fmt},atrim=0:${D.toFixed(3)},afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, D - 1.5).toFixed(3)}:d=1.5,volume=${BED_GAIN}[bed]`);
    mix.push('[bed]');
  }

  const spoken = voice ? timeline.beats.filter((b) => b.voice) : [];
  if (voice && spoken.length) {
    args.push('-i', voice.path);
    chains.push(`[${input++}:a]${fmt},asplit=${spoken.length}${spoken.map((_, i) => `[vs${i}]`).join('')}`);
    spoken.forEach(({ voice: v }, i) => {
      chains.push(`[vs${i}]atrim=${v!.from.toFixed(3)}:${v!.to.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${ms(v!.at)}:all=1[v${i}]`);
      mix.push(`[v${i}]`);
    });
  }

  timeline.sfx.forEach(([name, at], i) => {
    args.push('-i', audioAsset(name));
    chains.push(`[${input++}:a]${fmt},volume=${SFX_GAIN[name]},adelay=${ms(at)}:all=1[s${i}]`);
    mix.push(`[s${i}]`);
  });

  chains.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=longest,apad=whole_dur=${D.toFixed(3)},atrim=0:${D.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`);
  args.push(
    '-filter_complex', chains.join(';'),
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-t', D.toFixed(3), '-movflags', '+faststart', out,
  );
  execFileSync(ffmpegBin(), args, { stdio: ['ignore', 'inherit', 'inherit'] });
}
