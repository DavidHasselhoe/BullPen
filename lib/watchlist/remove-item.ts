import type { createServerClient } from '@/lib/supabase/client';

type Db = ReturnType<typeof createServerClient>;

/**
 * Take a stock out of one list, or out of every list when no listId is given,
 * and record each removed row in watchlist_removals (migration 178). The
 * watchlist scorecard counts a removed pick up to the day it left, so dropping
 * the losers can't make a list's record look better than it was.
 */
export async function removeWatchlistItems(
  supabase: Db,
  { user_id, symbol, list_id }: { user_id: string; symbol: string; list_id?: string | null },
) {
  let query = supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', user_id)
    .eq('symbol', symbol);
  if (list_id) query = query.eq('list_id', list_id);

  const { data: removed, error } = await query.select('list_id, added_at');
  if (error) return { error };

  if (removed && removed.length > 0) {
    // Non-fatal: the stock is already out of the list, which is what the user asked for.
    const { error: logErr } = await supabase.from('watchlist_removals').insert(
      removed.map((r) => ({ user_id, list_id: r.list_id, symbol, added_at: r.added_at })) as never,
    );
    if (logErr) console.warn('[removeWatchlistItems] failed to record removal of', symbol, logErr);
  }
  return { error: null };
}
