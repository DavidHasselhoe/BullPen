import { chunk } from '@/lib/utils';

/**
 * PostgREST caps an unbounded `select()` at 1000 rows and says nothing about
 * it. Three screener queries were silently truncating because of that: the
 * "All" view returned 997 of 3053 rows, the default active view 1000 of 1219,
 * and the `countOnly` query behind the "View all (N)" pill read 999. The first
 * two reached the Pro CSV/PDF export, so a paid file was quietly missing two
 * thirds of the universe, which is the worst way for a paid feature to fail.
 *
 * Any read whose row count grows with users or data goes through here.
 * `build` returns a fresh query each call. Callers must supply a stable sort
 * (`.order(...)` on a unique column, or a tiebreaker) so rows don't shift
 * between pages.
 */
const PAGE = 1000;

export async function fetchAllPages<T>(
  build: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }> & {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  }
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) return { rows, error: null };
  }
}

/**
 * `.in(column, values)` goes into the GET URL, so a list of a few hundred
 * UUIDs (~37 bytes each) outgrows the proxy's URL limit and the whole read
 * fails. This runs `build` once per slice of `values` and concatenates the
 * rows. Keep each slice's result under 1000 rows (one row per value, as in a
 * users-by-id read); a read with many rows per value belongs in fetchAllPages.
 */
const IN_SLICE = 150;

export async function selectInChunks<T, V>(
  values: readonly V[],
  build: (slice: V[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ rows: T[]; error: string | null }> {
  const results = await Promise.all(chunk(values, IN_SLICE).map((slice) => build(slice)));
  const failed = results.find((r) => r.error);
  if (failed?.error) return { rows: [], error: failed.error.message };
  return { rows: results.flatMap((r) => r.data ?? []), error: null };
}
