/**
 * Ticker overlap report across Investing Ideas theme baskets (lib/discover/theme-config.ts).
 *   npx tsx scripts/theme-overlap-report.ts
 *
 * Report only -- never merges or edits theme-config.ts. Flags a pair for
 * manual review when shared tickers are >50% of the SMALLER basket (not
 * Jaccard/union) -- containment is what actually reads as "these are mostly
 * the same list," and using the smaller basket as the denominator catches a
 * small basket being fully swallowed by a larger one, which a union-based
 * ratio would understate.
 *
 * Run 2026-09-09 against the live 9 baskets: nothing exceeds 50% (max is
 * 17%, one shared ticker in two pairs) -- despite three baskets both reading
 * "AI" in the title, they're deliberately segmented by value-chain layer
 * (infrastructure vs. software vs. mega-cap) with almost no ticker overlap.
 * Kept as a script rather than a one-off check because the next basket added
 * won't get that same manual scrutiny for free.
 */

import { THEME_DISPLAY_ORDER } from '../lib/discover/theme-config';

const FLAG_THRESHOLD_PCT = 50;

interface OverlapResult {
  a: string;
  b: string;
  shared: string[];
  pct: number;
}

function computeOverlaps(): OverlapResult[] {
  const results: OverlapResult[] = [];
  for (let i = 0; i < THEME_DISPLAY_ORDER.length; i++) {
    for (let j = i + 1; j < THEME_DISPLAY_ORDER.length; j++) {
      const a = THEME_DISPLAY_ORDER[i];
      const b = THEME_DISPLAY_ORDER[j];
      const setB = new Set(b.tickers);
      const shared = a.tickers.filter((t) => setB.has(t));
      if (shared.length === 0) continue;
      const smaller = Math.min(a.tickers.length, b.tickers.length);
      results.push({ a: a.slug, b: b.slug, shared, pct: Math.round((shared.length / smaller) * 100) });
    }
  }
  return results.sort((x, y) => y.pct - x.pct);
}

const overlaps = computeOverlaps();
const flagged = overlaps.filter((o) => o.pct > FLAG_THRESHOLD_PCT);

console.log(`Checked ${THEME_DISPLAY_ORDER.length} baskets, ${overlaps.length} pair(s) share at least one ticker.\n`);

for (const o of overlaps) {
  const marker = o.pct > FLAG_THRESHOLD_PCT ? 'FLAGGED' : '   ok  ';
  console.log(`[${marker}] ${o.pct}% -- ${o.a} <-> ${o.b} (shared: ${o.shared.join(', ')})`);
}

if (flagged.length === 0) {
  console.log(`\nNo pair exceeds the ${FLAG_THRESHOLD_PCT}% threshold. Nothing to merge.`);
} else {
  console.log(`\n${flagged.length} pair(s) exceed ${FLAG_THRESHOLD_PCT}% -- review for a manual merge (this script never edits theme-config.ts).`);
}
