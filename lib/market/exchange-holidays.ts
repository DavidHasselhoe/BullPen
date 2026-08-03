/**
 * Full-closure exchange holidays for a date range — the same `exchange_holidays`
 * table and `type === 'closed'` semantics `calculateMarketStatus` (see
 * `market-status.ts`) uses for the live Market Hours widget, queried
 * historically instead of "upcoming only" so callers like the performance
 * calendar can label a past blank day with the same fact the market-hours
 * tool would give for today.
 */

import { createServerClient } from '@/lib/supabase/client';

export interface MarketHoliday {
  /** YYYY-MM-DD */
  date: string;
  /** e.g. "Independence Day (observed)" */
  label: string;
}

interface HolidayRow {
  date: string;
  description: string | null;
  exchange_code: string;
}

/**
 * Closed-market holidays across any of `exchangeCodes` within [from, to],
 * deduped by date. Early closes are excluded — that day still prices, just
 * for fewer hours, so it's not the "day is entirely missing" case this backs.
 */
export async function getClosedHolidays(
  exchangeCodes: string[],
  from: string,
  to: string
): Promise<MarketHoliday[]> {
  if (exchangeCodes.length === 0) return [];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('exchange_holidays')
    .select('date, description, exchange_code')
    .in('exchange_code', exchangeCodes)
    .eq('type', 'closed')
    .gte('date', from)
    .lte('date', to);

  if (error || !data) return [];

  const byDate = new Map<string, string>();
  for (const row of data as HolidayRow[]) {
    if (!byDate.has(row.date)) byDate.set(row.date, row.description ?? 'Market closed');
  }

  return [...byDate.entries()].map(([date, label]) => ({ date, label }));
}
