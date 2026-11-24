/**
 * Find a hole in a member's stored trades by probing the vendor's list one
 * row at a time. The list is newest first, so it reads: rows we store, then
 * the hole, then stored rows again (an earlier batch), or the end of history.
 * Pure over an async `probe`, so scripts/test-congress-ingest.ts can pin it
 * without a network; scripts/backfill-congress-gap.ts supplies the real probe.
 *
 * A probe answers for the row at `offset`: true when we store it, false when
 * we don't, null when the vendor has no row there (past the end of history).
 */

export type GapProbe = (offset: number) => Promise<boolean | null>;

export interface Gap {
  /** First missing row. */
  start: number;
  /** First row after the hole (stored again, or past the end). The hole is [start, end). */
  end: number;
  /** True when the hole runs to the end of the vendor's history. */
  toHistoryEnd: boolean;
}

/**
 * `start` skips the search for the hole's beginning (a dry run already found
 * it); it is still checked, never trusted. `upperBound` is where to stop
 * looking for the beginning: no hole can start past the rows we store.
 * `step` must be shorter than the hole and than the stored run after it, or a
 * jump could step over one; 200 is well under a 500-row batch. A hole shorter
 * than a step can be missed, which costs nothing but a missed fill.
 */
export async function findGap(
  rawProbe: GapProbe,
  opts: { start?: number; upperBound: number; step?: number },
): Promise<Gap | null> {
  const step = opts.step ?? 200;
  // Every probe is a billed vendor call: never ask about the same row twice.
  const answers = new Map<number, boolean | null>();
  const probe: GapProbe = async (o) => {
    if (!answers.has(o)) answers.set(o, await rawProbe(o));
    return answers.get(o)!;
  };

  let start: number;
  if (opts.start != null) {
    if (opts.start > 0 && (await probe(opts.start - 1)) !== true) throw new Error(`row ${opts.start - 1} is not stored: the list moved, size the gap again`);
    if ((await probe(opts.start)) !== false) throw new Error(`row ${opts.start} is not missing: the list moved, size the gap again`);
    start = opts.start;
  } else {
    // First row that is not stored. Walked down in steps, then bisected:
    // probing straight at the bound could land past the hole on the earlier
    // batch and read as "no hole".
    if ((await probe(0)) !== true) return null; // nothing stored at the top: a fresh filing, the refresh's job
    let lo = 0; // stored
    let hi = step;
    for (;;) {
      if (lo >= opts.upperBound) return null; // stored all the way to the bound: no hole above it
      if ((await probe(hi)) !== true) break;
      lo = hi;
      hi += step;
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if ((await probe(mid)) === true) lo = mid;
      else hi = mid;
    }
    start = hi;
    if ((await probe(start)) === null) return null; // the "hole" is just the end of history
  }

  // Walk down in steps until a row is stored again or history ends...
  let lo = start; // missing
  let hi = start + step;
  for (;;) {
    const r = await probe(hi);
    if (r !== false) break;
    lo = hi;
    hi += step;
  }
  // ...then the first row in (lo, hi] that is not missing.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await probe(mid)) === false) lo = mid;
    else hi = mid;
  }
  return { start, end: hi, toHistoryEnd: (await probe(hi)) === null };
}
