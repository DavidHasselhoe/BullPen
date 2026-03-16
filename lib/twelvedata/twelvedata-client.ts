/**
 * Twelve Data API Client
 * Market data: quotes, time series, earnings, recommendations.
 * News is NOT included — use Finnhub or another provider.
 */

const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

/** Thrown when Twelve Data API rate limit (8/min Basic, etc.) is exceeded */
export class TwelveDataRateLimitError extends Error {
  constructor(message: string = 'Market data rate limit exceeded. Please try again in a minute.') {
    super(message);
    this.name = 'TwelveDataRateLimitError';
  }
}

/** Log Twelve Data API usage for cost modeling. Set TWELVE_DATA_USAGE_LOG=true to enable. */
function logUsage(endpoint: string, symbol?: string): void {
  if (process.env.TWELVE_DATA_USAGE_LOG === 'true') {
    console.log(
      JSON.stringify({ ts: Date.now(), source: 'twelvedata', endpoint, symbol: symbol ?? null })
    );
  }
}

function getApiKey(): string {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error('TWELVE_DATA_API_KEY environment variable not set');
  }
  return apiKey;
}

function buildUrl(endpoint: string, params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  searchParams.set('apikey', getApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') {
      searchParams.set(k, String(v));
    }
  }
  return `${TWELVE_DATA_BASE_URL}${endpoint}?${searchParams.toString()}`;
}

// -------- Types (Finnhub-compatible for minimal consumer changes) --------

export interface StockQuote {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

export interface StockCandles {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  s: string;
  t: number[];
  v: number[];
}

export interface MarketMover {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  logoUrl?: string;
}

export interface TopMovers {
  gainers: MarketMover[];
  losers: MarketMover[];
}

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

export interface CompanyEarnings {
  actual: number | null;
  estimate: number | null;
  period: string;
  surprise: number | null;
  surprisePercent: number | null;
  symbol: string;
  year: number;
}

export interface RecommendationTrend {
  buy: number;
  hold: number;
  period: string;
  sell: number;
  strongBuy: number;
  strongSell: number;
  symbol: string;
}

export const POPULAR_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'NFLX',
  'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'VZ',
  'BAC', 'ADBE', 'PYPL', 'CMCSA', 'NKE', 'MRK', 'PFE', 'TMO', 'AVGO',
  'COST', 'ABT', 'TXN', 'ACN', 'DHR', 'QCOM', 'NEE', 'LIN', 'CVX',
];

// -------- Quote --------

interface TwelveDataQuoteResponse {
  symbol: string;
  close: string;
  change: string;
  percent_change: string;
  high: string;
  low: string;
  open: string;
  previous_close: string;
  datetime?: string;
  timestamp?: number;
  status?: string;
  code?: number;
  message?: string;
}

