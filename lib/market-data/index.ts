/**
 * Market Data Provider
 * Uses Twelve Data when TWELVE_DATA_API_KEY is set; otherwise falls back to Finnhub.
 * News always uses Finnhub (Twelve Data has no news).
 */

import * as finnhub from '@/lib/finnhub/finnhub-client';
import * as twelvedata from '@/lib/twelvedata/twelvedata-client';

const useTwelveData = !!process.env.TWELVE_DATA_API_KEY;

export type {
  StockQuote,
  StockCandles,
  MarketMover,
  TopMovers,
  EarningsCalendar,
  CompanyEarnings,
  RecommendationTrend,
  MarketNews,
  CompanyNews,
} from '@/lib/finnhub/finnhub-client';

export { POPULAR_STOCKS } from '@/lib/finnhub/finnhub-client';
export { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';

// News: always Finnhub
export const getMarketNews = finnhub.getMarketNews;
export const getCompanyNews = finnhub.getCompanyNews;
export const getMergedCompanyNews = finnhub.getMergedCompanyNews;

// Price data: Twelve Data or Finnhub
export const getStockQuote = useTwelveData ? twelvedata.getStockQuote : finnhub.getStockQuote;
export const getStockQuotes = useTwelveData ? twelvedata.getStockQuotes : finnhub.getStockQuotes;
export const getStockCandles = useTwelveData ? twelvedata.getStockCandles : finnhub.getStockCandles;
export const getStockCandlesLongRange = useTwelveData
  ? twelvedata.getStockCandlesLongRange
  : finnhub.getStockCandlesLongRange;
export const getTopMovers = useTwelveData ? twelvedata.getTopMovers : finnhub.getTopMovers;
export const getTopMoversForSymbols = useTwelveData
  ? twelvedata.getTopMoversForSymbols
  : finnhub.getTopMoversForSymbols;
export const getEarningsCalendar = useTwelveData
  ? twelvedata.getEarningsCalendar
  : finnhub.getEarningsCalendar;
export const getCompanyEarnings = useTwelveData
  ? twelvedata.getCompanyEarnings
  : finnhub.getCompanyEarnings;
export const getRecommendationTrends = useTwelveData
  ? twelvedata.getRecommendationTrends
  : finnhub.getRecommendationTrends;
