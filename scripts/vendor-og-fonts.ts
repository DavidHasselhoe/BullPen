/**
 * Downloads the font files the next/og routes render with into public/fonts/,
 * so nothing fetches them from Google at request time.
 *   npx tsx scripts/vendor-og-fonts.ts
 *
 * Run this once per font added to lib/render/og-fonts.ts, then commit the
 * .ttf it writes. Google's CSS2 API serves TTF to a client that sends no
 * User-Agent, which is what Satori wants: it reads TTF/OTF/WOFF and cannot
 * read WOFF2, so the .woff2 files next/font already self-hosts for the
 * browser are no use here.
 *
 * Both families are SIL OFL 1.1 (see public/fonts/LICENSE-*.txt), which
 * permits redistribution with the license alongside.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'fonts');

/** family, axis spec, output filename — one row per font the renderers ask for. */
const FONTS: Array<[string, string, string]> = [
  ['Geist',            'wght@400',      'Geist-400.ttf'],
  ['Geist',            'wght@700',      'Geist-700.ttf'],
  ['Geist Mono',       'wght@500',      'GeistMono-500.ttf'],
  ['Geist Mono',       'wght@600',      'GeistMono-600.ttf'],
  ['Instrument Serif', 'ital,wght@1,400', 'InstrumentSerif-400-italic.ttf'],
];

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const [family, axis, file] of FONTS) {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axis}`;
    const css = await (await fetch(cssUrl)).text();
    const match = css.match(/src: url\((https:\/\/[^)]+)\)/);
    if (!match) throw new Error(`no src url() in CSS for ${family} ${axis}`);
    const bytes = Buffer.from(await (await fetch(match[1])).arrayBuffer());
    if (!bytes.length) throw new Error(`empty font body for ${family} ${axis}`);
    await writeFile(join(OUT, file), bytes);
    console.log(`${file}  ${(bytes.length / 1024).toFixed(0)} KB  ${match[1].split('/').pop()}`);
  }
}

main();
