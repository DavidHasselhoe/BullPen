import { createServerClient } from '@/lib/supabase/client';
import type { Breakdown, RevenuePart } from '@/lib/segments/select-breakdown';

/**
 * The revenue-parts cache.
 *
 * A null breakdown is stored as deliberately as a real one. Roughly a third of
 * filers have nothing worth showing, and re-downloading a multi-megabyte
 * instance document on every page view to rediscover that is the expensive
 * mistake this table exists to prevent.
 */

/** How long a stored answer, including "this company has none", stays good. */
const FRESH_DAYS = 45;

export interface StoredBreakdown {
  breakdown: Breakdown | null;
  fresh: boolean;
}

export async function getStoredBreakdown(
  ticker: string,
  periodEnd: string,
  /** Annual and quarterly are separate rows: a fiscal year ends on the same
   *  date as its Q4, so the date alone does not identify a breakdown. */
  period: 'annual' | 'quarterly',
): Promise<StoredBreakdown | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('revenue_segments')
    .select('basis, parts, total, checked_at')
    .eq('ticker', ticker.toUpperCase())
    .eq('period_end', periodEnd)
    .eq('period', period)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as {
    basis: string | null;
    parts: RevenuePart[] | null;
    total: number | null;
    checked_at: string;
  };
  const ageDays = (Date.now() - Date.parse(row.checked_at)) / 86_400_000;
  const breakdown =
    row.parts && row.basis
      ? { parts: row.parts, basis: row.basis as Breakdown['basis'], total: Number(row.total ?? 0) }
      : null;

  return { breakdown, fresh: ageDays < FRESH_DAYS };
}

export async function storeBreakdown(
  ticker: string,
  periodEnd: string,
  period: 'annual' | 'quarterly',
  form: string,
  accession: string,
  breakdown: Breakdown | null,
): Promise<void> {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('revenue_segments').upsert({
    ticker: ticker.toUpperCase(),
    period_end: periodEnd,
    period,
    form,
    accession,
    basis: breakdown?.basis ?? null,
    parts: breakdown?.parts ?? null,
    total: breakdown?.total ?? null,
    checked_at: new Date().toISOString(),
  });
}
