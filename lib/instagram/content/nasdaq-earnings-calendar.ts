/**
 * Instagram-pipeline-specific wrapper over the shared Nasdaq earnings-calendar
 * fetcher (lib/market-data/nasdaq-earnings-calendar.ts) — filters to an
 * allowlist and shapes rows as WebSearchEarningsHit so this module's two
 * callers (earnings-calendar.ts, earnings-results.ts) and their downstream
 * fallback (earnings-web-search.ts) don't need to change.
 *
 * Same site earnings-web-search.ts's prompt already told Claude to search
 * first; this calls it directly instead of paying an LLM to re-extract
 * structured data that's already sitting there in clean JSON. See the shared
 * module's file header for cost/accuracy/limitation details — they're
 * unchanged by this wrapper.
 */

import { fetchNasdaqEarningsDay } from '@/lib/market-data/nasdaq-earnings-calendar';
import type { WebSearchEarningsHit } from './earnings-web-search';

function dateRange(weekStart: string, weekEnd: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(weekStart + 'T12:00:00Z');
  const end = new Date(weekEnd + 'T12:00:00Z');
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
}

/**
 * Confirmed earnings hits for the week, pre-filtered to `allowlist` — the
 * app doesn't care about the hundreds of unrelated tickers Nasdaq's
 * calendar carries per day. One fetch per weekday, run in parallel.
 */
export async function fetchNasdaqEarningsCalendar(
  weekStart: string,
  weekEnd: string,
  allowlist: ReadonlySet<string>
): Promise<WebSearchEarningsHit[]> {
  const dates = dateRange(weekStart, weekEnd);
  const perDay = await Promise.all(dates.map((date) => fetchNasdaqEarningsDay(date)));

  const hits: WebSearchEarningsHit[] = [];
  perDay.forEach((rows, i) => {
    const date = dates[i];
    for (const row of rows) {
      if (!allowlist.has(row.symbol)) continue;
      hits.push({
        symbol: row.symbol,
        date,
        time: row.time,
        epsEstimate: row.epsEstimate,
        epsActual: row.epsActual,
        surprisePercent: row.surprisePercent,
      });
    }
  });
  return hits;
}
