/**
 * The hover card's description trimmer, against real TwelveData profile text.
 * Every case here is a period that does NOT end a sentence — the first version
 * of this split on all of them and rendered "Generac Holdings Inc. -based
 * energy technology company", a sentence the filing never contained.
 *
 * Run: npx tsx scripts/test-ticker-preview-shorten.ts
 */
import assert from 'node:assert/strict';
import { shorten } from '../components/company/TickerPreview';

// Real GNRC description, first three sentences.
const gnrc =
  'Generac Holdings Inc. is a U.S.-based energy technology company that designs, manufactures, and distributes power generation equipment. ' +
  'Its portfolio includes residential standby generators, portable generators, and transfer switches. ' +
  'The company serves homeowners, businesses, utilities, and data centers.';

const out = shorten(gnrc);
assert.ok(out.startsWith('Generac Holdings Inc. is a U.S.-based'), `mangled abbreviations: ${out}`);
assert.ok(!out.includes('The company serves'), 'should stop after two sentences');

// Short enough to survive whole, and no trailing ellipsis when nothing was cut.
const short = 'Apple Inc. designs and sells consumer electronics.';
assert.equal(shorten(short), short);

// One long sentence with no second terminator still gets capped, on a word
// boundary, with an ellipsis.
const long = `${'word '.repeat(80)}end.`;
const capped = shorten(long);
assert.ok(capped.endsWith('...'), 'long single sentence should be elided');
assert.ok(capped.length <= 233, `too long: ${capped.length}`);
assert.ok(!capped.includes('  '), 'should cut on a word boundary');

// Lowercase after the period is mid-sentence, not a new one.
const lower = 'Acme Corp. operates in retail. It also runs logistics. A third sentence here.';
assert.ok(shorten(lower).startsWith('Acme Corp. operates in retail.'), 'abbreviation split');
assert.ok(!shorten(lower).includes('A third sentence'), 'should stop after two sentences');

console.log('ticker preview description trimming OK');
