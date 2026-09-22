/**
 * Assert-based check that the next/og renderers read their fonts from disk and
 * never call Google. No framework.
 *   npx tsx scripts/test-og-fonts.ts
 *
 * The point of the change this guards: a browser visiting BullPen has never
 * fetched from Google (next/font self-hosts at build time), but rendering a
 * share card used to fetch the font bytes from fonts.googleapis.com on every
 * cold start. Nothing should reach Google now, so global fetch is replaced with
 * one that throws, and every font the renderers ask for is loaded through it.
 */

import assert from 'node:assert/strict';
import { loadOgFont } from '../lib/render/og-fonts';

// Every family/weight/style combination the render entry points request:
// app/opengraph-image.tsx, app/api/og/share/[id]/route.tsx and
// lib/instagram/render/slides.tsx (loadSlideFonts).
const REQUESTED: Array<[string, number, boolean]> = [
  ['Geist', 400, false],
  ['Geist', 700, false],
  ['Geist Mono', 500, false],
  ['Geist Mono', 600, false],
  ['Instrument Serif', 400, true],
];

/** TTF and OTF magic numbers. Satori reads these; it cannot read WOFF2. */
function isUsableFont(bytes: Buffer): boolean {
  const tag = bytes.subarray(0, 4).toString('latin1');
  return tag === '\u0000\u0001\u0000\u0000' || tag === 'true' || tag === 'OTTO';
}

async function main() {
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (...args: Parameters<typeof realFetch>) => {
    fetchCalls++;
    throw new Error(`font loading must not hit the network, but something fetched ${String(args[0])}`);
  };

  try {
    for (const [family, weight, italic] of REQUESTED) {
      const bytes = await loadOgFont(family, weight, italic);
      const label = `${family} ${weight}${italic ? ' italic' : ''}`;
      assert.ok(bytes.length > 1000, `${label}: got ${bytes.length} bytes, expected a real font file`);
      assert.ok(isUsableFont(bytes), `${label}: not a TTF/OTF, and Satori cannot read WOFF2`);
    }

    assert.equal(fetchCalls, 0, 'no font request may leave the machine');

    // A weight nobody vendored must fail loudly rather than silently
    // substituting another one and shipping a card in the wrong typeface.
    await assert.rejects(
      () => loadOgFont('Geist', 999),
      /No vendored font/,
      'an unvendored weight must throw'
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log(`ok - ${REQUESTED.length} fonts loaded from public/fonts, zero network calls`);
}

main();
