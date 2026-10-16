/**
 * The clock times of day are shown on: a time zone from the user's setting
 * (`users.settings.time_zone`: 'auto' follows the device, 'market' is New
 * York) and a 12- or 24-hour cycle from the app language (15:30 in Norwegian,
 * 3:30 PM in English). `ClockSync` keeps it current; `useClock()` subscribes.
 *
 * Display only. Logic that needs the exchange clock (which session a bar is
 * in, which trading day it belongs to) pins America/New_York itself, and
 * date-only values (a daily bar, an earnings date) must never pass through
 * here: shifting them by a zone moves them a day.
 */

export const MARKET_TIME_ZONE = 'America/New_York';

export interface Clock {
  /** IANA zone; undefined = the device's own. */
  timeZone: string | undefined;
  hour12: boolean;
  /** Intl locale of the app language, so day and month names read in it. */
  locale: string;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The stored setting as a zone to format in. Anything unrecognised falls back to the device. */
export function resolveTimeZone(pref: unknown): string | undefined {
  if (pref === 'market') return MARKET_TIME_ZONE;
  if (typeof pref === 'string' && pref !== 'auto' && isValidTimeZone(pref)) return pref;
  return undefined;
}

// App language codes that are not Intl locales: 'no' is Bokmål, 'qa' the pseudo-locale.
const INTL_LOCALE: Record<string, string> = { no: 'nb', qa: 'en' };

/** The Intl locale for an app language code. */
export function intlLocale(lang: string): string {
  const base = (lang || 'en').split('-')[0];
  return INTL_LOCALE[base] ?? base;
}

/** Whether people reading this language expect "3:30 PM" rather than "15:30". */
export function languageUsesHour12(lang: string): boolean {
  const cycle = new Intl.DateTimeFormat(intlLocale(lang), { hour: 'numeric' }).resolvedOptions().hourCycle;
  return cycle === 'h11' || cycle === 'h12';
}

const SERVER_CLOCK: Clock = { timeZone: undefined, hour12: true, locale: 'en-US' };
let current: Clock = SERVER_CLOCK;
const listeners = new Set<() => void>();

export const getClock = (): Clock => current;
export const getServerClock = (): Clock => SERVER_CLOCK;

export function setClock(next: Clock): void {
  if (next.timeZone === current.timeZone && next.hour12 === current.hour12 && next.locale === current.locale) return;
  current = next;
  listeners.forEach((l) => l());
}

export function subscribeClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const cache = new Map<string, Intl.DateTimeFormat>();

/** In the clock's language and zone; any hour follows its 12/24h cycle. */
function formatter(opts: Intl.DateTimeFormatOptions, clock: Clock): Intl.DateTimeFormat {
  const key = JSON.stringify([opts, clock.timeZone ?? '', clock.hour12, clock.locale]);
  let f = cache.get(key);
  if (!f) {
    const hourOpts: Intl.DateTimeFormatOptions = opts.hour
      ? { hour: clock.hour12 ? 'numeric' : '2-digit', hourCycle: clock.hour12 ? 'h12' : 'h23' }
      : {};
    f = new Intl.DateTimeFormat(clock.locale, { ...opts, ...hourOpts, timeZone: clock.timeZone });
    cache.set(key, f);
  }
  return f;
}

/** "3:30 PM" / "15:30" by default; pass options for other parts (e.g. timeZoneName). */
export function fmtClockTime(
  date: Date,
  clock: Clock = current,
  opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' },
): string {
  return formatter(opts, clock).format(date);
}

/** A date in the clock's zone, e.g. "Fri, Oct 16" for an intraday moment. */
export function fmtClockDate(date: Date, opts: Intl.DateTimeFormatOptions, clock: Clock = current): string {
  return formatter(opts, clock).format(date);
}

/**
 * A date-only market value (a daily bar, a trading day) as its trading date:
 * read in New York whatever the user's zone. A daily bar is stamped at
 * midnight New York, which is still the previous evening in Chicago.
 */
export function fmtTradingDate(date: Date, opts: Intl.DateTimeFormatOptions, clock: Clock = current): string {
  return formatter(opts, { ...clock, timeZone: MARKET_TIME_ZONE }).format(date);
}

/**
 * "Oct 13" / "okt. 13" / "10月 13": always month, a space, then day, the
 * shape the chart's date pill splits to animate. `timeZone` undefined = the device.
 */
export function fmtMonthDay(date: Date, timeZone: string | undefined, clock: Clock = current): string {
  const parts = formatter({ month: 'short', day: 'numeric' }, { ...clock, timeZone }).formatToParts(date);
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${month} ${day}`;
}
