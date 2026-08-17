/**
 * Free, public Nasdaq earnings-calendar JSON API — no key, no auth. Same
 * site earnings-web-search.ts's prompt already told Claude to search first;
 * this calls it directly instead of paying an LLM to re-extract structured
 * data that's already sitting there in clean JSON.
 *
 * KNOWN LIMITATION (verified live 2026-08-17): like TwelveData's own
 * /earnings_calendar (see earnings-web-search.ts's file header), this
 * aggregator isn't reliably populated for large-cap names more than ~3 days
 * out — a date 4 days out (the Friday of a Sunday-generated week) showed
 * only small/mid-caps with no EPS, and 7 days out showed almost nothing.
 * That's why this is the PRIMARY source, not the ONLY source —
 * earnings-calendar.ts falls back to a narrower Claude web search for
 * whatever's still missing after this, instead of researching the whole
 * week from scratch every run.
 *
 * Also unofficial: this is Nasdaq's own internal API backing their public
 * earnings calendar page, not a documented/licensed developer product — it
 * could change shape or start blocking scraping without notice. Fails soft
 * (a request error or empty day just yields no hits, same as a genuinely
 * quiet day) rather than throwing, so a format change degrades to "the
 * Claude fallback does more work" instead of breaking the pipeline.
 */

import type { WebSearchEarningsHit } from './earnings-web-search';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function parseTime(raw: string | undefined): 'BMO' | 'AMC' | null {
  if (raw === 'time-pre-market') return 'BMO';
  if (raw === 'time-after-hours') return 'AMC';
  return null;
}

/** "$4.71" -> 4.71, "($0.45)" -> -0.45, "" -> null. */
function parseEps(raw: string | undefined): number | null {
  if (!raw) return null;
  const negative = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = raw.replace(/[()$,]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

interface NasdaqCalendarRow {
  symbol?: string;
  time?: string;
  epsForecast?: string;
}

interface NasdaqCalendarResponse {
  data?: { rows?: NasdaqCalendarRow[] | null } | null;
}

async function fetchOneDay(date: string): Promise<NasdaqCalendarRow[]> {
  try {
    const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as NasdaqCalendarResponse;
    return body.data?.rows ?? [];
  } catch (err) {
    console.error(`[nasdaq-earnings-calendar] fetch failed for ${date}:`, err);
    return [];
  }
}

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
  const perDay = await Promise.all(dates.map((date) => fetchOneDay(date)));

  const hits: WebSearchEarningsHit[] = [];
  perDay.forEach((rows, i) => {
    const date = dates[i];
    for (const row of rows) {
      const symbol = row.symbol?.toUpperCase();
      if (!symbol || !allowlist.has(symbol)) continue;
      hits.push({ symbol, date, time: parseTime(row.time), epsEstimate: parseEps(row.epsForecast) });
    }
  });
  return hits;
}
