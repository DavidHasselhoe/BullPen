/**
 * Checks the track-record maths against hand-computable cases.
 *
 * Run: npm run verify-picks-math
 *
 * The claim this feature makes in public — "our picks are up X%" — is only
 * worth anything if the number can't be inflated by how it's computed. These
 * assertions pin the properties that guarantee that, especially: adding a new
 * pick must not move the historical line, and must contribute exactly 0% on
 * its own entry day.
 */

import { buildNormalized, buildSeries, type SeriesPick } from '../lib/picks/series-math';

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function close(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) < tol;
}

// A 10-session axis. SPY is deliberately flat at 100 in most cases so the
// benchmark line is trivially checkable.
const axis = [
  '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
  '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16',
];
const flatSpy = axis.map(() => 100);

// ── 1. A single pick reports its own return, and starts at exactly 0% ────────
{
  console.log('\nSingle pick');
  const pick: SeriesPick = {
    entryPrice: 100,
    benchmarkEntryPrice: 100,
    entryIndex: 0,
    closes: [100, 110, 120, 120, 120, 120, 120, 120, 120, 130],
  };
  const s = buildSeries([pick], axis, flatSpy);

  check('starts at 0% on the entry day', close(s[0].picksPct, 0), `got ${s[0].picksPct}`);
  check('reports +10% after a 100→110 move', close(s[1].picksPct, 10), `got ${s[1].picksPct}`);
  check('reports +30% at the end', close(s[9].picksPct, 30), `got ${s[9].picksPct}`);
  check('flat benchmark stays at 0%', s.every((p) => close(p.benchmarkPct, 0)));
  check('liveCount is 1 throughout', s.every((p) => p.liveCount === 1));
}

// ── 2. THE INVARIANT: a new pick doesn't move the historical line ────────────
// This is the cash-in-inflation bug the whole design exists to avoid. Pick B
// enters on day 5; every point before day 5 must be byte-identical to the
// series with pick A alone.
{
  console.log('\nAdding a pick must not rewrite history');
  const a: SeriesPick = {
    entryPrice: 100,
    benchmarkEntryPrice: 100,
    entryIndex: 0,
    closes: [100, 110, 120, 120, 120, 120, 120, 120, 120, 130],
  };
  const b: SeriesPick = {
    entryPrice: 50,
    benchmarkEntryPrice: 100,
    entryIndex: 5,
    closes: [null, null, null, null, null, 50, 55, 60, 60, 65],
  };

  const before = buildSeries([a], axis, flatSpy);
  const after = buildSeries([a, b], axis, flatSpy);

  const historyUnchanged = before
    .slice(0, 5)
    .every((p, i) => close(p.picksPct, after[i].picksPct) && close(p.benchmarkPct, after[i].benchmarkPct));
  check('every point before the new pick is unchanged', historyUnchanged);

  // On B's entry day: A is +20%, B is +0%. Equal dollars → (120 + 100)/200 − 1 = +10%.
  check(
    'the new pick contributes exactly 0% on its entry day',
    close(after[5].picksPct, 10),
    `expected +10%, got ${after[5].picksPct}`,
  );
  check('liveCount rises to 2 on the entry day', after[5].liveCount === 2);

  // Final day: A = 130/100, B = 65/50 = 1.3 → both +30% → portfolio +30%.
  check('final portfolio return is the equal-dollar blend', close(after[9].picksPct, 30), `got ${after[9].picksPct}`);
}

// ── 3. A loser drags the line down; nothing can hide it ──────────────────────
{
  console.log('\nLosers are counted');
  const winner: SeriesPick = {
    entryPrice: 100, benchmarkEntryPrice: 100, entryIndex: 0,
    closes: axis.map(() => 150),
  };
  const loser: SeriesPick = {
    entryPrice: 100, benchmarkEntryPrice: 100, entryIndex: 0,
    closes: axis.map(() => 50),
  };
  const s = buildSeries([winner, loser], axis, flatSpy);
  check('one +50% and one −50% net to 0%', close(s[9].picksPct, 0), `got ${s[9].picksPct}`);
}