function parseQuoteResponse(data: TwelveDataQuoteResponse, symbol: string): StockQuote {
  if (data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data API error for ${symbol}`;
    const isRateLimit =
      data.code === 429 ||
      data.code === 402 ||
      /rate.?limit|too many|credits? exceeded|exceeded.*limit/i.test(msg);
    if (isRateLimit) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }
  const close = parseFloat(data.close);
  const change = parseFloat(data.change || '0');
  const percentChange = parseFloat(data.percent_change || '0');
  const pc = parseFloat(data.previous_close || String(close - change));
  const timestamp = data.timestamp ?? Math.floor(Date.now() / 1000);
  return {
    c: close,
    d: change,
    dp: percentChange,
    h: parseFloat(data.high || data.close),
    l: parseFloat(data.low || data.close),
    o: parseFloat(data.open || data.close),
    pc,
    t: timestamp,
  };
}

export async function getStockQuote(symbol: string): Promise<StockQuote> {
  logUsage('quote', symbol);
  const url = buildUrl('/quote', { symbol: symbol.toUpperCase() });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataQuoteResponse;
  if (!response.ok) {
    const msg = data.message || `Twelve Data API error: ${response.status}`;
    if (response.status === 429 || data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }
  return parseQuoteResponse(data, symbol);
}

const QUOTE_MIN_INTERVAL_MS = 8000; // 8s = 7.5/min, under Basic tier 8/min

export async function getStockQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  const quotes = new Map<string, StockQuote>();
  for (let i = 0; i < symbols.length; i++) {
    try {
      const quote = await getStockQuote(symbols[i]);
      quotes.set(symbols[i], quote);
    } catch (err) {
      console.error(`Error fetching Twelve Data quote for ${symbols[i]}:`, err);
    }
    if (i < symbols.length - 1) {
      await new Promise((r) => setTimeout(r, QUOTE_MIN_INTERVAL_MS));
    }
  }
  return quotes;
}

// -------- Time series (candles) --------

interface TwelveDataTimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface TwelveDataTimeSeriesResponse {
  meta?: { symbol: string };
  values?: TwelveDataTimeSeriesValue[];
  status?: string;
  code?: number;
  message?: string;
}

const RESOLUTION_MAP = {
  D: '1day',
  W: '1week',
  M: '1month',
  '1': '1min',
  '5': '5min',
  '15': '15min',
  '30': '30min',
  '60': '1h',
} as const;

export async function getStockCandles(
  symbol: string,
  from: number,
  to: number,
  resolution: 'D' | 'W' | 'M' | '1' | '5' | '15' | '30' | '60' = 'D'
): Promise<StockCandles> {
  const interval = RESOLUTION_MAP[resolution];
  const startDate = new Date(from * 1000).toISOString().slice(0, 10);
  const endDate = new Date(to * 1000).toISOString().slice(0, 10);

  const url = buildUrl('/time_series', {
    symbol: symbol.toUpperCase(),
    interval,
    start_date: startDate,
    end_date: endDate,
    outputsize: 5000,
    order: 'asc',
  });

  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataTimeSeriesResponse;
  logUsage('time_series', symbol);

  if (!response.ok) {
    const msg = data.message || `Twelve Data API error: ${response.status}`;
    if (response.status === 429 || data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }
  if (data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data API error`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }
  const values = data.values ?? [];
  if (values.length === 0) {
    return { c: [], h: [], l: [], o: [], s: 'no_data', t: [], v: [] };
  }

  const t: number[] = [];
  const o: number[] = [];
  const h: number[] = [];
  const l: number[] = [];
  const c: number[] = [];
  const v: number[] = [];

  for (const vv of values) {
    const ts = new Date(vv.datetime).getTime() / 1000;
    t.push(Math.floor(ts));
    o.push(parseFloat(vv.open));
    h.push(parseFloat(vv.high));
    l.push(parseFloat(vv.low));
    c.push(parseFloat(vv.close));
    v.push(parseFloat(vv.volume || '0'));
  }

  return {
    c,
    h,
    l,
    o,
    s: 'ok',
    t,
    v,
  };
}

// Twelve Data allows 5000 points per request. ~252 trading days/year → ~20 years per chunk.
const CHUNK_YEARS = 20;
const CHUNK_SEC = CHUNK_YEARS * 365 * 24 * 60 * 60;

