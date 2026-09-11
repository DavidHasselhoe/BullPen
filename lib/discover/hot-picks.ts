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

  const { data: rows } = await supabase
    .from('companies')
    .select('ticker, name, logo_url')
    .in('ticker', picks.map((p) => p.ticker.toUpperCase()));

  const companies = new Map(
    ((rows ?? []) as Array<{ ticker: string; name: string | null; logo_url: string | null }>)
      .map((r) => [r.ticker.toUpperCase(), r])
  );

  return picks.map((p) => {
    const company = companies.get(p.ticker.toUpperCase());
    return {
      ...p,
      name: company?.name || p.ticker,
      logo_url: company?.logo_url ?? null,
    };
  });
}
