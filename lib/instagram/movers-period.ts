/**
 * Weekly and monthly market movers: when each edition posts, and what every
 * stock did over the period. Pure date math and arithmetic, no fetching, so
 * scripts/test-movers-period.ts can check the rules directly.
 *
 * Dates are US trading days as YYYY-MM-DD strings, compared as strings.
 */

import { addDays, monthKeyOf, monthRange, weekRangeOf, weekdayMondayFirst } from '@/lib/dates/calendar-format';

export type MoversPeriod = 'week' | 'month';

export interface DailyClose {
  date: string;
  close: number;
}

export interface PeriodMove {
  symbol: string;
  changePercent: number;
  price: number;
}

function isTradingDay(date: string, closed: Set<string>): boolean {
  return weekdayMondayFirst(date) < 5 && !closed.has(date);
}

/** Last calendar day of the Monday-Sunday week or the month containing `date`. */
export function periodEnd(period: MoversPeriod, date: string): string {
  return period === 'week' ? weekRangeOf(date).to : monthRange(monthKeyOf(date)).last;
}

/** First calendar day of the Monday-Sunday week or the month containing `date`. */
export function periodStart(period: MoversPeriod, date: string): string {
  return period === 'week' ? weekRangeOf(date).from : `${monthKeyOf(date)}-01`;
}

/**
 * True when `date` is a trading day and no trading day follows it in the same
 * week or month. So the weekly edition lands on Friday, or Thursday when Friday
 * is a closure, and the monthly one on whatever weekday ends the month: month
 * length and weekends fall out of the date math (Feb 2026 ends on Fri the 27th,
 * Aug 2026 on Mon the 31st). `closed` must hold every full-day closure from
 * `date` through periodEnd.
 */
export function isLastTradingDayOf(period: MoversPeriod, date: string, closed: Set<string>): boolean {
  if (!isTradingDay(date, closed)) return false;
  const end = periodEnd(period, date);
  for (let d = addDays(date, 1); d <= end; d = addDays(d, 1)) {
    if (isTradingDay(d, closed)) return false;
  }
  return true;
}

/**
 * Change from the last close before the period began to the close on `date`.
 * Null when either end is missing: a stock with no bar for `date` would rank
 * on a stale price, and one listed mid-period has no starting close.
 */
export function periodChange(
  closes: DailyClose[],
  period: MoversPeriod,
  date: string
): { changePercent: number; price: number } | null {
  const start = periodStart(period, date);
  let base: DailyClose | undefined;
  let last: DailyClose | undefined;
  for (const c of closes) {
    if (c.date === date) last = c;
    if (c.date < start && (!base || c.date > base.date)) base = c;
  }
  if (!last || !base || base.close <= 0) return null;
  return { changePercent: (last.close / base.close - 1) * 100, price: last.close };
}

/** Every symbol's move over the period, for the caller to rank. */
export function periodMoves(
  closesBySymbol: Map<string, DailyClose[]>,
  period: MoversPeriod,
  date: string
): PeriodMove[] {
  const moves: PeriodMove[] = [];
  for (const [symbol, closes] of closesBySymbol) {
    const change = periodChange(closes, period, date);
    if (change) moves.push({ symbol, ...change });
  }
  return moves;
}
