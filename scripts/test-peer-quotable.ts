/**
 * Assert-based check for filterQuotable, the guard that stops a peer pill
 * linking to a page that does not exist. Hits TwelveData live.
 *   npx tsx scripts/test-peer-quotable.ts
 *
 * Pinned against the case that found this 2026-09-22: Micron's peer list came
 * back with SKWS, a symbol that has never existed (Skyworks is SWKS), and the
 * pill rendered anyway because nothing checked. Real names either side of it
 * must survive, including an OTC-listed ADR.
 */

import assert from 'node:assert/strict';
import { filterQuotable } from '../lib/twelvedata/twelvedata-client';

const real = ['SWKS', 'WDC', 'STX', 'SIEGY'];
const fake = ['SKWS', 'SAMSUNG', 'PXD'];

async function main() {
  const kept = await filterQuotable([...real, ...fake]);

  for (const sym of real) {
    assert.ok(kept.includes(sym), `${sym} is listed and must survive`);
  }
  for (const sym of fake) {
    assert.ok(!kept.includes(sym), `${sym} has no quote and must be dropped`);
  }

  assert.deepEqual(await filterQuotable([]), [], 'empty input must not cost a call');

  console.log(`ok - kept ${kept.join(', ')}, dropped ${fake.join(', ')}`);
}

main();
