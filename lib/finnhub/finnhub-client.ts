// Finnhub API Client
// Free tier API client for market data

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/**
 * Get Finnhub API key from environment variables
 */
function getApiKey(): string {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error('FINNHUB_API_KEY environment variable not set');
  }
  return apiKey;
}

/**
 * Stock Quote Response
 */
export interface StockQuote {
  c: number; // Current price
  d: number; // Change
  dp: number; // Percent change
  h: number; // High price of the day
  l: number; // Low price of the day
  o: number; // Open price of the day
  pc: number; // Previous close price
  t: number; // Timestamp
}

/**
 * Market News Article
 */
export interface MarketNews {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

/**
 * Fetch stock quote for a symbol
 */
export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  
  // Check for error response
  if (data.error) {
    throw new Error(`Finnhub API error: ${data.error}`);
  }

  return data as StockQuote;
}

/**
 * Fetch multiple stock quotes
 */
export async function getStockQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  const quotes = new Map<string, StockQuote>();
  
  // Fetch quotes in parallel (with rate limiting consideration)
  const promises = symbols.map(async (symbol) => {
    try {
      const quote = await getStockQuote(symbol);
      quotes.set(symbol, quote);
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error);
    }
  });

  await Promise.all(promises);
  return quotes;
}

/**
 * Fetch general market news
 */
export async function getMarketNews(category: string = 'general', minId?: number): Promise<MarketNews[]> {
  const apiKey = getApiKey();
  let url = `${FINNHUB_BASE_URL}/news?category=${category}&token=${apiKey}`;
  
  if (minId !== undefined) {
    url += `&minId=${minId}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  return data as MarketNews[];
}

/**
 * Popular stocks for market movers (major tech + S&P 500 top stocks)
 */
export const POPULAR_STOCKS = [
  // Major Tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'NFLX',
  // Other Major S&P 500
  'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'VZ',
  'BAC', 'ADBE', 'PYPL', 'CMCSA', 'NKE', 'MRK', 'PFE', 'TMO', 'AVGO',
  'COST', 'ABT', 'TXN', 'ACN', 'DHR', 'QCOM', 'NEE', 'LIN', 'CVX'
];

/**
 * Calculate top gainers and losers from stock quotes
 */
export interface MarketMover {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

export interface TopMovers {
  gainers: MarketMover[];
  losers: MarketMover[];
}

export async function getTopMovers(limit: number = 5): Promise<TopMovers> {
  const quotes = await getStockQuotes(POPULAR_STOCKS);
  
  const movers: MarketMover[] = Array.from(quotes.entries())
    .filter(([_, quote]) => quote.c > 0 && quote.pc > 0) // Filter out invalid quotes
    .map(([symbol, quote]) => ({
      symbol,
      price: quote.c,
      change: quote.d,
      changePercent: quote.dp,
      previousClose: quote.pc,
    }))
    .filter(mover => !isNaN(mover.changePercent)); // Filter out NaN values

  // Sort by change percent
  const sorted = movers.sort((a, b) => b.changePercent - a.changePercent);

  // Get top gainers (highest positive change)
  const gainers = sorted.filter(m => m.changePercent > 0).slice(0, limit);
  
  // Get top losers (most negative change)
  const losers = sorted
    .filter(m => m.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent) // Sort ascending (most negative first)
    .slice(0, limit);

  return {
    gainers,
    losers,
  };
}

/**
 * Company News Article
 */
export interface CompanyNews {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

/**
 * Fetch company news
 * @param symbol Stock symbol
 * @param from Start date (YYYY-MM-DD)
 * @param to End date (YYYY-MM-DD)
 */
export async function getCompanyNews(symbol: string, from: string, to: string): Promise<CompanyNews[]> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  
  // Check for error response
  if (data.error) {
    throw new Error(`Finnhub API error: ${data.error}`);
  }

  return data as CompanyNews[];
}

/**
 * Earnings Calendar Event
 */
export interface EarningsCalendar {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  hour: string;
  quarter: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  symbol: string;
  year: number | null;
}

/**
 * Fetch earnings calendar
 * @param from Start date (YYYY-MM-DD)
 * @param to End date (YYYY-MM-DD)
 * @param symbol Optional stock symbol to filter
 */
export async function getEarningsCalendar(from: string, to: string, symbol?: string): Promise<EarningsCalendar[]> {
  const apiKey = getApiKey();
  let url = `${FINNHUB_BASE_URL}/calendar/earnings?from=${from}&to=${to}&token=${apiKey}`;
  
  if (symbol) {
    url += `&symbol=${symbol}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  
  // Check for error response
  if (data.error) {
    throw new Error(`Finnhub API error: ${data.error}`);
  }

  return (data.earningsCalendar || []) as EarningsCalendar[];
}

/**
 * Company Earnings (EPS Surprises)
 */
export interface CompanyEarnings {
  actual: number | null;
  estimate: number | null;
  period: string;
  surprise: number | null;
  surprisePercent: number | null;
  symbol: string;
  year: number;
}

/**
 * Fetch company earnings (EPS surprises)
 * @param symbol Stock symbol
 * @param limit Limit number of results (default: 4)
 */
export async function getCompanyEarnings(symbol: string, limit: number = 4): Promise<CompanyEarnings[]> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/stock/earnings?symbol=${symbol}&token=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  
  // Check for error response
  if (data.error) {
    throw new Error(`Finnhub API error: ${data.error}`);
  }

  const earnings = (data || []) as CompanyEarnings[];
  return earnings.slice(0, limit);
}

