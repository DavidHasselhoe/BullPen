/**
 * Per-symbol dividend schedule (past payments plus declared ones), shared by
 * every user and cached for days: Redis, then Supabase market_data_cache.
 *
 * Two sources, both measured 2026-11-06:
 * - TwelveData /dividends (1 credit per symbol): ex-date and amount for every
 *   US listing, ETFs included, and declared future ex-dates when asked for a
 *   future end date. No pay dates.
 * - Nasdaq's public quote API (free, unofficial, same as
 *   lib/market-data/nasdaq-earnings-calendar.ts): adds real pay dates, but only
 *   for Nasdaq-listed symbols ("Non-Nasdaq symbols is not available" for KO,
 *   VOO, SCHD). Fails soft: no pay date, never a guessed one.
 *
 * Server only.
 */

import { getDividends } from '@/lib/twelvedata/twelvedata-client';
import { rmget, rset } from '@/lib/cache/redis-cache';
import { getCachedMany, setCached } from '@/lib/cache/market-data-cache';
import { tryReserveCredits, tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import type { DividendEvent } from './dividend-income';

const TTL_SECONDS = 2 * 24 * 3600;
/** A non-payer is cached too (TSLA would cost a credit on every load otherwise), for less time in case the empty answer was a blip. */
const EMPTY_TTL_SECONDS = 24 * 3600;
const CONCURRENCY = 4;
const NASDAQ_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const cacheKey = (sym: string) => `dividends:schedule:v1:${sym}`;

/** "11/16/2026" -> "2026-11-16"; "N/A" or junk -> null. */
function usDate(s: string | undefined): string | null {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

interface NasdaqRow { exOrEffDate?: string; paymentDate?: string; amount?: string; currency?: string; type?: string }

async function nasdaqRows(sym: string): Promise<DividendEvent[]> {
  for (const assetclass of ['stocks', 'etf']) {
    try {
      const res = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/dividends?assetclass=${assetclass}`, {
        headers: { 'User-Agent': NASDAQ_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const rows = ((await res.json()) as { data?: { dividends?: { rows?: NasdaqRow[] | null } } })?.data?.dividends?.rows;
      if (!rows?.length) continue;
      return rows
        .filter((r) => (r.currency ?? 'USD') === 'USD' && (r.type ?? 'Cash') === 'Cash')
        .map((r) => ({ exDate: usDate(r.exOrEffDate) ?? '', payDate: usDate(r.paymentDate), amount: Number((r.amount ?? '').replace(/[$,]/g, '')) }))
        .filter((e) => e.exDate && e.amount > 0);
    } catch {
      // Unofficial endpoint: a timeout or shape change just means no pay dates.
    }
  }
  return [];
}

/** Fetch one symbol from both sources. Throws only when TwelveData fails and Nasdaq has nothing. */
async function fetchSchedule(sym: string): Promise<DividendEvent[]> {
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  const [td, nd] = await Promise.allSettled([getDividends(sym, end), nasdaqRows(sym)]);
  const nasdaq = nd.status === 'fulfilled' ? nd.value : [];
  if (td.status === 'rejected') {
    if (nasdaq.length) return nasdaq;
    throw td.reason;
  }
  if (td.value.length === 0) return nasdaq;
  const payByEx = new Map(nasdaq.map((e) => [e.exDate, e.payDate]));
  return td.value
    .filter((d) => d.ex_dividend_date && d.amount > 0)
    .map((d) => ({ exDate: d.ex_dividend_date, payDate: payByEx.get(d.ex_dividend_date) ?? d.payment_date ?? null, amount: d.amount }));
}

/**
 * Schedules for many symbols. Cache first; misses are fetched only when the
 * credit budget admits them (1 credit each), so under load a symbol can be
 * missing from the result. `missing` lists those, for the caller to say so.
 */
export async function getDividendSchedules(
  symbols: string[],
  budget: 'organic' | 'cron',
): Promise<{ schedules: Map<string, DividendEvent[]>; missing: string[] }> {
  const syms = [...new Set(symbols.map((s) => s.toUpperCase()))].filter((s) => /^[A-Z0-9.\-]{1,10}$/.test(s));
  const schedules = new Map<string, DividendEvent[]>();
  const keys = syms.map(cacheKey);

  const hot = await rmget<DividendEvent[]>(keys);
  const coldKeys = keys.filter((k) => !hot.has(k));
  const warm = await getCachedMany<DividendEvent[]>(coldKeys);
  for (const s of syms) {
    const v = hot.get(cacheKey(s)) ?? warm.get(cacheKey(s));
    if (v) schedules.set(s, v);
  }
  const toFetch = syms.filter((s) => !schedules.has(s));
  const missing: string[] = [];
  if (toFetch.length) {
    const admitted = budget === 'cron' ? await tryReserveCredits(toFetch.length) : await tryReserveOrganicCredits(toFetch.length);
    if (!admitted) return { schedules, missing: toFetch };
    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      await Promise.all(toFetch.slice(i, i + CONCURRENCY).map(async (s) => {
        try {
          const events = await fetchSchedule(s);
          schedules.set(s, events);
          const ttl = events.length ? TTL_SECONDS : EMPTY_TTL_SECONDS;
          void rset(cacheKey(s), events, ttl);
          void setCached(cacheKey(s), s, 'dividends', events, ttl);
        } catch (err) {
          console.error(`[dividend-schedule] ${s}:`, err);
          missing.push(s);
        }
      }));
    }
  }
  return { schedules, missing };
}