export async function getStockCandlesLongRange(
  symbol: string,
  fromDate: Date,
  toDate: Date
): Promise<StockCandles> {
  const fromSec = Math.floor(fromDate.getTime() / 1000);
  const toSec = Math.floor(toDate.getTime() / 1000);
  const span = toSec - fromSec;

  if (span <= CHUNK_SEC) {
    return getStockCandles(symbol, fromSec, toSec, 'D');
  }

  const allT: number[] = [];
  const allO: number[] = [];
  const allH: number[] = [];
  const allL: number[] = [];
  const allC: number[] = [];
  const allV: number[] = [];

  let currentFrom = fromSec;
  while (currentFrom < toSec) {
    const currentTo = Math.min(currentFrom + CHUNK_SEC, toSec);
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

// -------- Top movers (computed from quotes, same approach as Finnhub) --------

export async function getTopMovers(limit: number = 5): Promise<TopMovers> {
  return getTopMoversForSymbols(POPULAR_STOCKS, limit);
}

export async function getTopMoversForSymbols(
  symbols: string[],
  limit: number = 5
): Promise<TopMovers> {
  if (symbols.length === 0) return { gainers: [], losers: [] };
  const quotes = await getStockQuotes(symbols);
  const movers: MarketMover[] = Array.from(quotes.entries())
    .filter(([_, q]) => q.c > 0 && q.pc > 0)
    .map(([sym, q]) => ({
      symbol: sym,
      price: q.c,
      change: q.d,
      changePercent: q.dp,
      previousClose: q.pc,
    }))
    .filter((m) => !isNaN(m.changePercent));

  const sorted = movers.sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.filter((m) => m.changePercent > 0).slice(0, limit);
  const losers = sorted
    .filter((m) => m.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit);
  return { gainers, losers };
}

// -------- Earnings calendar --------

interface TwelveDataEarningsCalendarItem {
  date: string;
  symbol?: string;
  eps_estimate?: number | null;
  eps_actual?: number | null;
  revenue_estimate?: number | null;
  revenue_actual?: number | null;
  time?: string;
}

interface TwelveDataEarningsCalendarResponse {
  earnings_calendar?: TwelveDataEarningsCalendarItem[];
  data?: TwelveDataEarningsCalendarItem[];
  status?: string;
  code?: number;
  message?: string;
}

export async function getEarningsCalendar(
  from: string,
  to: string,
  symbol?: string
): Promise<EarningsCalendar[]> {
  const params: Record<string, string | number> = {
    start_date: from,
    end_date: to,
  };
  if (symbol) params.symbol = symbol.toUpperCase();

  const url = buildUrl('/earnings_calendar', params);
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataEarningsCalendarResponse;
  logUsage('earnings_calendar', symbol ?? undefined);

  if (!response.ok) {
    const msg = data.message || `Twelve Data API error: ${response.status}`;
    if (response.status === 429 || data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }
  if (data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data API error`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }

  const items = data.earnings_calendar ?? data.data ?? [];
  return items.map((item) => {
    const [yearStr, monthStr] = item.date.split('-');
    const year = parseInt(yearStr || '0', 10);
    const month = parseInt(monthStr || '0', 10);
    const quarter = month >= 1 && month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
    return {
      date: item.date,
      epsActual: item.eps_actual ?? null,
      epsEstimate: item.eps_estimate ?? null,
      hour: item.time ?? '',
      quarter,
      revenueActual: item.revenue_actual ?? null,
      revenueEstimate: item.revenue_estimate ?? null,
      symbol: item.symbol ?? symbol ?? '',
      year,
    };
  });
}

// -------- Company earnings (EPS surprises) --------

interface TwelveDataEarningsItem {
  date: string;
  eps_estimate: number | null;
  eps_actual: number | null;
  difference: number | null;
  surprise_prc: number | null;
}

interface TwelveDataEarningsResponse {
  earnings?: TwelveDataEarningsItem[];
  status?: string;
  code?: number;
  message?: string;
}

export async function getCompanyEarnings(
  symbol: string,
  limit: number = 4
): Promise<CompanyEarnings[]> {
  const url = buildUrl('/earnings', { symbol: symbol.toUpperCase() });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataEarningsResponse;
  logUsage('earnings', symbol);

  if (!response.ok) {
    const msg = data.message || `Twelve Data API error: ${response.status}`;
    if (response.status === 429 || data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }
  if (data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data API error`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }

  const earnings = data.earnings ?? [];
  return earnings.slice(0, limit).map((e) => {
    const [yearStr] = e.date.split('-');
    const year = parseInt(yearStr || '0', 10);
    return {
      actual: e.eps_actual,
      estimate: e.eps_estimate,
      period: e.date,
      surprise: e.difference,
      surprisePercent: e.surprise_prc,
      symbol,
      year,
    };
  });
}

// -------- Recommendation trends --------

interface TwelveDataTrendMonth {
  strong_buy: number;
  buy: number;
  hold: number;
  sell: number;
  strong_sell: number;
}

interface TwelveDataRecommendationsResponse {
  trends?: Record<string, TwelveDataTrendMonth>;
  status?: string;
  code?: number;
  message?: string;
}

const PERIOD_NAMES: Record<string, string> = {
  current_month: '0 months ago',
  previous_month: '1 month ago',
  '2_months_ago': '2 months ago',
  '3_months_ago': '3 months ago',
  '4_months_ago': '4 months ago',
  '5_months_ago': '5 months ago',
};

export async function getRecommendationTrends(symbol: string): Promise<RecommendationTrend[]> {
  const url = buildUrl('/recommendations', { symbol: symbol.toUpperCase() });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataRecommendationsResponse;
  logUsage('recommendations', symbol);

  if (!response.ok) {
    const msg = data.message || `Twelve Data API error: ${response.status}`;
    if (response.status === 429 || data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }
  if (data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data API error`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }

  const trends = data.trends ?? {};
  return Object.entries(trends).map(([key, t]) => ({
    buy: t.buy,
    hold: t.hold,
    period: PERIOD_NAMES[key] ?? key.replace(/_/g, ' '),
    sell: t.sell,
    strongBuy: t.strong_buy,
    strongSell: t.strong_sell,
    symbol,
  }));
}