/**
 * Recommendation Trend Data
 */
export interface RecommendationTrend {
  buy: number;
  hold: number;
  period: string;
  sell: number;
  strongBuy: number;
  strongSell: number;
  symbol: string;
}

/**
 * Fetch recommendation trends
 * @param symbol Stock symbol
 */
export async function getRecommendationTrends(symbol: string): Promise<RecommendationTrend[]> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/stock/recommendation?symbol=${symbol}&token=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  
  // Check for error response
  if (data.error) {
    throw new Error(`Finnhub API error: ${data.error}`);
  }

  return (data || []) as RecommendationTrend[];
}

/**
 * Stock Candles (OHLC) Response
 * Finnhub returns arrays aligned by index
 */
export interface StockCandles {
  c: number[]; // Close prices
  h: number[]; // High prices
  l: number[]; // Low prices
  o: number[]; // Open prices
  s: string;  // Status: "ok" | "no_data"
  t: number[]; // Unix timestamps
  v: number[]; // Volume
}

/**
 * Fetch historical stock candles (OHLC)
 * Daily resolution (D) limited to ~1 year per request; we chunk for longer ranges
 * @param symbol Stock symbol (e.g. AAPL, SPY)
 * @param from Unix timestamp (seconds)
 * @param to Unix timestamp (seconds)
 * @param resolution 1, 5, 15, 30, 60 (minutes) or D, W, M for daily/weekly/monthly
 */
export async function getStockCandles(
  symbol: string,
  from: number,
  to: number,
  resolution: 'D' | 'W' | 'M' | '1' | '5' | '15' | '30' | '60' = 'D'
): Promise<StockCandles> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();

  if (data.s === 'no_data' || !data.t || data.t.length === 0) {
    return {
      c: [],
      h: [],
      l: [],
      o: [],
      s: 'no_data',
      t: [],
      v: [],
    };
  }

  return data as StockCandles;
}

/**
 * Fetch historical candles for long date ranges by chunking into 1-year requests
 */
export async function getStockCandlesLongRange(
  symbol: string,
  fromDate: Date,
  toDate: Date
): Promise<StockCandles> {
  const ONE_YEAR_SEC = 365 * 24 * 60 * 60;
  const fromSec = Math.floor(fromDate.getTime() / 1000);
  const toSec = Math.floor(toDate.getTime() / 1000);
  const span = toSec - fromSec;

  if (span <= ONE_YEAR_SEC) {
    return getStockCandles(symbol, fromSec, toSec, 'D');
  }

  // Chunk into 1-year requests
  const allT: number[] = [];
  const allO: number[] = [];
  const allH: number[] = [];
  const allL: number[] = [];
  const allC: number[] = [];
  const allV: number[] = [];

  let currentFrom = fromSec;
  while (currentFrom < toSec) {
    const currentTo = Math.min(currentFrom + ONE_YEAR_SEC, toSec);
    const chunk = await getStockCandles(symbol, currentFrom, currentTo, 'D');
    if (chunk.t.length > 0) {
      allT.push(...chunk.t);
      allO.push(...chunk.o);
      allH.push(...chunk.h);
      allL.push(...chunk.l);
      allC.push(...chunk.c);
      allV.push(...chunk.v);
    }
    currentFrom = currentTo;
  }

  return {
    c: allC,
    h: allH,
    l: allL,
    o: allO,
    s: allT.length > 0 ? 'ok' : 'no_data',
    t: allT,
    v: allV,
  };
}