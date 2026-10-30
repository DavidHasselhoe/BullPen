/**
 * Smart fundamentals freshness system.
 *
 * Uses TwelveData's /last_change/{type} endpoints (5 credits per symbol) to check
 * whether any cached fundamental data is actually stale before spending
 * 50–100 credits on a full re-fetch.
 *
 * Throttled to at most once per hour per company to stay within credit budget.
 */

import { createServerClient } from '@/lib/supabase/client';
import { getFundamentalsLastChange, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';
import type { EarningsCalendarItem, IncomeStatementPeriod } from '@/lib/twelvedata/twelvedata-client';
import { getCalendarRange } from '@/lib/market-data/calendar-days';
import { getCached, getCachedMany, getCachedManyStale, setCached } from '@/lib/cache/market-data-cache';
import { tryReserveCredits } from '@/lib/twelvedata/credit-budget';
import { addDays, todayET } from '@/lib/dates/calendar-format';

const CHECK_THROTTLE_MS = 60 * 60 * 1000; // 1 hour between checks per company
/** One check a day per company is enough while TwelveData catches up after a report; page views still check hourly. */
const RECHECK_MS = 12 * 60 * 60 * 1000;
const checkKey = (sym: string) => `fundamentals-check:${sym}`;

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
    // Kept in the cache table, not on the companies row: most tickers have no
    // companies row (NVDA, KO and V among them), and this used to return
    // "Company not found" for every one, so their statements never refreshed
    // early at all. Claimed before the call so a failing ticker is throttled too.
    const last = await getCached<{ at: string }>(checkKey(sym));
    if (last && Date.now() - Date.parse(last.at) < CHECK_THROTTLE_MS) {
      return { checked: false, throttled: true, keysExpired: [] };
    }
    await setCached(checkKey(sym), sym, 'fundamentals_check', { at: new Date().toISOString() }, RECHECK_MS / 1000);

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

    // ── Update freshness tracking on the company row, where there is one ──
    // (the admin refresh route orders by it)
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
      .eq('ticker', sym);

    return { checked: true, keysExpired: keysToExpire };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[fundamentals-freshness] Error for ${sym}:`, error);
    return { checked: false, keysExpired: [], error };
  }
}

// ── After an earnings report ─────────────────────────────────────────────────

/** How far back a report still gets its statements chased. */
const REPORTED_LOOKBACK_DAYS = 10;
/** A report this long after the newest stored period end isn't in the statements yet (as pendingReport). */
const BEHIND_DAYS = 95;
const CREDITS_PER_CHECK = 5;

/**
 * Symbols whose stored statements stop before a report they have since made.
 * Exported for scripts/test-post-earnings-refresh.ts.
 */
export function reportersBehind(
  reports: Array<{ symbol: string; date: string }>,
  newestPeriod: Map<string, string>,
): string[] {
  const out = new Set<string>();
  for (const r of reports) {
    const newest = newestPeriod.get(r.symbol);
    if (newest && (Date.parse(r.date) - Date.parse(newest)) / 86_400_000 > BEHIND_DAYS) out.add(r.symbol);
  }
  return [...out];
}

/**
 * Re-runs the last_change check for companies that reported in the last few
 * days and whose cached statements don't include it yet, so the financials
 * prefetch that runs next refetches the ones TwelveData has updated.
 *
 * The page-view check above was the only thing that could cut the 7-day
 * statement cache short, so a report nobody opened the stock page for waited
 * out the week. On 2026-10-30 all 241 large caps that had reported since
 * Oct 20 (GOOGL, AMZN, MSFT, META among them) still had June statements, and
 * the Deep Dive and Bull read the same cache. Self-consuming like the
 * prefetch phases: a checked company drops out for RECHECK_MS.
 */
export async function checkRecentReporters(
  universe: string[],
  limit: number,
): Promise<{ checked: number; keysExpired: number; remaining: number }> {
  const today = todayET();
  const inUniverse = new Set(universe);
  const { byDate } = await getCalendarRange<EarningsCalendarItem>(
    'earnings', addDays(today, -REPORTED_LOOKBACK_DAYS), today, { allowFetch: false },
  );
  const reports = [...byDate.values()].flat()
    .filter((r) => r.eps_actual != null && inUniverse.has(r.symbol?.toUpperCase()))
    .map((r) => ({ symbol: r.symbol.toUpperCase(), date: r.date }));

  const symbols = [...new Set(reports.map((r) => r.symbol))];
  // Uncached symbols are skipped: the financials prefetch fetches those anyway.
  const cached = await getCachedManyStale<IncomeStatementPeriod[]>(symbols.map((s) => `financials:${s}:income:quarterly`));
  const newestPeriod = new Map<string, string>();
  for (const s of symbols) {
    // TwelveData's own quarters only: a quarter read from the 10-Q (lib/edgar/sec-statements.ts)
    // stands in until TwelveData has it, and this keeps chasing TwelveData's fuller rows.
    const dates = (cached.get(`financials:${s}:income:quarterly`) ?? [])
      .filter((r) => r.source !== 'sec').map((r) => r.fiscal_date).filter(Boolean);
    if (dates.length) newestPeriod.set(s, dates.sort().at(-1)!);
  }
  const behind = reportersBehind(reports, newestPeriod);
  if (behind.length === 0) return { checked: 0, keysExpired: 0, remaining: 0 };

  // A check row lives RECHECK_MS, so an unexpired one means checked recently.
  const recent = await getCachedMany<{ at: string }>(behind.map(checkKey));
  const due = behind.filter((s) => !recent.has(checkKey(s)));

  const batch = due.slice(0, limit);
  if (batch.length === 0 || !(await tryReserveCredits(batch.length * CREDITS_PER_CHECK))) {
    return { checked: 0, keysExpired: 0, remaining: due.length };
  }
  const results = await Promise.all(batch.map((t) => checkAndInvalidateFundamentals(t)));
  return {
    checked: results.filter((r) => r.checked).length,
    keysExpired: results.reduce((n, r) => n + r.keysExpired.length, 0),
    remaining: due.length - batch.length,
  };
}
