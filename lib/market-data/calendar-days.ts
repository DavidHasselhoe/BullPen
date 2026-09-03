/**
 * Per-day market-calendar data: fetching, caching, credit reservation.
 *
 * WHY THIS MODULE EXISTS
 *
 * TwelveData's /earnings_calendar truncates at exactly 1200 rows and silently
 * drops whole date buckets to fit, filling from the LATEST date backwards — so
 * a multi-day range loses its EARLIEST days with no error and a `status: "ok"`
 * body. Verified live 2026-08-10: requesting 2026-08-03..2026-08-07 returned
 * 1200 rows covering only Aug 4-7, while requesting Aug 3 alone returned 141
 * rows including PLTR, SNAP, VRTX, MAR and TSN. The calendar page was showing
 * 2 rows for a week that genuinely had hundreds.
 *
 * A single day never approaches the cap (busiest observed: 486), so this module
 * fetches earnings one day at a time and every caller goes through it. See the
 * cap warning on `getEarningsCalendarRange` in lib/twelvedata/twelvedata-client.ts.
 *
 * FETCH GRANULARITY IS DECOUPLED FROM CACHE GRANULARITY
 *
 * Everything is *cached* per day; not everything is *fetched* per day. Only
 * earnings has the volume to breach the cap — dividends/splits/IPOs are a
 * handful of rows per month, so fetching those per day would burn 40 credits
 * for an empty response 30 times over. Each fetch is exploded into per-day
 * cache entries regardless, so one splits request feeds the same per-day cache
 * a 53-request earnings sweep does, and week/month/list views all read the same
 * entries and only fill the delta when switching.
 *
 * Empty days are cached as `[]` on purpose: without that, a genuinely quiet day
 * is a permanent cache miss that re-fetches 40 credits on every single view.
 *
 * WHAT IS STORED
 *
 * Raw post-dedup provider rows, not the filtered/enriched API response. The
 * universe filter, market-cap attach, logo attach, sorting and capping are all
 * cheap and change independently — caching raw means changing the tiering or
 * the sort order doesn't cost 40 credits/day to re-derive, and one day entry
 * serves the calendar tool, the Discover widget, the daily brief, the earnings
 * email cron and the Instagram carousel.
 */

