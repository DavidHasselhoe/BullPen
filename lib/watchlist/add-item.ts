import type { createServerClient } from '@/lib/supabase/client';

type Db = ReturnType<typeof createServerClient>;

/**
 * Put a stock in one of the user's lists. A stock can be in several lists
 * (unique on user + list + symbol since migration 165), so adding never moves
 * it out of another list, and adding it to a list it is already in is a no-op
 * that returns the existing row.
 *
 * `restore` is Undo after a remove: the row comes back with the added_at it
 * had, taken from its watchlist_removals record, which is then dropped. A
 * fresh add would restart the "since you added it" clock.
 *
 * Plain insert + duplicate check rather than an upsert: ON CONFLICT has to
 * name the exact unique key, and this works whichever key the table has.
 */
export async function addWatchlistItem(
  supabase: Db,
  row: { user_id: string; list_id: string; symbol: string; company_name: string },
  { restore = false }: { restore?: boolean } = {},
) {
  const { data: removal } = restore
    ? await supabase
        .from('watchlist_removals')
        .select('id, added_at')
        .eq('user_id', row.user_id)
        .eq('list_id', row.list_id)
        .eq('symbol', row.symbol)
        .order('removed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const inserted = await supabase
    .from('user_watchlist')
    .insert((removal ? { ...row, added_at: removal.added_at } : row) as never)
    .select()
    .single();
  if (removal && !inserted.error) await supabase.from('watchlist_removals').delete().eq('id', removal.id);
  if (inserted.error?.code !== '23505') return inserted;
  return supabase
    .from('user_watchlist')
    .select()
    .eq('user_id', row.user_id)
    .eq('list_id', row.list_id)
    .eq('symbol', row.symbol)
    .maybeSingle();
}
