import { batchFetch, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { addDays, currentMonthKey, monthRange, todayET } from '@/lib/dates/calendar-format';
import type { SymbolCloses } from '@/lib/holdings/daily-performance';

interface TsValue { datetime: string; close: string }
interface TsResponse { values?: TsValue[]; status?: string }

/**
 * A completed month's daily closes never change again, split re-adjustment
 * aside — so they cache for a day. The current month gains a bar at each
 * close and its last bar moves intraday, hence the short TTL.
 */
const TTL_PAST_MONTH = 24 * 60 * 60;
const TTL_CURRENT_MONTH = 10 * 60;

/** TwelveData's /batch cap is ~120 requests; 100 matches the SEED_CHUNK used elsewhere. */
const BATCH_CHUNK = 100;

/**
 * Days of runway before the month starts, so day 1 has a previous close to
 * diff against. Seven covers a long weekend plus a holiday.
 */
export const LOOKBACK_DAYS = 7;

/** Map key for one symbol's closes in one month. */
export const monthClosesKey = (symbol: string, month: string) => `${symbol}:${month}`;

/**
 * Daily closes for each (symbol, month): the month's bars up to today, plus a
 * week of runway before day 1. Cached in Redis as `dailycloses:v2:{symbol}:{month}`
 * and shared by the holdings performance calendar and the watchlist scorecard,
 * so both must go through here: a second fetcher with a different window would
 * cache a shape the other misreads.
 *
 * Throws TwelveDataRateLimitError. Any other failure, or no room in the credit
 * budget, leaves those pairs out and sets `incomplete`.
 */
export async function getMonthCloses(
  pairs: { symbol: string; month: string }[],
): Promise<{ closes: Map<string, SymbolCloses[]>; incomplete: boolean }> {
  const today = todayET();
  const current = currentMonthKey();
  const unique = new Map(pairs.map((p) => [monthClosesKey(p.symbol, p.month), p]));

  const closes = new Map<string, SymbolCloses[]>();
  const missing: { symbol: string; month: string; start: string; end: string }[] = [];
  await Promise.all(
    [...unique].map(async ([key, { symbol, month }]) => {
      const { first, last } = monthRange(month);
      const start = addDays(first, -LOOKBACK_DAYS);
      const end = last < today ? last : today;
      // Month lies entirely in the future: nothing to price.
      if (end < start) return;
      const cached = await rget<SymbolCloses[]>(`dailycloses:v2:${key}`);
      if (cached && cached.length > 0) closes.set(key, cached);
      else missing.push({ symbol, month, start, end });
    }),
  );

  let incomplete = false;
  const apiKey = process.env.TWELVE_DATA_API_KEY ?? '';
  for (let i = 0; i < missing.length; i += BATCH_CHUNK) {
    const chunk = missing.slice(i, i + BATCH_CHUNK);
    // 1 credit per /time_series request.
    if (!(await tryReserveOrganicCredits(chunk.length))) {
      incomplete = true;
      break;
    }
    const requests: Record<string, string> = {};
    for (const { symbol, month, start, end } of chunk) {
      // end_date is EXCLUSIVE for daily bars — verified against the API:
      // requesting end_date=2026-06-30 returns through 06-29 only. Passing
      // the last day directly silently drops the last day of every month.
      requests[monthClosesKey(symbol, month)] =
        `/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day` +
        `&start_date=${start}&end_date=${addDays(end, 1)}` +
        `&order=ASC&apikey=${apiKey}`;
    }

    let raw: Record<string, TsResponse>;
    try {
      raw = await batchFetch<TsResponse>(requests);
    } catch (error) {
      if (error instanceof TwelveDataRateLimitError) throw error;
      incomplete = true;
      continue;
    }

    for (const [key, data] of Object.entries(raw)) {
      if (!Array.isArray(data?.values)) continue;
      const series: SymbolCloses[] = [];
      for (const v of data.values) {
        const close = parseFloat(v.close);
        // TwelveData returns daily datetimes as plain YYYY-MM-DD.
        if (!isNaN(close)) series.push({ date: v.datetime.slice(0, 10), close });
      }
      if (series.length === 0) continue;
      series.sort((a, b) => a.date.localeCompare(b.date));
      closes.set(key, series);
      const month = key.slice(key.lastIndexOf(':') + 1);
      void rset(`dailycloses:v2:${key}`, series, month === current ? TTL_CURRENT_MONTH : TTL_PAST_MONTH);
    }
  }

  return { closes, incomplete };
}