import {
  getEarningsCalendarRange,
  getDividendsCalendar,
  getSplitsCalendar,
  getIPOCalendar,
  earningsResponseLooksTruncated,
  TwelveDataRateLimitError,
  type EarningsCalendarItem,
  type DividendsCalendarItem,
  type SplitsCalendarItem,
  type IPOCalendarItem,
} from '@/lib/twelvedata/twelvedata-client';
import { fetchNasdaqEarningsDay, type NasdaqEarningsRow } from './nasdaq-earnings-calendar';
import { getCachedMany, getCachedManyStale, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { tryReserveCredits, waitForCronCreditBudget } from '@/lib/twelvedata/credit-budget';
import { addDays, todayET } from '@/lib/dates/calendar-format';

export type CalendarKind = 'earnings' | 'dividends' | 'splits' | 'ipo';

export type CalendarRow =
  | EarningsCalendarItem
  | DividendsCalendarItem
  | SplitsCalendarItem
  | IPOCalendarItem;

/** Every calendar endpoint costs the same flat 40 credits regardless of range. */
export const CALENDAR_CREDITS_PER_REQUEST = 40;

/**
 * Max days an interactive request will fill live before giving up and
 * reporting `partial`. 8 × 40 = 320 credits, comfortably inside
 * CRON_CREDIT_SHARE (400) so the reservation is always actually grantable —
 * an unreservable cost is the failure mode documented in credit-budget.ts.
 */
export const MAX_LIVE_DAYS_PER_REQUEST = 8;

const COUNTRY = 'United States';

/**
 * How many days ahead of "today" get Nasdaq's free calendar (nasdaq-earnings-
 * calendar.ts) merged in on top of TD's /earnings_calendar. TD only confirms
 * dates ~3-6 weeks out (see calendarDayTtl below); verified live 2026-08-25
 * that this leaves the whole near-term window returning 0-2 US rows/day —
 * even known quarterly reporters (FDX, NKE) had no forward date anywhere in
 * TD's data — while Nasdaq's calendar returned 50+ rows for the same days,
 * including megacaps with real EPS estimates and BMO/AMC timing. 21 days
 * gives a few days of margin past TD's own "near future" TTL bucket (7 days)
 * without reaching into the range TD is more likely to have picked up.
 */
const NASDAQ_MERGE_DAYS_AHEAD = 21;

function dayDeltaFromToday(date: string, today: string): number {
  const delta = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000;
  return Number.isFinite(delta) ? Math.round(delta) : NaN;
}

function isWithinNasdaqMergeWindow(date: string, today: string): boolean {
  const delta = dayDeltaFromToday(date, today);
  return delta >= 0 && delta <= NASDAQ_MERGE_DAYS_AHEAD;
}

function mapNasdaqRowToEarningsItem(row: NasdaqEarningsRow, date: string): EarningsCalendarItem {
  return {
    symbol: row.symbol,
    name: row.name,
    date,
    time: row.time ?? '',
    eps_estimate: row.epsEstimate,
    eps_actual: row.epsActual,
    revenue_estimate: null,
    revenue_actual: null,
    fiscal_quarter: undefined,
    surprise: row.surprisePercent,
  };
}

/**
 * Merges TD's /earnings_calendar rows with Nasdaq's free calendar for one
 * near-term day. TD stays the base row for any symbol it has (so its other
 * fields are kept when present); Nasdaq fills in any symbol TD is missing
 * entirely, and backfills `time`/`eps_estimate` on a TD row that came back
 * empty for them — TD's /earnings_calendar returns `time: ""` on effectively
 * every row (see components/tools/calendar/EventRows.tsx's dead-code-removal
 * comment), so Nasdaq is what makes real BMO/AMC timing possible at all.
 * Nasdaq's own fetch fails soft (see its file header), so a scrape breakage
 * degrades this to "TD-only for that day," never a thrown error.
 */
async function fetchEarningsDayWithNasdaqFill(date: string): Promise<EarningsCalendarItem[]> {
  const [tdRows, nasdaqRows] = await Promise.all([
    getEarningsCalendarRange(date, date, COUNTRY),
    fetchNasdaqEarningsDay(date),
  ]);

  const bySymbol = new Map<string, EarningsCalendarItem>();
  for (const row of tdRows) {
    if (row.symbol) bySymbol.set(row.symbol.toUpperCase(), row);
  }

  for (const nRow of nasdaqRows) {
    const existing = bySymbol.get(nRow.symbol);
    if (!existing) {
      bySymbol.set(nRow.symbol, mapNasdaqRowToEarningsItem(nRow, date));
      continue;
    }
    bySymbol.set(nRow.symbol, {
      ...existing,
      name: existing.name || nRow.name,
      time: existing.time || nRow.time || '',
      eps_estimate: existing.eps_estimate ?? nRow.epsEstimate,
    });
  }

  return [...bySymbol.values()];
}

/**
 * Merges a fresh earnings fetch for a day that has already happened (or is
 * happening today) with whatever was cached before, keyed by symbol.
 * TwelveData's /earnings_calendar is a forward-looking "scheduled events"
 * feed, not a stable historical record — verified live 2026-09-03: a date
 * one day in the past that had shown real earnings (CSCO, PANW, IBM, ...)
 * during the day itself returned only a handful of unrelated OTC rows once
 * re-fetched after the day ended. Before this fix, that response replaced
 * the cache wholesale via setCached, silently wiping the day's real entries
 * — exactly the "yesterday's earnings disappeared" symptom reported live.
 * A company that already reported doesn't stop having reported because a
 * later fetch didn't include it, so for a day at or before today, a
 * re-fetch may only add or update rows, never drop one seen before.
 */
function mergeSettledEarningsDay(
  existing: EarningsCalendarItem[] | null,
  fresh: EarningsCalendarItem[]
): EarningsCalendarItem[] {
  if (!existing || existing.length === 0) return fresh;
  const bySymbol = new Map<string, EarningsCalendarItem>();
  for (const row of existing) if (row.symbol) bySymbol.set(row.symbol.toUpperCase(), row);
  for (const row of fresh) if (row.symbol) bySymbol.set(row.symbol.toUpperCase(), row);
  return [...bySymbol.values()];
}

/**
 * Rows to request per dividends call. That feed is global and uncapped-by-
 * country, so a weekday has thousands of ex-dividend events worldwide and the
 * 100-row default can contain none of our US universe. See the warning on
 * getDividendsCalendar. Deliberately not applied to the other three endpoints:
 * earnings ignores it, splits breaks on it.
 */
const DIVIDENDS_OUTPUTSIZE = 5000;

/**
 * Kinds that must be fetched one day at a time because a multi-day request
 * gets truncated and silently loses whole days.
 *   earnings  — hard 1200-row cap, drops the earliest days (the original bug).
 *   dividends — global feed, thousands/day; a range shares one cap across all
 *               days, so Aug 3-7 collapsed to Aug 7 only.
 * Splits and IPOs are low-volume enough to fetch as one range.
 */
const PER_DAY_KINDS: ReadonlySet<CalendarKind> = new Set<CalendarKind>(['earnings', 'dividends']);

// ── Cache keys ───────────────────────────────────────────────────────────────

/** Only earnings is country-scoped; the other three endpoints take no country. */
export function calendarDayKey(kind: CalendarKind, date: string): string {
  return kind === 'earnings'
    ? `calendar-day:earnings:US:${date}`
    : `calendar-day:${kind}:${date}`;
}

function dataTypeFor(kind: CalendarKind): string {
  return `calendar_day_${kind}`;
}

// ── TTL policy ───────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60;

/**
 * How long a given day's rows stay fresh. Past days settle permanently once
 * actuals have landed; future days keep moving as companies confirm dates
 * (TwelveData only publishes confirmed dates ~3-6 weeks out).
 */
export function calendarDayTtl(date: string, today: string = todayET()): number {
  const dayDelta = Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000
  );
  if (!Number.isFinite(dayDelta)) return DAY;
  if (dayDelta < -3) return 90 * DAY;   // settled: actuals in, date can no longer move
  if (dayDelta <= 0) return 6 * 60 * 60; // recent past / today: eps_actual fills in intraday
  if (dayDelta <= 7) return 12 * 60 * 60; // near future: confirmations occasionally shift
  return DAY;                             // further out: new confirmations land continuously
}

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Inclusive list of YYYY-MM-DD dates from `from` to `to`. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  if (Date.parse(`${to}T12:00:00Z`) < Date.parse(`${from}T12:00:00Z`)) return out;
  let cur = from;
  // Bounded so a malformed range can never spin: ~1 year of days.
  for (let i = 0; i < 400 && Date.parse(`${cur}T12:00:00Z`) <= Date.parse(`${to}T12:00:00Z`); i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** The date field that decides which day a row belongs to, per kind. */
function rowDate(kind: CalendarKind, row: CalendarRow): string {
  if (kind === 'dividends') return (row as DividendsCalendarItem).ex_dividend_date;
  return (row as EarningsCalendarItem | SplitsCalendarItem | IPOCalendarItem).date;
}

// ── Provider fetch ───────────────────────────────────────────────────────────

async function fetchFromProvider(
  kind: CalendarKind,
  from: string,
  to: string,
  today: string
): Promise<CalendarRow[]> {
  switch (kind) {
    case 'earnings':
      // Earnings is always fetched one day at a time (see PER_DAY_KINDS), so
      // from === to here — the merge only ever targets a single real day.
      if (from === to && isWithinNasdaqMergeWindow(from, today)) {
        return fetchEarningsDayWithNasdaqFill(from);
      }
      return getEarningsCalendarRange(from, to, COUNTRY);
    case 'dividends':
      return getDividendsCalendar(from, to, DIVIDENDS_OUTPUTSIZE);
    case 'splits':
      return getSplitsCalendar(from, to);
    case 'ipo':
      return getIPOCalendar(from, to);
  }
}

/**
 * Fetch one unit of work and write every day it covers to the cache —
 * including days that came back empty, so a quiet day is a cache hit rather
 * than a permanent miss.
 *
 * `splitOnTruncation` re-fetches day-by-day when the response looks capped.
 * Earnings is already fetched per day so this only ever fires for the
 * multi-day kinds, guarding against the same bug appearing on another endpoint
 * as volumes grow.
 */
async function fetchAndCacheUnit(
  kind: CalendarKind,
  from: string,
  to: string,
  today: string
): Promise<Map<string, CalendarRow[]>> {
  const rows = await fetchFromProvider(kind, from, to, today);
  const dates = datesBetween(from, to);

  const byDate = new Map<string, CalendarRow[]>();
  for (const d of dates) byDate.set(d, []);
  for (const row of rows) {
    const d = rowDate(kind, row);
    if (!d) continue;
    const bucket = byDate.get(d);
    if (bucket) bucket.push(row);
    else byDate.set(d, [row]); // provider returned a date outside the request; keep it
  }

  // Re-split guard. Only fires on a genuinely cap-sized response — see
  // earningsResponseLooksTruncated for why a bucket-count-only heuristic is
  // wrong here (most days legitimately have zero IPOs or splits, and treating
  // that as truncation re-fetched a sparse feed day by day for nothing).
  const bucketsWithRows = [...byDate.values()].filter((v) => v.length > 0).length;
  if (from !== to && earningsResponseLooksTruncated(rows.length, bucketsWithRows, from, to)) {
    console.error(
      `[calendar-days] ${kind} ${from}..${to} looks truncated (${rows.length} rows, ` +
      `${bucketsWithRows} non-empty buckets). Re-fetching day by day.`
    );
    // Seed with what the range call did return so a budget-limited re-split
    // degrades to "some days refined" rather than losing everything.
    const perDay = new Map<string, CalendarRow[]>(byDate);
    for (const d of dates) {
      if (!(await tryReserveCredits(CALENDAR_CREDITS_PER_REQUEST))) break;
      const dayRows = await fetchAndCacheUnit(kind, d, d, today);
      for (const [k, v] of dayRows) perDay.set(k, v);
    }
    return perDay;
  }

  await Promise.all(
    [...byDate.entries()].map(async ([date, dayRows]) => {
      let rowsToWrite = dayRows;
      if (kind === 'earnings' && dayDeltaFromToday(date, today) <= 0) {
        const existing = await getCachedStale<EarningsCalendarItem[]>(calendarDayKey(kind, date));
        rowsToWrite = mergeSettledEarningsDay(existing, dayRows as EarningsCalendarItem[]);
        byDate.set(date, rowsToWrite);
      }
      return setCached(
        calendarDayKey(kind, date),
        '_market',
        dataTypeFor(kind),
        rowsToWrite,
        calendarDayTtl(date, today)
      );
    })
  );

  return byDate;
}

// ── Public reads ─────────────────────────────────────────────────────────────

export interface CalendarRangeResult<T = CalendarRow> {
  byDate: Map<string, T[]>;
  /** Days we could not fill on this request (budget exhausted or fetch failed). */
  missingDates: string[];
  /** True when `missingDates` is non-empty — the caller should surface a fill-in state. */
  partial: boolean;
}

interface RangeOpts {
  /** Set false to read cache only and never spend credits (cron freshness checks). */
  allowFetch?: boolean;
  /** Override "today" for TTL bucketing. Tests only. */
  today?: string;
}

/**
 * Cache-first read over an inclusive date range.
 *
 * Reads every day in one batched query, then fills up to
 * MAX_LIVE_DAYS_PER_REQUEST missing days live under a single upfront credit
 * reservation. Fetches run in parallel — sequential would blow the function's
 * time budget on a cold month.
 */
export async function getCalendarRange<T = CalendarRow>(
  kind: CalendarKind,
  from: string,
  to: string,
  opts: RangeOpts = {}
): Promise<CalendarRangeResult<T>> {
  const { allowFetch = true, today = todayET() } = opts;
  const dates = datesBetween(from, to);
  const keys = dates.map((d) => calendarDayKey(kind, d));

  const cached = await getCachedMany<T[]>(keys);
  const byDate = new Map<string, T[]>();
  const missing: string[] = [];

  for (const d of dates) {
    const hit = cached.get(calendarDayKey(kind, d));
    if (hit) byDate.set(d, hit);
    else missing.push(d);
  }

  if (missing.length === 0 || !allowFetch) {
    return { byDate, missingDates: missing, partial: missing.length > 0 };
  }

  // Group the missing days into fetch units. Truncation-prone kinds go one day
  // per request; the sparse ones take a whole contiguous span at once.
  const units: Array<{ from: string; to: string }> = PER_DAY_KINDS.has(kind)
    ? missing.slice(0, MAX_LIVE_DAYS_PER_REQUEST).map((d) => ({ from: d, to: d }))
    : [{ from: missing[0], to: missing[missing.length - 1] }];

  const reserved = await tryReserveCredits(units.length * CALENDAR_CREDITS_PER_REQUEST);
  if (!reserved) {
    // Budget is tight. Fall back to stale entries rather than rendering empty
    // days — a slightly older calendar beats a blank one, and beats
    // contributing to an account-wide rate-limit breach.
    const stale = await getCachedManyStale<T[]>(missing.map((d) => calendarDayKey(kind, d)));
    for (const d of missing) {
      const hit = stale.get(calendarDayKey(kind, d));
      if (hit) byDate.set(d, hit);
    }
    const stillMissing = missing.filter((d) => !byDate.has(d));
    return { byDate, missingDates: stillMissing, partial: stillMissing.length > 0 };
  }

  const results = await Promise.allSettled(
    units.map((u) => fetchAndCacheUnit(kind, u.from, u.to, today))
  );

  for (const r of results) {
    if (r.status !== 'fulfilled') {
      if (r.reason instanceof TwelveDataRateLimitError) {
        console.warn(`[calendar-days] ${kind} rate-limited during live fill`);
      } else {
        console.error(`[calendar-days] ${kind} live fill failed:`, r.reason);
      }
      continue;
    }
    for (const [d, rows] of r.value) {
      if (dates.includes(d)) byDate.set(d, rows as T[]);
    }
  }

  const stillMissing = dates.filter((d) => !byDate.has(d));
  return { byDate, missingDates: stillMissing, partial: stillMissing.length > 0 };
}

/** Cache-first single day. Returns [] for a genuinely empty day, null if unfillable. */
export async function getCalendarDay<T = CalendarRow>(
  kind: CalendarKind,
  date: string,
  opts: RangeOpts = {}
): Promise<T[] | null> {
  const { byDate } = await getCalendarRange<T>(kind, date, date, opts);
  return byDate.get(date) ?? null;
}

// ── Cron warm plan ───────────────────────────────────────────────────────────

export interface WarmUnit {
  kind: CalendarKind;
  from: string;
  to: string;
}

/**
 * Rolling window the pre-warm cron keeps hot.
 *
 * `today - 7` covers "what just reported" (the list view's recent-past section
 * and the daily brief's yesterday lookup); `today + 45` covers this week, this
 * month and next month from any point in a month, plus the Instagram
 * carousel's next-week lookahead.
 */
export const WARM_DAYS_BACK = 7;
export const WARM_DAYS_FORWARD = 45;

/**
 * Deterministic, stable-order unit list. Derived from `today` alone so a
 * batch index maps to the same slice for the whole run, exactly as the
 * symbol-indexed prefetch cron requires of its own batching.
 */
export function buildWarmPlan(today: string = todayET()): WarmUnit[] {
  const from = addDays(today, -WARM_DAYS_BACK);
  const to = addDays(today, WARM_DAYS_FORWARD);
  const days = datesBetween(from, to);

  const units: WarmUnit[] = [];

  // Truncation-prone kinds get one unit per day — the whole reason this module
  // exists. Kept in PER_DAY_KINDS order so the plan is stable and readable.
  for (const d of days) units.push({ kind: 'earnings', from: d, to: d });
  for (const d of days) units.push({ kind: 'dividends', from: d, to: d });

  // Splits and IPOs: a handful of rows across the whole window, one unit each.
  units.push({ kind: 'splits', from, to });
  units.push({ kind: 'ipo', from, to });

  return units;
}

/**
 * Warm exactly one unit, reserving its credits first. Skips when every day the
 * unit covers is already fresh, which makes a same-day re-run of the workflow
 * nearly free and lets settled past days (90-day TTL) be skipped forever.
 */
export async function warmCalendarUnit(
  unit: WarmUnit,
  today: string = todayET()
): Promise<{ warmed: number; skipped: boolean }> {
  const dates = datesBetween(unit.from, unit.to);
  const keys = dates.map((d) => calendarDayKey(unit.kind, d));
  const cached = await getCachedMany<CalendarRow[]>(keys);

  if (cached.size === dates.length) return { warmed: 0, skipped: true };

  await waitForCronCreditBudget(CALENDAR_CREDITS_PER_REQUEST);
  const byDate = await fetchAndCacheUnit(unit.kind, unit.from, unit.to, today);
  return { warmed: byDate.size, skipped: false };
}
