/**
 * UTC-safe calendar date math, shared by the market calendar tool
 * (components/tools/calendar) and the holdings performance calendar
 * (components/holdings/performance-calendar).
 *
 * Every helper here represents a day as a plain `YYYY-MM-DD` string and parses
 * it at **noon UTC**. Parsing at midnight is the classic footgun: `new
 * Date('2026-07-01')` is midnight UTC, so any consumer in a negative-offset
 * timezone renders it as June 30. Noon leaves ~12 hours of headroom on both
 * sides, so no real-world offset can push the date across a day boundary.
 */

/** Parse a `YYYY-MM-DD` string at noon UTC, dodging timezone boundary issues. */
function parseDay(d: string): Date {
  return new Date(d + 'T12:00:00Z');
}

/** Returns the ISO week range for a given offset. Uses UTC to avoid DST/timezone issues. */
export function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 = Sun
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday + offsetWeeks * 7,
  ));
  const sunday = new Date(Date.UTC(
    monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6,
  ));
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The Monday-Sunday week containing `date` (`YYYY-MM-DD`).
 *
 * Unlike `getWeekRange(offsetWeeks)`, which is always relative to "now", this
 * takes an explicit anchor — which is what lets the calendar page to an
 * arbitrary week rather than only the current one. Parses at noon UTC like
 * every other helper here, so a timezone offset can't roll the day over.
 */
export function weekRangeOf(date: string): { from: string; to: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sun
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday,
  ));
  const sunday = new Date(Date.UTC(
    monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6,
  ));
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
}

/**
 * Today's date in US market time (`YYYY-MM-DD`).
 *
 * Prefer this over `todayStr()` anywhere "today" means a *trading* day. UTC
 * rolls over at 20:00 ET, so between the close and midnight ET a UTC-derived
 * "today" is already tomorrow — which would ring the wrong calendar cell and
 * mark a real trading day as being in the future.
 */
export function todayET(): string {
  // 'en-CA' is the locale trick used throughout the codebase to get YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Formats a YYYY-MM-DD string as "Mon, May 26". Uses noon UTC to avoid timezone boundary issues. */
export function fmtDayHeader(d: string): string {
  return parseDay(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** Formats a YYYY-MM-DD string as "May 26". */
export function fmtShortDate(d: string): string {
  return parseDay(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Formats a YYYY-MM-DD string as "Monday, May 26" — for screen-reader labels. */
export function fmtFullDate(d: string): string {
  return parseDay(d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

/** Formats a week range as "May 25 – 31" or "May 26 – Jun 2". */
export function fmtWeekRange(from: string, to: string): string {
  const f = parseDay(from);
  const t = parseDay(to);
  const mf = f.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const mt = t.toLocaleDateString('en-US', {
    month: f.getUTCMonth() === t.getUTCMonth() ? undefined : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${mf} – ${mt}`;
}

/** Every date string (YYYY-MM-DD) between `from` and `to`, inclusive. */
export function weekDatesBetween(from: string, to: string): string[] {
  const start = parseDay(from);
  const end = parseDay(to);
  const dates: string[] = [];
  for (const d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Shift a `YYYY-MM-DD` string by `n` days (negative goes backwards). */
export function addDays(d: string, n: number): string {
  const dt = parseDay(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ─── Month helpers ────────────────────────────────────────────────────────────
// A "month key" is `YYYY-MM`.

/** The month key (`YYYY-MM`) containing a given `YYYY-MM-DD` date. */
export function monthKeyOf(d: string): string {
  return d.slice(0, 7);
}

/** The current month key in US market time. */
export function currentMonthKey(): string {
  return monthKeyOf(todayET());
}

/** True for a well-formed `YYYY-MM` key with a real month number. */
export function isValidMonthKey(key: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(key)) return false;
  const month = Number(key.slice(5, 7));
  return month >= 1 && month <= 12;
}

/** First and last calendar day of a month, as `YYYY-MM-DD`. */
export function monthRange(key: string): { first: string; last: string } {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)); // 1-indexed
  // Day 0 of the *next* month is the last day of this one — handles leap years.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    first: `${key}-01`,
    last: `${key}-${String(last).padStart(2, '0')}`,
  };
}

/** Shift a month key by `n` months (negative goes backwards). */
export function shiftMonth(key: string, n: number): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)) - 1; // 0-indexed for Date.UTC
  const d = new Date(Date.UTC(year, month + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Formats a month key as "July 2026". */
export function fmtMonthLabel(key: string): string {
  return new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** Formats a month key as "Jul 2026". */
export function fmtMonthLabelShort(key: string): string {
  return new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** Day of week for a `YYYY-MM-DD` string, 0 = Monday … 6 = Sunday. */
export function weekdayMondayFirst(d: string): number {
  const dow = parseDay(d).getUTCDay(); // 0 = Sun
  return dow === 0 ? 6 : dow - 1;
}

/**
 * A month laid out as calendar weeks, Monday-first. Each row is exactly 7
 * entries; `null` marks a leading/trailing pad cell belonging to an adjacent
 * month. Pads are nulls rather than real neighbouring dates because a P&L
 * calendar showing another month's numbers in faded text is just noise.
 *
 * Monday-first matters here beyond convention: it keeps Mon–Fri contiguous, so
 * the five trading days read as one block and the weekend lands at the right
 * edge next to the week total instead of splitting the week in half.
 */
export function monthWeeks(key: string): (string | null)[][] {
  const { first, last } = monthRange(key);
  const lead = weekdayMondayFirst(first);
  const dayCount = Number(last.slice(8, 10));

  const cells: (string | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= dayCount; day++) {
    cells.push(`${key}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Weekday column headers, Monday-first, matching `monthWeeks` ordering. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
