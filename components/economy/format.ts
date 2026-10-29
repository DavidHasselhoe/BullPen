/**
 * Number and period formatting for the economy pages and the calendar's
 * inline results. Client-safe. Periods are date-only values, so they are
 * formatted in UTC and never go through the user's clock.
 */

import type { EconomicKind } from '@/lib/market-data/economic-kinds';

type Unit = 'pct' | 'jobs' | 'count';

const UNITS: Record<string, Unit> = {
  payrolls: 'jobs',
  claims: 'count',
  claims_4wk: 'count',
};

/** "2.9%", "+254,000", "218,000". Payrolls are stored in thousands. */
export function fmtMetric(key: string, value: number, locale: string): string {
  const unit = UNITS[key] ?? 'pct';
  if (unit === 'jobs') {
    const n = Math.round(value * 1000);
    return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString(locale)}`;
  }
  if (unit === 'count') return Math.round(value).toLocaleString(locale);
  const fixed = value.toLocaleString(locale, { minimumFractionDigits: key.startsWith('rate_') ? 2 : 1, maximumFractionDigits: 2 });
  return `${value < 0 ? fixed.replace('-', '−') : fixed}%`;
}

/** Short chart axis label for a value. */
export function fmtAxis(key: string, value: number, locale: string): string {
  const unit = UNITS[key] ?? 'pct';
  if (unit === 'pct') return `${value.toLocaleString(locale, { maximumFractionDigits: key.startsWith('rate_') ? 2 : 1 })}%`;
  const n = unit === 'jobs' ? value * 1000 : value;
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

const utc = (period: string) => new Date(`${period}T00:00:00Z`);

/** "September 2026", "Q3 2026", "Oct 24, 2026" (week ending), "Oct 29, 2026" (a day). */
export function fmtPeriod(kind: EconomicKind, period: string, locale: string, short = false): string {
  const d = utc(period);
  if (kind === 'gdp') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (kind === 'claims' || kind === 'fomc') {
    return d.toLocaleDateString(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleDateString(locale, { timeZone: 'UTC', month: short ? 'short' : 'long', year: 'numeric' });
}

/** A calendar date ("Oct 15") with the year only when it isn't this year. */
export function fmtDay(date: string, locale: string): string {
  const d = utc(date);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "3.75% to 4.00%" */
export function fmtRange(lower: number, upper: number, locale: string, to: string): string {
  return `${fmtMetric('rate_lower', lower, locale)} ${to} ${fmtMetric('rate_upper', upper, locale)}`;
}
