const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Day of month of the nth `weekday` (0 = Sun) in a month; n = -1 for the last. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(year, month, 0));
  return lastDay.getUTCDate() - ((lastDay.getUTCDay() - weekday + 7) % 7);
}

/** Saturday holidays close the Friday before, Sunday ones the Monday after. */
function observed(year: number, month: number, day: number): string {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const shift = dow === 6 ? -1 : dow === 0 ? 1 : 0;
  const d = new Date(Date.UTC(year, month - 1, day + shift));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Easter Sunday (Anonymous Gregorian algorithm), as [month, day]. */
function easter(y: number): [number, number] {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}

const holidayCache = new Map<number, Set<string>>();

/**
 * NYSE/Nasdaq full-day closures for a year, from the exchange's fixed rules.
 * Computed rather than read from `exchange_holidays` because callers are
 * synchronous (the quote parser, the Why Today cache key). That table stays
 * the record; scripts/test-trading-day.ts checks these against its verified
 * 2026-2028 rows. Unscheduled closures (a national day of mourning) are not
 * known here; the cost of missing one is a single extra generation.
 */
export function usMarketHolidays(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (set) return set;
  const [em, ed] = easter(year);
  const goodFriday = new Date(Date.UTC(year, em - 1, ed - 2));
  const newYear = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  set = new Set([
    // NYSE does not close the Friday before a Saturday New Year's Day (that Friday is in the old year).
    ...(newYear === 6 ? [] : [observed(year, 1, 1)]),
    iso(year, 1, nthWeekday(year, 1, 1, 3)),   // Martin Luther King Jr. Day
    iso(year, 2, nthWeekday(year, 2, 1, 3)),   // Washington's Birthday
    iso(year, goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate()),
    iso(year, 5, nthWeekday(year, 5, 1, -1)),  // Memorial Day
    observed(year, 6, 19),                     // Juneteenth
    observed(year, 7, 4),                      // Independence Day
    iso(year, 9, nthWeekday(year, 9, 1, 1)),   // Labor Day
    iso(year, 11, nthWeekday(year, 11, 4, 4)), // Thanksgiving
    observed(year, 12, 25),                    // Christmas
  ]);
  holidayCache.set(year, set);
  return set;
}

/**
 * The ET date of the US stock session a day's change describes right now.
 * From 4:00 ET (pre-market) that is today; before then, and over a weekend or
 * a market holiday, it is still the previous trading day's session. `allDay`
 * (crypto) skips the roll-back: it trades around the clock.
 */
export function sessionDateET(now = new Date(), allDay = false): string {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const date = () => iso(et.getFullYear(), et.getMonth() + 1, et.getDate());
  if (!allDay) {
    if (et.getHours() < 4) et.setDate(et.getDate() - 1);
    while (et.getDay() === 0 || et.getDay() === 6 || usMarketHolidays(et.getFullYear()).has(date())) {
      et.setDate(et.getDate() - 1);
    }
  }
  return date();
}

/** New York wall-clock time on a given date, as unix seconds (handles EST/EDT). */
function etWallToUnix(y: number, m: number, d: number, hh: number, mm: number): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const at = new Date(guess);
  const etWall = new Date(at.toLocaleString('en-US', { timeZone: 'America/New_York' })).getTime();
  const utcWall = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return (guess + (utcWall - etWall)) / 1000;
}

/** True during US pre-market (4:00 to 9:30 New York) on a trading day. */
export function isPreMarketET(now = new Date()): boolean {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  if (usMarketHolidays(et.getFullYear()).has(iso(et.getFullYear(), et.getMonth() + 1, et.getDate()))) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 240 && mins < 570;
}

/**
 * Seconds until the next regular-session open (9:30 New York on a trading
 * day). For data that cannot change while the market is shut, like the last
 * session's movers, so a cache can hold it until it can.
 */
export function secondsUntilNextOpenET(now = new Date()): number {
  const nowSec = now.getTime() / 1000;
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  for (let i = 0; i < 10; i++) {
    const d = new Date(et.getFullYear(), et.getMonth(), et.getDate() + i);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    if (d.getDay() === 0 || d.getDay() === 6 || usMarketHolidays(y).has(iso(y, m, day))) continue;
    const open = etWallToUnix(y, m, day, 9, 30);
    if (open > nowSec) return Math.round(open - nowSec);
  }
  return 30 * 60;
}
