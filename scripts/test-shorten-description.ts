/**
 * Assert-based check for TickerPreview's shorten(). No framework.
 *   npx tsx scripts/test-shorten-description.ts
 *
 * The rule it enforces (CLAUDE.md, "Never cut off generated text"): prefer a
 * whole sentence over half of one. At a 230-char cap, two sentences of a real
 * company description are regularly over the limit, so the mid-sentence cut was
 * the common path rather than the rare one.
 */

import assert from 'node:assert/strict';
import { shorten } from '../components/company/TickerPreview';

// A period that ends nothing must not be read as a sentence break.
const abbreviations = 'Generac Holdings Inc. is a U.S.-based energy technology company. It designs generators. It also sells batteries.';
assert.equal(
  shorten(abbreviations),
  'Generac Holdings Inc. is a U.S.-based energy technology company. It designs generators.',
  'splits on real sentence ends, not on Inc. or U.S.'
);

// Short input is returned untouched.
assert.equal(shorten('Acme makes widgets.'), 'Acme makes widgets.');

// Two long sentences: falls back to the first whole one, no ellipsis.
const longFirst = `${'A'.repeat(150)} words here. ${'B'.repeat(150)} more here. Third one.`;
const twoLong = shorten(longFirst);
assert.ok(!twoLong.includes('…'), 'a whole sentence is preferred over a cut one');
assert.ok(twoLong.endsWith('.'), `expected a sentence end, got: ${twoLong.slice(-40)}`);
assert.ok(twoLong.length <= 230, 'and it still respects the cap');

// A single sentence longer than the cap is the only ellipsis case left, and it
// must break on a word boundary rather than mid-word.
const oneHuge = `${'word '.repeat(80)}end.`;
const cut = shorten(oneHuge);
assert.ok(cut.endsWith('…'), 'an unavoidable cut is marked');
assert.ok(!/\w…$/.test(cut.replace(/word…$/, '')), 'cut lands on a word boundary');
assert.ok(cut.length <= 231, `stays within the cap, got ${cut.length}`);

// Never the three-dot form: the codebase uses the single ellipsis character.
assert.ok(!cut.includes('...'), 'uses … not ...');

console.log('ok - shorten() prefers whole sentences and only ellipsizes when it must');
