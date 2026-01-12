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