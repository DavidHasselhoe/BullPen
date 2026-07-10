/**
 * Smart fundamentals freshness system.
 *
 * Uses TwelveData's /fundamentals/last_changes endpoint (1 credit) to check
 * whether any cached fundamental data is actually stale before spending
 * 50–100 credits on a full re-fetch.
 *
 * Throttled to at most once per hour per company to stay within credit budget.
 */

import { createServerClient } from '@/lib/supabase/client';
import { getFundamentalsLastChange, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';

const CHECK_THROTTLE_MS = 60 * 60 * 1000; // 1 hour between checks per company

/**
 * Maps TwelveData data-type names to the cache key prefixes used by
 * app/api/stock/[ticker]/statistics and app/api/stock/[ticker]/financials.
 *
 * When TwelveData reports a newer last_change date than our cache's fetched_at,
 * we expire those cache rows so the next request fetches fresh data.
 */
const DATA_TYPE_TO_CACHE_KEYS: Record<string, (symbol: string) => string[]> = {
  statistics: (sym) => [`stats:${sym}`],
  income_statement: (sym) => [
    `financials:${sym}:income:quarterly`,
    `financials:${sym}:income:annual`,
  ],
  balance_sheet: (sym) => [
    `financials:${sym}:balance:quarterly`,
    `financials:${sym}:balance:annual`,
  ],
  cash_flow: (sym) => [
    `financials:${sym}:cashflow:quarterly`,
    `financials:${sym}:cashflow:annual`,
  ],
  profile: (sym) => [`company_profile:${sym}`],
};

export interface FreshnessCheckResult {
  checked: boolean;
  throttled?: boolean;
  keysExpired: string[];
  error?: string;
}

/**
 * Check whether any cached fundamental data for `symbol` is stale according
 * to TwelveData's last_changes endpoint, and expire affected cache rows.
 *
 * Safe to call fire-and-forget — all errors are caught internally.
 */
export async function checkAndInvalidateFundamentals(
  symbol: string
): Promise<FreshnessCheckResult> {
  const sym = symbol.toUpperCase();
  const supabase = createServerClient();

  try {
    // ── Throttle: skip if checked within the last hour ───────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (supabase as any)
      .from('companies')
      .select('id, fundamentals_checked_at')
      .eq('ticker', sym)
      .maybeSingle() as { data: { id: string; fundamentals_checked_at: string | null } | null };

    if (!company) {
      return { checked: false, keysExpired: [], error: 'Company not found' };
    }

    if (company.fundamentals_checked_at) {
      const lastCheck = Date.parse(company.fundamentals_checked_at);
      if (Date.now() - lastCheck < CHECK_THROTTLE_MS) {
        return { checked: false, throttled: true, keysExpired: [] };
      }
    }

    // ── Call TwelveData last_changes (1 credit) ───────────────────────────
    // withRateLimitRetry also covers the truncated/malformed-JSON responses seen
    // intermittently on this endpoint in production — a transient network issue,
    // not a real "no data" answer.
    const lastChanges = await withRateLimitRetry(() => getFundamentalsLastChange(sym));

    // ── Find cache rows for this ticker and check their fetched_at ────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cacheRows } = await (supabase as any)
      .from('market_data_cache')
      .select('cache_key, fetched_at')
      .eq('ticker', sym) as { data: Array<{ cache_key: string; fetched_at: string }> | null };

    const fetchedAtMap = new Map<string, string>(
      (cacheRows ?? []).map((r) => [r.cache_key, r.fetched_at])
    );

    // ── Determine which cache keys need expiry ────────────────────────────
    const keysToExpire: string[] = [];

    for (const [dataType, getCacheKeys] of Object.entries(DATA_TYPE_TO_CACHE_KEYS)) {
      const entry = lastChanges[dataType as keyof typeof lastChanges];
      if (!entry?.last_change) continue;

      const tdDate = Date.parse(entry.last_change);
      if (isNaN(tdDate)) continue;

      for (const key of getCacheKeys(sym)) {
        const fetchedAt = fetchedAtMap.get(key);
        if (!fetchedAt || Date.parse(fetchedAt) < tdDate) {
          keysToExpire.push(key);
        }
      }
    }

    // ── Expire stale cache rows ───────────────────────────────────────────
    if (keysToExpire.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('market_data_cache')
        .update({ expires_at: new Date().toISOString() })
        .in('cache_key', keysToExpire);
    }

    // ── Update freshness tracking on the company row ──────────────────────
    const allDates = Object.values(lastChanges)
      .map((v) => (v?.last_change ? Date.parse(v.last_change) : NaN))
      .filter((d) => !isNaN(d));

    const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('companies')
      .update({
        fundamentals_checked_at: new Date().toISOString(),
        ...(maxDate ? { fundamentals_last_change: maxDate.toISOString().split('T')[0] } : {}),
      })
      .eq('id', company.id);

    return { checked: true, keysExpired: keysToExpire };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[fundamentals-freshness] Error for ${sym}:`, error);
    return { checked: false, keysExpired: [], error };
  }
}
