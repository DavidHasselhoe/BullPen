/**
 * The latest published pick as /api/picks/current returns it. Shared with
 * the Discover page, which prefetches it on the server so the hero is in the
 * first HTML instead of waiting on hydration and a ~650ms request.
 *
 * The ticker, headline, one-liner, entry price, and live return are always
 * free; the thesis and risks are gated by resolveThesisAccess() (Pro, or a
 * free account's one thesis a month) and stripped by `toDetail`, never sent
 * to a caller who isn't unlocked. Reading never redeems the free thesis.
 */

import { resolveThesisAccess } from '@/lib/picks/thesis-access';
import { getLatestPickRow, toDetail } from '@/lib/picks/picks-db';
import { livePerformanceFor } from '@/lib/picks/performance';

export async function getCurrentPick(session: { userId: string } | null) {
  const row = await getLatestPickRow();
  if (!row) return { success: true as const, pick: null };

  const [access, perf] = await Promise.all([
    resolveThesisAccess(session, row.pick_date, row.model),
    livePerformanceFor(row),
  ]);
  return { success: true as const, pick: toDetail(row, perf, access) };
}
