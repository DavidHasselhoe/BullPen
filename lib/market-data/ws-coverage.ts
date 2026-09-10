/**
 * Which symbols actually stream live prices over the websocket.
 *
 * WsManager will happily subscribe to anything, but the TwelveData plan only
 * delivers real-time ticks for the S&P 500 names. Subscribing to anything else
 * opens a stream that never ticks: the reader waits on a number that will not
 * arrive, and the UI can't tell that apart from a quiet market.
 *
 * Everything outside this set falls back to the REST quote, which is the same
 * delayed feed the rest of the app shows for those names. Callers should say
 * so rather than presenting a delayed number as live.
 *
 * One place on purpose. If the plan gains another index (Nasdaq-100 is the
 * obvious next one), this is the only line that changes.
 */

import { SP500_TICKERS } from './sp500';

const LIVE_COVERED = new Set(SP500_TICKERS.map((t) => t.toUpperCase()));

/** How stale a non-covered price can be, for UI that needs to say it. */
export const DELAYED_QUOTE_MINUTES = 15;

export function isLivePriceCovered(symbol: string | null | undefined): boolean {
  return !!symbol && LIVE_COVERED.has(symbol.toUpperCase());
}
