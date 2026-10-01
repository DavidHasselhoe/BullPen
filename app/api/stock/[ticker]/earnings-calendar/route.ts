import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar } from '@/lib/market-data';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { getCalendarRange, mergeCalendarIntoSymbolEarnings } from '@/lib/market-data/calendar-days';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import type { EarningsCalendar } from '@/lib/finnhub/finnhub-client';
import type { EarningsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { logger } from '@/lib/utils/logger';

const HISTORY_TTL_SECONDS = 12 * 60 * 60;
/** /earnings (20) plus the /income_statement (~101) it reads to match fiscal quarters. */
const HISTORY_CREDITS = 121;
/** Far enough back to hold any quarterly reporter's latest report, far enough ahead for the warmed calendar. */
const CALENDAR_DAYS_BACK = 100;
const CALENDAR_DAYS_AHEAD = 45;

/**
 * Per-symbol /earnings history, cached. It ignores from/to (TD returns the
 * latest 8 rows), so one entry per ticker serves every caller.
 */
async function getHistory(ticker: string): Promise<EarningsCalendar[]> {
  const cacheKey = `earnings-calendar:${ticker}`;
  const cached = await getCached<EarningsCalendar[]>(cacheKey);
  if (cached) return cached;
  if (!(await tryReserveOrganicCredits(HISTORY_CREDITS))) {
    return (await getCachedStale<EarningsCalendar[]>(cacheKey)) ?? [];
  }
  const history = await getEarningsCalendar('', '', ticker);
  void setCached(cacheKey, ticker, 'earnings_calendar', history, HISTORY_TTL_SECONDS);
  return history;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const params = await context.params;
  const ticker = params.ticker?.toUpperCase();

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: 'Ticker parameter required' },
      { status: 400 }
    );
  }

  // The market calendar's own rows for this company, from cache only (no
  // credits). Nasdaq-confirmed ones fill in what the history feed lags on.
  const today = todayET();
  const calendar = getCalendarRange<EarningsCalendarItem>('earnings', addDays(today, -CALENDAR_DAYS_BACK), addDays(today, CALENDAR_DAYS_AHEAD), { allowFetch: false })
    .then(({ byDate }) => [...byDate.values()].flat().filter((r) => r.symbol?.toUpperCase() === ticker))
    .catch(() => [] as EarningsCalendarItem[]);

  let history: EarningsCalendar[] = [];
  try {
    history = await getHistory(ticker);
  } catch (error) {
    // Rate limit or provider failure: the calendar rows below can still show something.
    logger.warn(`[earnings-calendar] Failed for ${ticker}`, { error });
  }

  return NextResponse.json({
    success: true,
    earnings: mergeCalendarIntoSymbolEarnings(history, await calendar, ticker),
  });
}
