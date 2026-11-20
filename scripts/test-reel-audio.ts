/**
 * Self-check for Reel sound (no API calls, no DB): beat timing from a fake
 * ElevenLabs alignment, then both ffmpeg mixes over a dummy video, checked
 * with ffprobe. Needs ffmpeg (FFMPEG_PATH or PATH).
 *
 * npx tsx scripts/test-reel-audio.ts
 */
import assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { narration, timeBeats, type Alignment, type Beat } from '../lib/instagram/render/reel';
import { ffmpegBin, muxReelAudio } from '../lib/instagram/render/reel-audio';

const beat = (say: string, minDur: number): Beat => ({ minDur, say, cueAt: 1, sfx: (cue) => [['pop', cue]], render: () => null });
const beats = [beat('NVIDIA beat on everything.', 2.4), beat('Revenue: $115.8 billion. ^A beat.', 3.4), beat('^Follow for more.', 3)];

// Fake voice: 70 ms a character, 0.4 s pause after each sentence.
const text = narration(beats);
assert.ok(text.startsWith('Nvidia beat'), 'all-caps names are made speakable');
const al: Alignment = { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
let clock = 0;
for (const ch of text) {
  al.characters.push(ch);
  al.character_start_times_seconds.push(clock);
  clock += 0.07;
  al.character_end_times_seconds.push(clock);
  if (ch === '.') clock += 0.4;
}
const startOf = (needle: string) => al.character_start_times_seconds[text.indexOf(needle)];

const tl = timeBeats(beats, al);
const [hook, rev, end] = tl.beats;
assert.equal(hook.voice!.from, 0);
assert.equal(rev.voice!.from, startOf('Revenue'));
assert.equal(rev.voice!.to, startOf('Follow'));
assert.ok(Math.abs(rev.voice!.at - (rev.start + 0.25)) < 1e-9, 'each beat speaks just after it starts');
assert.ok(Math.abs(rev.cue - (0.25 + startOf('A beat') - startOf('Revenue'))) < 1e-9, 'the cue lands on its word');
assert.ok(rev.dur >= 0.25 + (rev.voice!.to - rev.voice!.from), 'a beat lasts as long as its sentence');
assert.ok(end.dur >= 3, 'minimum length holds');
assert.ok(tl.sfx.some(([n, at]) => n === 'pop' && Math.abs(at - (rev.start + rev.cue)) < 1e-9), 'pop on the cue');

const plain = timeBeats(beats, null);
assert.deepEqual(plain.beats.map((b) => b.dur), [2.4, 3.4, 3]);
assert.ok(plain.beats.every((b) => b.voice === null && b.cue === 1));

const wrong = timeBeats(beats, { ...al, characters: [...'something else entirely'] });
assert.ok(wrong.beats.every((b) => b.voice === null), 'a mismatched alignment is ignored, not trusted');

// Both mixes over a dummy video.
const dir = mkdtempSync(join(tmpdir(), 'reel-audio-test-'));
try {
  const ff = ffmpegBin();
  const video = join(dir, 'v.mp4');
  const voice = join(dir, 'voice.mp3');
  execFileSync(ff, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:r=30:d=${tl.seconds.toFixed(2)}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  execFileSync(ff, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=f=220:d=${clock.toFixed(2)}`, voice]);
  for (const [name, withVoice] of [['manual', true], ['auto', false]] as const) {
    const out = join(dir, `${name}.mp4`);
    muxReelAudio({ video, out, timeline: tl, voice: withVoice ? { path: voice, alignment: al } : null });
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', out], { encoding: 'utf8' }));
    const a = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
    assert.equal(a.codec_name, 'aac');
    assert.equal(a.sample_rate, '48000');
    assert.equal(a.channels, 2);
    assert.ok(Math.abs(Number(probe.format.duration) - tl.seconds) < 0.1, `${name}: duration ${probe.format.duration} vs ${tl.seconds}`);
    console.log(`${name}: ${Number(probe.format.duration).toFixed(2)}s, aac 48k stereo`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('test-reel-audio: all checks pass');
