/**
 * Hot Picks: the most-visited stock pages, with their names and logos.
 *
 * Shared by /api/search/metrics and by the dashboard's server render. Returning
 * the fully-resolved shape from one place is what let the card stop making a
 * second request for names after the first one came back.
 */

import { createServerClient } from '@/lib/supabase/client';

export interface HotPick {
  ticker: string;
  click_count: number;
  last_clicked_at: string;
  name: string;
  logo_url: string | null;
}

export async function getHotPicks(hours: number, limit: number): Promise<HotPick[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_hot_picks', {
    time_period_hours: hours,
    limit_count: limit,
  });
  if (error) return [];

  const picks = (data ?? []) as Array<{ ticker: string; click_count: number; last_clicked_at: string }>;
  if (picks.length === 0) return [];

  const tickers = picks.map((p) => p.ticker.toUpperCase());
  // `companies` only holds the few dozen tickers someone has enriched, so most
  // picks (MU, GE, HON...) had no name and showed the ticker twice. The search
  // catalogue covers every listed US stock and ETF.
  const [{ data: rows }, { data: indexRows }] = await Promise.all([
    supabase.from('companies').select('ticker, name, logo_url').in('ticker', tickers),
    supabase.from('search_index').select('ticker, name').in('ticker', tickers),
  ]);

  const companies = new Map(
    ((rows ?? []) as Array<{ ticker: string; name: string | null; logo_url: string | null }>)
      .map((r) => [r.ticker.toUpperCase(), r])
  );
  const indexNames = new Map(
    ((indexRows ?? []) as Array<{ ticker: string; name: string }>).map((r) => [r.ticker.toUpperCase(), r.name])
  );

  return picks.map((p) => {
    const key = p.ticker.toUpperCase();
    const company = companies.get(key);
    return {
      ...p,
      name: company?.name || indexNames.get(key) || p.ticker,
      logo_url: company?.logo_url ?? null,
    };
  });
}
