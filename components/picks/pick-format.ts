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
  up: 'text-emerald-400',
  down: 'text-red-400',
  flat: 'text-muted-foreground/70',
};

/** Signed percentage, always with an explicit + or −. */
export function fmtPct(pct: number | null | undefined, digits = 1): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

export function fmtPrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '—';
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

/** "27 Jul 2026" — unambiguous across locales, compact enough for a table cell. */
export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export function fmtDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function daysSince(pickDate: string): number {
  return Math.floor((Date.now() - new Date(`${pickDate}T12:00:00Z`).getTime()) / 86_400_000);
}

/**
 * How long a pick has been running, in the coarsest honest unit. Reads after
 * "over" or "for" — never after "ago", which is what `pickedAgo` is for.
 */
export function heldFor(pickDate: string): string {
  const days = daysSince(pickDate);
  if (days < 1) return 'less than a day';
  if (days === 1) return '1 day';
  if (days < 31) return `${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 12) return months === 1 ? '1 month' : `${months} months`;
  const years = days / 365.25;
  return years < 1.1 ? '1 year' : `${years.toFixed(1)} years`;
}

/** A complete phrase, so callers never append " ago" to the word "today". */
export function pickedAgo(pickDate: string): string {
  const days = daysSince(pickDate);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  return `${heldFor(pickDate)} ago`;
}
