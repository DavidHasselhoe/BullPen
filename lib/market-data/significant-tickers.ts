import { SP500_TICKERS } from './sp500';
import { NASDAQ100_TICKERS } from './nasdaq100';

/**
 * Combined set of S&P 500 + Nasdaq 100 tickers.
 * Used to filter earnings calendars and other market data to significant companies only.
 */
export const SIGNIFICANT_TICKERS: Set<string> = new Set([
  ...SP500_TICKERS,
  ...NASDAQ100_TICKERS,
]);
