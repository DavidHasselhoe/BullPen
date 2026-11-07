// Finnhub API client: news only. BullPen has no license to display Finnhub
// prices; those come from TwelveData (lib/twelvedata/twelvedata-client.ts).
// The quote, candle and earnings types below describe the TwelveData-backed
// API responses the app consumes.

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
  if (data.error) {
    throw new Error(`Finnhub API error: ${data.error}`);
  }

  return data as CompanyNews[];
}

/**
 * Fetch and merge company news from multiple symbols. Results sorted by datetime desc.
 */
export async function getMergedCompanyNews(
  symbols: string[],
  limit: number = 15
): Promise<MarketNews[]> {
  if (symbols.length === 0) return [];

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 14); // 2 weeks
  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];

  const results = await Promise.allSettled(
    symbols.slice(0, 8).map((s) => getCompanyNews(s, fromStr, toStr))
  );

  const seen = new Set<number>();
  const merged: MarketNews[] = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (seen.has(article.id)) continue;
      seen.add(article.id);
      merged.push({
        ...article,
        category: article.category || 'company',
      });
    }
  }

  merged.sort((a, b) => b.datetime - a.datetime);
  return merged.slice(0, limit);
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
  /** Reported recently but not yet cross-checked against a filed income statement. */
  unconfirmed?: boolean;
  /** An upcoming date projected from past reporting dates, not announced by the company yet. */
  estimated?: boolean;
  /** quarter/year are the company's fiscal ones and its year isn't the calendar year: label "Q3 FY26". */
  offCalendar?: boolean;
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