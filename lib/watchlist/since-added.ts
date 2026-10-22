import { createServerClient } from '@/lib/supabase/client';
import { getMonthCloses, monthClosesKey } from '@/lib/market-data/month-closes';
import { monthKeyOf, todayET } from '@/lib/dates/calendar-format';
import { closeOnOrBefore, etDate, type SinceAddedEntry } from '@/lib/watchlist/scorecard';

/** The S&P 500 stand-in. SPY's split-adjusted closes track the index. */
export const BENCHMARK = 'SPY';

/**
 * The anchors for one list's scorecard: each pick's close on the day it was
 * added, and SPY's on the same day. Removed picks (watchlist_removals) come
 * with their exit closes too, so dropping a loser doesn't flatter the list.
 * Shared by the owner's /since-added route and the public shared-list page,
 * so both show the same record.
 *
 * Only the add date is stored, never a price: closes are split-adjusted, so a
 * stored price would be wrong after the next split. Reads the shared
 * dailycloses cache, about 1 credit per cold (symbol, month).
 *
 * The caller has already checked who may read the list. Throws
 * TwelveDataRateLimitError.
 */
export async function getSinceAddedEntries(userId: string, listId: string): Promise<SinceAddedEntry[]> {
  const supabase = createServerClient();
  const [{ data: rows }, { data: removals }] = await Promise.all([
    supabase.from('user_watchlist').select('symbol, added_at').eq('user_id', userId).eq('list_id', listId),
    supabase
      .from('watchlist_removals')
      .select('symbol, added_at, removed_at')
      .eq('user_id', userId)
      .eq('list_id', listId)
      .order('removed_at', { ascending: false })
      .limit(500),
  ]);

  const today = todayET();
  const picks = [
    ...(rows ?? []).map((r) => ({ symbol: r.symbol as string, addedAt: r.added_at as string, removedAt: undefined as string | undefined })),
    ...(removals ?? []).map((r) => ({ symbol: r.symbol as string, addedAt: r.added_at as string, removedAt: r.removed_at as string })),
  ];

  // Every (symbol, month) a start or exit close falls in, for the pick and for SPY.
  const pairs: { symbol: string; month: string }[] = [];
  for (const p of picks) {
    // Added today: no close to measure from yet.
    if (etDate(p.addedAt) >= today) continue;
    for (const date of [etDate(p.addedAt), p.removedAt && etDate(p.removedAt)]) {
      if (date) pairs.push({ symbol: p.symbol, month: monthKeyOf(date) }, { symbol: BENCHMARK, month: monthKeyOf(date) });
    }
  }

  const { closes } = await getMonthCloses(pairs);
  const closeAt = (symbol: string, date: string) =>
    closeOnOrBefore(closes.get(monthClosesKey(symbol, monthKeyOf(date))), date);

  return picks.map((p) => {
    const start = etDate(p.addedAt);
    const isNew = start >= today;
    const entry: SinceAddedEntry = {
      symbol: p.symbol,
      addedAt: p.addedAt,
      startClose: isNew ? null : closeAt(p.symbol, start),
      benchStart: isNew ? null : closeAt(BENCHMARK, start),
    };
    if (p.removedAt) {
      // Left today: the in-progress daily bar stands in for today's close.
      const end = etDate(p.removedAt);
      entry.removedAt = p.removedAt;
      entry.endClose = isNew ? null : closeAt(p.symbol, end);
      entry.benchEnd = isNew ? null : closeAt(BENCHMARK, end);
    }
    return entry;
  });
}
