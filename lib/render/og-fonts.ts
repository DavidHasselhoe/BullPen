/**
 * Font-byte loader for next/og (`ImageResponse`) routes, reading the files
 * vendored in public/fonts/.
 *
 * Satori can't read next/font's build-time output or the app's CSS variables,
 * so a rendered image needs the raw font bytes. This used to fetch them from
 * Google's CSS2 API on every cold start, which put a request to Google on the
 * serving path. The files are in the repo now (scripts/vendor-og-fonts.ts
 * downloads them, both families are SIL OFL 1.1), so rendering a card talks to
 * nobody.
 *
 * In public/ rather than a private assets/ directory on purpose: the filename
 * is looked up at runtime, so Next's file tracing cannot see it statically and
 * would leave it out of the serverless bundle. public/ is deployed whole. This
 * is the same process.cwd() read the Instagram renderer already does for its
 * brand images (lib/instagram/render/slides.tsx), which is the proof it
 * survives a real deployment.
 *
 * Satori reads TTF/OTF/WOFF and not WOFF2, which is why these are .ttf rather
 * than the .woff2 files next/font self-hosts for the browser.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Every font the renderers can ask for. Add a row, then run the vendor script. */
const FILES: Record<string, string> = {
  'Geist:400:normal':            'Geist-400.ttf',
  'Geist:700:normal':            'Geist-700.ttf',
  'Geist Mono:500:normal':       'GeistMono-500.ttf',
  'Geist Mono:600:normal':       'GeistMono-600.ttf',
  'Instrument Serif:400:italic': 'InstrumentSerif-400-italic.ttf',
};

/** Read once per cold start, reused across warm invocations. */
const cache = new Map<string, Buffer>();

export async function loadOgFont(family: string, weight: number, italic = false): Promise<Buffer> {
  const key = `${family}:${weight}:${italic ? 'italic' : 'normal'}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const file = FILES[key];
  // Loud on purpose: a missing weight silently falling back to another one
  // ships a card in the wrong typeface, which is harder to notice than a 500.
  if (!file) throw new Error(`No vendored font for ${key} — add it to scripts/vendor-og-fonts.ts and rerun it`);

  const data = await readFile(join(process.cwd(), 'public', 'fonts', file));
  cache.set(key, data);
  return data;
}
