import { getEarningsCalendar } from '@/lib/market-data';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { getCalendarRange, mergeCalendarIntoSymbolEarnings, mergeNasdaqEpsHistory } from '@/lib/market-data/calendar-days';
import { fetchNasdaqEpsHistory, type NasdaqEpsReport } from '@/lib/market-data/nasdaq-earnings-calendar';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import type { EarningsCalendar } from '@/lib/finnhub/finnhub-client';
import type { EarningsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { logger } from '@/lib/utils/logger';
import { getTickerOverride } from '@/lib/market-data/ticker-overrides';
import { getFiscalCalendar, labelEarnings } from '@/lib/finance/fiscal-calendar';

const HISTORY_TTL_SECONDS = 12 * 60 * 60;
/** /earnings (20) plus the /income_statement (~101) it reads to match fiscal quarters. */
export const HISTORY_CREDITS = 121;
/** Far enough back to hold any quarterly reporter's latest report, far enough ahead for the warmed calendar. */
const CALENDAR_DAYS_BACK = 100;
const CALENDAR_DAYS_AHEAD = 45;

/**
 * Nasdaq's last 4 reports (estimate + actual, one adjusted basis), cached.
 * Free, no credits. An empty answer (not listed, or Nasdaq failing) is kept
 * only an hour so a hiccup doesn't hide the history for half a day.
 */
async function getNasdaqEps(ticker: string): Promise<NasdaqEpsReport[]> {
  const cacheKey = `nasdaq-eps-history:${ticker}`;
  const cached = await getCached<NasdaqEpsReport[]>(cacheKey);
  if (cached) return cached;
  const reports = await fetchNasdaqEpsHistory(ticker);
  void setCached(cacheKey, ticker, 'nasdaq_eps_history', reports, reports.length ? HISTORY_TTL_SECONDS : 60 * 60);
  return reports;
}

/**
 * Per-symbol /earnings history, cached. It ignores from/to (TD returns the
 * latest 8 rows), so one entry per ticker serves every caller.
 */
async function getHistory(ticker: string): Promise<EarningsCalendar[]> {
  // TwelveData's history for this symbol is another company's (ticker-overrides.ts).
  if (getTickerOverride(ticker)?.unavailable) return [];
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

/**
 * One company's earnings rows exactly as the stock page's Earnings card shows
 * them: TwelveData's history, the market calendar's rows for it, then Nasdaq's
 * adjusted EPS over both, each quarter named the company's way. Bull's
 * getEarningsData reads this too, so it can't quote a different beat than the
 * card (NBIS Q3 2026: card +149% from Nasdaq, Bull -89.5% from TwelveData).
 */
export async function getSymbolEarnings(ticker: string): Promise<EarningsCalendar[]> {
  // The market calendar's own rows for this company, from cache only (no
  // credits). Nasdaq-confirmed ones fill in what the history feed lags on.
  const today = todayET();
  const calendar = getCalendarRange<EarningsCalendarItem>('earnings', addDays(today, -CALENDAR_DAYS_BACK), addDays(today, CALENDAR_DAYS_AHEAD), { allowFetch: false })
    .then(({ byDate }) => [...byDate.values()].flat().filter((r) => r.symbol?.toUpperCase() === ticker))
    .catch(() => [] as EarningsCalendarItem[]);

  // The company's own fiscal quarters, so these rows name a quarter exactly as
  // Revenue Flow and Financials do (both read the same SEC calendar).
  const fiscal = getFiscalCalendar(ticker).catch(() => null);
  const nasdaqEps = getNasdaqEps(ticker).catch(() => [] as NasdaqEpsReport[]);

  let history: EarningsCalendar[] = [];
  try {
    history = await getHistory(ticker);
  } catch (error) {
    // Rate limit or provider failure: the calendar rows below can still show something.
    logger.warn(`[earnings-calendar] Failed for ${ticker}`, { error });
  }

  return labelEarnings(
    mergeNasdaqEpsHistory(mergeCalendarIntoSymbolEarnings(history, await calendar, ticker), await nasdaqEps, ticker),
    await fiscal,
  );
}

/** The card's surprise: percent of the estimate's size, none when the estimate is under a nickel (a near-zero base swings wildly). */
export function epsSurprisePct(actual: number, estimate: number): number | null {
  return Math.abs(estimate) >= 0.05 ? ((actual - estimate) / Math.abs(estimate)) * 100 : null;
}
