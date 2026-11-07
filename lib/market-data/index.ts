/**
 * Market data entry point. Prices, candles and earnings come from TwelveData;
 * news from Finnhub (TwelveData has no news, and Finnhub is licensed for news
 * only, never for displayed prices).
 */

export type {
  StockQuote,
  StockCandles,
  EarningsCalendar,
  CompanyEarnings,
  MarketNews,
  CompanyNews,
} from '@/lib/finnhub/finnhub-client';

export { getMarketNews, getCompanyNews, getMergedCompanyNews } from '@/lib/finnhub/finnhub-client';

export {
  TwelveDataRateLimitError,
  getStockQuote,
  getStockQuotes,
  getStockCandles,
  getStockCandlesLongRange,
  getEarningsCalendar,
  getCompanyEarnings,
} from '@/lib/twelvedata/twelvedata-client';
