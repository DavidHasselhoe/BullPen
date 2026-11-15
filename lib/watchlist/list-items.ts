import { createServerClient } from '@/lib/supabase/client';
import { getLogoUrlsForTickers } from '@/lib/logos/logos-db';
import { getDisplayNames } from '@/lib/market-data/display-names';

/**
 * One account's watchlist rows (every list), newest first, with logo and
 * display name. GET /api/watchlist and Home's server prefetch both return
 * this, so the client's ['watchlist'] cache entry is the same either way.
 * Throws on a failed read.
 */
export async function listWatchlistItems(userId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('user_watchlist')
    .select('id, symbol, company_name, alerts_enabled, added_at, list_id')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as { id: string; symbol: string; company_name: string | null; alerts_enabled: boolean; added_at: string; list_id: string | null }[];
  const symbols = rows.map((r) => r.symbol);
  const [logoUrls, displayNames] = await Promise.all([getLogoUrlsForTickers(symbols), getDisplayNames(symbols)]);
  return rows.map((row) => ({
    ...row,
    logo_url: logoUrls.get(row.symbol) ?? null,
    display_name: displayNames.get(row.symbol.toUpperCase()) ?? null,
  }));
}
