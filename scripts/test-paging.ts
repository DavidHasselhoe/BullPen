/**
 * Self-check for lib/supabase/paging.ts against fake query builders (no DB).
 *   npm run test-paging
 */
import assert from 'node:assert/strict';
import { fetchAllPages, selectInChunks } from '../lib/supabase/paging';

type Res<T> = { data: T[] | null; error: { message: string } | null };

// A table of `n` rows that serves .range() like PostgREST, capped at 1000.
function fakeTable(n: number, failAtFrom?: number) {
  const calls: Array<[number, number]> = [];
  const build = () => ({
    then: undefined as never,
    range: async (from: number, to: number): Promise<Res<number>> => {
      calls.push([from, to]);
      if (from === failAtFrom) return { data: null, error: { message: 'boom' } };
      const end = Math.min(n, to + 1, from + 1000);
      return { data: Array.from({ length: Math.max(0, end - from) }, (_, i) => from + i), error: null };
    },
  });
  return { build, calls };
}

async function main() {
  // Spans three pages, and a table of exactly 1000 needs a second (empty) read to know it ended.
  const big = fakeTable(2500);
  const r1 = await fetchAllPages<number>(big.build as never);
  assert.equal(r1.error, null);
  assert.equal(r1.rows.length, 2500);
  assert.deepEqual(big.calls, [[0, 999], [1000, 1999], [2000, 2999]]);

  const exact = fakeTable(1000);
  assert.equal((await fetchAllPages<number>(exact.build as never)).rows.length, 1000);
  assert.equal(exact.calls.length, 2);

  // A failing page returns what was read so far plus the error.
  const failing = fakeTable(2500, 1000);
  const r2 = await fetchAllPages<number>(failing.build as never);
  assert.equal(r2.error, 'boom');
  assert.equal(r2.rows.length, 1000);

  // 400 ids -> slices of 150, 150, 100, rows concatenated in order.
  const ids = Array.from({ length: 400 }, (_, i) => i);
  const sizes: number[] = [];
  const r3 = await selectInChunks<number, number>(ids, async (slice) => {
    sizes.push(slice.length);
    return { data: slice.map((x) => x * 2), error: null };
  });
  assert.deepEqual(sizes, [150, 150, 100]);
  assert.equal(r3.error, null);
  assert.deepEqual(r3.rows, ids.map((x) => x * 2));

  // Any failed slice fails the whole read: a partial user list must not look complete.
  const r4 = await selectInChunks<number, number>(ids, async (slice) =>
    slice[0] === 150 ? { data: null, error: { message: 'slice failed' } } : { data: slice, error: null });
  assert.equal(r4.error, 'slice failed');
  assert.deepEqual(r4.rows, []);

  assert.deepEqual((await selectInChunks<number, number>([], async () => ({ data: [1], error: null }))).rows, []);

  console.log('test-paging: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