// ── 4. The benchmark is bought on the picks' own dates ───────────────────────
// SPY rises 10% over the window. A pick entering at the top must show the
// benchmark's return FROM ITS OWN ENTRY, not from the start of the chart.
{
  console.log('\nBenchmark follows the deployment schedule');
  const risingSpy = [100, 100, 100, 100, 100, 110, 110, 110, 110, 110];
  const early: SeriesPick = {
    entryPrice: 100, benchmarkEntryPrice: 100, entryIndex: 0, closes: axis.map(() => 100),
  };
  const late: SeriesPick = {
    entryPrice: 100, benchmarkEntryPrice: 110, entryIndex: 5,
    closes: [null, null, null, null, null, 100, 100, 100, 100, 100],
  };

  const soloEarly = buildSeries([early], axis, risingSpy);
  check('an early pick sees the full +10% benchmark', close(soloEarly[9].benchmarkPct, 10), `got ${soloEarly[9].benchmarkPct}`);

  const both = buildSeries([early, late], axis, risingSpy);
  // early: 110/100 = +10%; late: 110/110 = 0%. Blended → +5%.
  check(
    'a late pick is benchmarked from its own entry, not the chart start',
    close(both[9].benchmarkPct, 5),
    `expected +5%, got ${both[9].benchmarkPct}`,
  );
}

// ── 5. A closed position holds flat and stays in the record ──────────────────
{
  console.log('\nClosed positions');
  const acquired: SeriesPick = {
    entryPrice: 100, benchmarkEntryPrice: 100, entryIndex: 0,
    closes: [100, 110, 120, 120, 120, 120, 120, 120, 120, 999],
    closePrice: 125,
    closeDate: '2026-01-09',
  };
  const s = buildSeries([acquired], axis, flatSpy);
  check('holds at the close price from the close date on', close(s[9].picksPct, 25), `got ${s[9].picksPct}`);
  check('is still counted as live', s[9].liveCount === 1);
}

// ── 6. Normalized curve reports its shrinking sample ─────────────────────────
{
  console.log('\nDay-0 normalized curve');
  const a: SeriesPick = {
    entryPrice: 100, benchmarkEntryPrice: 100, entryIndex: 0,
    closes: [100, 110, 120, 120, 120, 120, 120, 120, 120, 130],
  };
  const b: SeriesPick = {
    entryPrice: 50, benchmarkEntryPrice: 100, entryIndex: 5,
    closes: [null, null, null, null, null, 50, 55, 60, 60, 65],
  };
  const n = buildNormalized([a, b], axis);

  const day0 = n.find((p) => p.day === 0);
  check('day 0 is 0% for every pick', !!day0 && close(day0.avgPct, 0), `got ${day0?.avgPct}`);
  check('day 0 has both picks in the sample', day0?.n === 2, `got n=${day0?.n}`);

  // Only pick A is old enough to reach day 11 (2026-01-05 → 2026-01-16).
  const tail = n[n.length - 1];
  check('the tail reports a smaller sample', tail.n === 1, `got n=${tail.n}`);
  check('the tail is pick A alone at +30%', close(tail.avgPct, 30), `got ${tail.avgPct}`);
}

// ── 7. Degenerate inputs don't throw ─────────────────────────────────────────
{
  console.log('\nEdge cases');
  check('no picks yields an empty series', buildSeries([], axis, flatSpy).length === 0);
  check('no picks yields an empty normalized curve', buildNormalized([], axis).length === 0);

  // Three days have no price for the only pick (indices 1, 3, 4). Those days
  // must drop out rather than counting the pick at zero, which would show a
  // −100% crater on the chart every time a symbol didn't print a bar.
  const gappy: SeriesPick = {
    entryPrice: 100, benchmarkEntryPrice: 100, entryIndex: 0,
    closes: [100, null, 110, null, null, 120, 120, 120, 120, 120],
  };
  const s = buildSeries([gappy], axis, flatSpy);
  check('days with no price for a pick are dropped, not zeroed', s.length === axis.length - 3, `got ${s.length} points`);
  check('no day reports a fabricated loss', s.every((p) => p.picksPct >= 0));

  // A pick that prices every day, against a benchmark missing one close.
  const solid: SeriesPick = {
    entryPrice: 100, benchmarkEntryPrice: 100, entryIndex: 0,
    closes: axis.map(() => 100),
  };
  const missingSpy = buildSeries([solid], axis, [100, null, 100, 100, 100, 100, 100, 100, 100, 100]);
  check(
    'a missing benchmark close drops that day entirely',
    missingSpy.length === axis.length - 1,
    `got ${missingSpy.length} points`,
  );
}

console.log(
  failures === 0
    ? '\nAll track-record maths checks passed.\n'
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
