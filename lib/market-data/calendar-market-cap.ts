import { createServerClient } from '@/lib/supabase/client';

interface MarketCapRow {
  ticker: string;
  market_cap: number | null;
}

/**
 * Attaches each item's market cap from screener_stats in one batched query.
 * A ticker screener_stats has never seen (e.g. a pre-IPO company) resolves to
 * `market_cap: null` rather than failing the whole batch. Items with a falsy
 * `symbol` (some pre-ticker IPO entries have an empty string — the pre-redesign
 * IPOTab already guarded against this with `ipo.symbol ? ... : '—'`) also
 * resolve to `null` instead of throwing.
 */
export async function attachMarketCap<T extends { symbol: string }>(
  items: T[]
): Promise<(T & { market_cap: number | null })[]> {
  if (items.length === 0) return [];

  const symbols = [...new Set(items.filter((item) => item.symbol).map((item) => item.symbol.toUpperCase()))];
  const supabase = createServerClient();
  const { data } = await supabase
    .from('screener_stats')
    .select('ticker, market_cap')
    .in('ticker', symbols);

  const capByTicker = new Map(
    ((data ?? []) as MarketCapRow[]).map((row) => [row.ticker, row.market_cap])
  );

  return items.map((item) => ({
    ...item,
    market_cap: item.symbol ? (capByTicker.get(item.symbol.toUpperCase()) ?? null) : null,
  }));
}
