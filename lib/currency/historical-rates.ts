import { createServerClient } from '@/lib/supabase/client';

/**
 * USD-base historical exchange rates for one date, cache-first against
 * `currency_exchange_rates`, falling back to Frankfurter (ECB data). Used
 * server-side directly by both `GET /api/currency/rates/historical` (the
 * client-facing route) and the import replay path — the replay must never
 * have the server fetch its own HTTP route for this.
 *
 * Frankfurter silently substitutes the nearest prior business day for a
 * weekend/holiday request and echoes the substituted date back in its
 * response. Caching under ONLY the requested date means every future
 * request for that same weekend date re-fetches forever (it'll never find
 * a cache row keyed to the day that was actually asked for) — so a cache
 * write happens under BOTH the requested date and the date Frankfurter
 * actually returned.
 */
export async function getHistoricalRates(date: string): Promise<Record<string, number> | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (date > new Date().toISOString().slice(0, 10)) return null;

  const supabase = createServerClient();

  const { data: cached } = await supabase
    .from('currency_exchange_rates')
    .select('target_currency, rate')
    .eq('base_currency', 'USD')
    .eq('date', date);

  if (cached && cached.length > 0) {
    const rates: Record<string, number> = {};
    for (const row of cached) rates[row.target_currency] = Number(row.rate);
    return rates;
  }

  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${date}?base=USD`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const data: { base: string; date: string; rates: Record<string, number> } = await res.json();

    const rows = Object.entries(data.rates).map(([currency, rate]) => ({
      base_currency: 'USD',
      target_currency: currency,
      rate,
    }));
    void supabase.from('currency_exchange_rates').upsert(
      rows.map((r) => ({ ...r, date })),
      { onConflict: 'base_currency,target_currency,date' }
    );
    if (data.date !== date) {
      void supabase.from('currency_exchange_rates').upsert(
        rows.map((r) => ({ ...r, date: data.date })),
        { onConflict: 'base_currency,target_currency,date' }
      );
    }

    return data.rates;
  } catch {
    return null;
  }
}
