/**
 * Shared formatting for Bull's Weekly Pick surfaces.
 *
 * Every number rendered through these helpers carries an explicit sign, and
 * every caller pairs the colour class with an arrow icon or a written label —
 * DESIGN.md's Never-Color-Alone rule, which matters more here than anywhere
 * else in the app because the entire feature is a column of red and green.
 */

export type Direction = 'up' | 'down' | 'flat';

export function directionOf(pct: number | null | undefined): Direction {
  if (pct == null || !Number.isFinite(pct)) return 'flat';
  if (pct > 0.005) return 'up';
  if (pct < -0.005) return 'down';
  return 'flat';
}

export const DIRECTION_TEXT: Record<Direction, string> = {
  up: 'text-emerald-700 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  flat: 'text-muted-foreground',
};

/** Signed percentage, always with an explicit + or −. */
export function fmtPct(pct: number | null | undefined, digits = 1): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

export function fmtPrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '—';
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

/** The app language's short date, e.g. "Jul 27, 2026" in English. `locale` comes from intlLocale(). */
export function fmtDate(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export function fmtDateLong(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function daysSince(pickDate: string): number {
  return Math.floor((Date.now() - new Date(`${pickDate}T12:00:00Z`).getTime()) / 86_400_000);
}

/** The discover-namespace `t`, kept loose so this file stays free of React. */
type T = (key: string, options?: Record<string, unknown>) => string;

/**
 * How long a pick has been running, in the coarsest honest unit. Reads after
 * "over" or "for", never after "ago", which is what `pickedAgo` is for.
 */
export function heldFor(pickDate: string, t: T): string {
  const days = daysSince(pickDate);
  if (days < 1) return t('pickHeldLessThanDay');
  if (days < 31) return t('pickHeldDays', { count: days });
  const months = Math.round(days / 30.44);
  if (months < 12) return t('pickHeldMonths', { count: months });
  const years = days / 365.25;
  return years < 1.1 ? t('pickHeldOneYear') : t('pickHeldYears', { years: years.toFixed(1) });
}

/** A complete phrase, so callers never append " ago" to the word "today". */
export function pickedAgo(pickDate: string, t: T): string {
  const days = daysSince(pickDate);
  if (days < 1) return t('pickToday');
  if (days === 1) return t('pickYesterday');
  return t('pickAgo', { duration: heldFor(pickDate, t) });
}

export const CATALYST_KEY = {
  undervalued: 'pickCatalystUndervalued',
  catalyst: 'pickCatalystCatalyst',
  growth: 'pickCatalystGrowth',
  turnaround: 'pickCatalystTurnaround',
  thematic: 'pickCatalystThematic',
} as const;

export const HORIZON_KEY = {
  '3m': 'pickHorizon3m',
  '6m': 'pickHorizon6m',
  '12m': 'pickHorizon12m',
} as const;
