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

/**
 * Retries a Twelve Data call once after a delay when it fails due to rate
 * limiting. The Basic plan's 8/min cap is easy to blow past when a single
 * page load fires several statement endpoints (stats + income + balance +
 * cash flow) back to back — a short wait usually clears the window, so this
 * turns a transient 429 into a successful call instead of a false "no data".
 * Non-rate-limit errors (e.g. plan restrictions) are rethrown immediately.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, delayMs = 9000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return fn();
    }
    throw err;
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
  /** Cumulative day volume in full shares (from REST /quote). Optional — not provided by WS ticks. */
  volume?: number;
}

export interface StockCandles {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  s: string;
  t: number[];
  v: number[];
  session?: Array<'pre' | 'regular' | 'post'>;
}

export interface MarketMover {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  volume?: number;
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
  volume?: string;
  datetime?: string;
  timestamp?: number;
  is_market_open?: boolean;
  extended_price?: string;
  extended_change?: string;
  extended_percent_change?: string;
  status?: string;
  code?: number;
  message?: string;
}

function parseQuoteResponse(data: TwelveDataQuoteResponse, symbol: string, useExtended = false): StockQuote {
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

  // When prepost was requested and market is closed, prefer the extended-hours price.
  if (useExtended && data.is_market_open === false) {
    const extPrice = parseFloat(data.extended_price ?? '0');
    if (extPrice) {
      return {
        c: extPrice,
        d: parseFloat(data.extended_change ?? '0'),
        dp: parseFloat(data.extended_percent_change ?? '0'),
        h: parseFloat(data.high || data.close),
        l: parseFloat(data.low || data.close),
        o: parseFloat(data.open || data.close),
        pc: close, // regular session close becomes prev-close baseline
        t: timestamp,
      };
    }
  }

  const volume = data.volume ? parseInt(data.volume, 10) : undefined;

  return {
    c: close,
    d: change,
    dp: percentChange,
    h: parseFloat(data.high || data.close),
    l: parseFloat(data.low || data.close),
    o: parseFloat(data.open || data.close),
    pc,
    t: timestamp,
    ...(volume && volume > 0 ? { volume } : {}),
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

// -------- Batch helper --------

interface BatchResult<T> {
  response: T;
  status: 'success' | 'error';
}

interface BatchResponse<T> {
  code: number;
  status: string;
  data: Record<string, BatchResult<T>>;
}

/**
 * POST /batch — send multiple API requests in a single round-trip.
 * Keys are arbitrary request IDs; values map directly to TwelveData responses.
 * Credits consumed = sum of individual endpoint costs.
 */
export async function batchFetch<T>(
  requests: Record<string, string>
): Promise<Record<string, T>> {
  const apiKey = getApiKey();
  const body = Object.fromEntries(
    Object.entries(requests).map(([id, url]) => [id, { url }])
  );
  logUsage('batch', `${Object.keys(requests).length} requests`);
  const res = await fetch(`${TWELVE_DATA_BASE_URL}/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `apikey ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as BatchResponse<T>;
  if (!res.ok || data.status === 'error') {
    throw new Error(`Twelve Data batch error: ${res.status}`);
  }
  const out: Record<string, T> = {};
  for (const [id, result] of Object.entries(data.data ?? {})) {
    if (result.status === 'success') out[id] = result.response;
  }
  return out;
}

export async function getStockQuotes(
  symbols: string[],
  options?: { prepost?: boolean }
): Promise<Map<string, StockQuote>> {
  if (symbols.length === 0) return new Map();
  const apiKey = getApiKey();
  const prepost = options?.prepost ?? false;

  // Build one batch request — all quotes in a single POST instead of N sequential GETs
  const requests: Record<string, string> = {};
  for (const sym of symbols) {
    const base = `/quote?symbol=${encodeURIComponent(sym.toUpperCase())}&apikey=${apiKey}`;
    requests[sym] = prepost ? `${base}&prepost=true` : base;
  }

  const raw = await batchFetch<TwelveDataQuoteResponse>(requests);
  const quotes = new Map<string, StockQuote>();
  for (const [sym, data] of Object.entries(raw)) {
    try {
      quotes.set(sym, parseQuoteResponse(data, sym, prepost));
    } catch {
      // Individual symbol errors don't abort the whole batch
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

// TwelveData datetimes for US stocks are in ET ("2024-04-29 09:35:00")
function classifyTradingSession(datetime: string): 'pre' | 'regular' | 'post' {
  const hhmm = datetime.length >= 16 ? datetime.slice(11, 16) : '09:30';
  if (hhmm < '09:30') return 'pre';
  if (hhmm >= '16:00') return 'post';
  return 'regular';
}

// Cache per date-string so we only call Intl once per trading day.
const _etOffsetCache = new Map<string, number>();

/**
 * Convert a TwelveData datetime string ("YYYY-MM-DD HH:MM:SS", US Eastern Time)
 * to a Unix timestamp (UTC seconds). Using new Date() directly would parse as
 * server-local time (wrong on non-ET servers), so we resolve the ET→UTC offset
 * via Intl and apply it explicitly.
 */
function etDatetimeToUnix(datetime: string): number {
  const datePart = datetime.slice(0, 10);
  let etOffsetH = _etOffsetCache.get(datePart);
  if (etOffsetH === undefined) {
    const [y, m, d] = datePart.split('-').map(Number);
    // Format noon UTC as ET to determine whether EDT (-4) or EST (-5) is active
    const noonUTC = Date.UTC(y, m - 1, d, 12, 0, 0);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date(noonUTC));
    const etNoonH = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '8');
    etOffsetH = etNoonH - 12; // EDT → -4, EST → -5
    _etOffsetCache.set(datePart, etOffsetH);
  }
  const [d, t] = datetime.split(' ');
  const [year, month, day] = d.split('-').map(Number);
  const [hour, minute, second] = (t ?? '00:00:00').split(':').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, hour - etOffsetH, minute, second) / 1000);
}

export async function getStockCandles(
  symbol: string,
  from: number,
  to: number,
  resolution: 'D' | 'W' | 'M' | '1' | '5' | '15' | '30' | '60' = 'D',
  options?: { extendedHours?: boolean; startDate?: string; endDate?: string }
): Promise<StockCandles> {
  const interval = RESOLUTION_MAP[resolution];
  const startDate = options?.startDate ?? new Date(from * 1000).toISOString().slice(0, 10);
  const endDate = options?.endDate ?? new Date(to * 1000).toISOString().slice(0, 10);

  const url = buildUrl('/time_series', {
    symbol: symbol.toUpperCase(),
    interval,
    start_date: startDate,
    end_date: endDate,
    outputsize: 5000,
    order: 'asc',
    prepost: options?.extendedHours ? '1' : undefined, // TwelveData param for pre/post market
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
  const session: Array<'pre' | 'regular' | 'post'> = [];

  for (const vv of values) {
    t.push(etDatetimeToUnix(vv.datetime));
    o.push(parseFloat(vv.open));
    h.push(parseFloat(vv.high));
    l.push(parseFloat(vv.low));
    c.push(parseFloat(vv.close));
    v.push(parseFloat(vv.volume || '0'));
    if (options?.extendedHours) {
      session.push(classifyTradingSession(vv.datetime));
    }
  }

  return {
    c,
    h,
    l,
    o,
    s: 'ok',
    t,
    v,
    ...(options?.extendedHours ? { session } : {}),
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

// -------- Market Movers --------

// Mega-cap stocks (~top 50 by market cap) — ensures movers are always large-cap.
// A 3% move by NVDA is more important than a 50% move by a $500M-cap company.
const MEGA_CAP_TICKERS = [
  'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'BRK.B',
  'TSLA', 'AVGO', 'LLY', 'JPM', 'WMT', 'V', 'MA', 'UNH', 'XOM',
  'COST', 'ORCL', 'HD', 'PG', 'JNJ', 'BAC', 'NFLX', 'ABBV',
  'CRM', 'AMD', 'MRK', 'CVX', 'KO', 'CSCO', 'PEP', 'TMO', 'ADBE',
  'ACN', 'LIN', 'MCD', 'ABT', 'NOW', 'PM', 'TXN', 'NEE', 'GS',
  'IBM', 'RTX', 'ISRG', 'INTU', 'AMGN', 'CAT', 'SPGI',
];

/**
 * Returns today's top gainers/losers from the mega-cap universe.
 *
 * Uses batch quotes for MEGA_CAP_TICKERS instead of the /market_movers/stocks
 * endpoint, which returns biggest % movers and tends to surface small-cap stocks
 * with extreme moves. Fetching quotes for a curated large-cap list guarantees
 * results are market-cap-significant (Nvidia at +3% beats a $500M company at +50%).
 *
 * Sort key: |changePercent| × dollarVolume — weights both the size of the move
 * and the market importance of the company.
 */
export async function getMarketMovers(
  _market: 'stocks' | 'etf' = 'stocks',
  limit: number = 5
): Promise<TopMovers> {
  return getTopMoversForSymbols(MEGA_CAP_TICKERS, limit);
}

// -------- Top movers (computed from quotes) --------

export async function getTopMovers(limit: number = 5): Promise<TopMovers> {
  return getMarketMovers('stocks', limit);
}

/** True when the ET clock is in an active pre- or post-market window (weekdays only). */
function isExtendedHoursET(): boolean {
  const etStr = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
  const [h, m] = etStr.split(':').map(Number);
  const etMins = h * 60 + m;
  const day = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
  if (day === 0 || day === 6) return false;
  return (etMins >= 240 && etMins < 570) || (etMins >= 960 && etMins < 1200);
}

export async function getTopMoversForSymbols(
  symbols: string[],
  limit: number = 5
): Promise<TopMovers> {
  if (symbols.length === 0) return { gainers: [], losers: [] };
  const prepost = isExtendedHoursET();
  const quotes = await getStockQuotes(symbols, { prepost });
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

  // Seed WsManager prevClose so the WebSocket stream can compute change on first tick.
  // Dynamic import keeps the ws package out of any client bundle.
  if (typeof window === 'undefined') {
    try {
      const { WsManager } = await import('@/lib/market-data/ws-manager');
      for (const m of movers) {
        WsManager.seedPrevClose(m.symbol, m.previousClose);
      }
    } catch {
      // Non-critical — stream will still show REST data as fallback
    }
  }

  // Sort by |changePercent| descending within the (already large-cap) universe.
  // When called with MEGA_CAP_TICKERS, any stock here is already market-significant,
  // so pure % change is the right ranking criterion.
  const gainers = movers
    .filter((m) => m.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);
  const losers = movers
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
  _from: string,
  _to: string,
  symbol?: string
): Promise<EarningsCalendar[]> {
  if (!symbol) return [];

  // Use /earnings (per-symbol, 20 credits) — returns past + upcoming events in one call.
  // /earnings_calendar is a global date-range endpoint with a completely different response shape.
  const url = buildUrl('/earnings', { symbol: symbol.toUpperCase(), outputsize: 8 });
  const response = await fetch(url);
  logUsage('earnings', symbol);

  interface EarningsApiItem { date: string; time?: string; eps_estimate?: number | null; eps_actual?: number | null; }
  interface EarningsApiResponse { earnings?: EarningsApiItem[]; status?: string; code?: number; message?: string; }
  const data = (await response.json()) as EarningsApiResponse;

  if (!response.ok || data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data earnings error for ${symbol}`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }

  return (data.earnings ?? []).map((item) => {
    const [yearStr, monthStr] = item.date.split('-');
    const year = parseInt(yearStr || '0', 10);
    const month = parseInt(monthStr || '0', 10);
    const quarter = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
    return {
      date: item.date,
      epsActual: item.eps_actual ?? null,
      epsEstimate: item.eps_estimate ?? null,
      hour: item.time ?? '',
      quarter,
      revenueActual: null,
      revenueEstimate: null,
      symbol: symbol.toUpperCase(),
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

// -------- Statistics --------

export interface CompanyStatistics {
  symbol: string;
  marketCap: number | null;
  enterpriseValue: number | null;
  peRatioTTM: number | null;
  peRatioForward: number | null;
  pbRatio: number | null;
  evToEbitda: number | null;
  beta: number | null;
  week52High: number | null;
  week52Low: number | null;
  avgVolume: number | null;
  sharesFloat: number | null;
  shortRatio: number | null;
  dividendYield: number | null;
  profitMargin: number | null;
  revenueGrowthTTM: number | null;
  epsGrowthTTM: number | null;
}

interface TwelveDataStatisticsResponse {
  statistics?: {
    valuations_metrics?: {
      market_capitalization?: number | null;
      enterprise_value?: number | null;
      trailing_pe?: number | null;
      forward_pe?: number | null;
      price_to_book_mrq?: number | null;
      enterprise_to_ebitda?: number | null;
    };
    stock_statistics?: {
      avg_10_volume?: number | null;
      avg_90_volume?: number | null;
      float_shares?: number | null;
      short_ratio?: number | null;
    };
    stock_price_summary?: {
      beta?: number | null;
      fifty_two_week_high?: number | null;
      fifty_two_week_low?: number | null;
    };
    dividends_and_splits?: {
      forward_annual_dividend_yield?: number | null;
    };
    financials?: {
      profit_margin?: number | null;
      income_statement?: {
        quarterly_revenue_growth?: number | null;
        quarterly_earnings_growth_yoy?: number | null;
      };
    };
  };
  status?: string;
  code?: number;
  message?: string;
}

export async function getStatistics(symbol: string): Promise<CompanyStatistics> {
  logUsage('statistics', symbol);
  const url = buildUrl('/statistics', { symbol: symbol.toUpperCase() });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataStatisticsResponse;

  if (!response.ok || data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data statistics error for ${symbol}`;
    const isRateLimit = data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg);
    if (isRateLimit) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }

  const stats = data.statistics ?? {};
  const v = stats.valuations_metrics ?? {};
  const s = stats.stock_statistics ?? {};
  const sp = stats.stock_price_summary ?? {};
  const d = stats.dividends_and_splits ?? {};
  const f = stats.financials ?? {};
  const fi = f.income_statement ?? {};

  return {
    symbol,
    marketCap: v.market_capitalization ?? null,
    enterpriseValue: v.enterprise_value ?? null,
    peRatioTTM: v.trailing_pe ?? null,
    peRatioForward: v.forward_pe ?? null,
    pbRatio: v.price_to_book_mrq ?? null,
    evToEbitda: v.enterprise_to_ebitda ?? null,
    beta: sp.beta ?? null,
    week52High: sp.fifty_two_week_high ?? null,
    week52Low: sp.fifty_two_week_low ?? null,
    avgVolume: s.avg_90_volume ?? null,
    sharesFloat: s.float_shares ?? null,
    shortRatio: s.short_ratio ?? null,
    dividendYield: d.forward_annual_dividend_yield ?? null,
    profitMargin: f.profit_margin ?? null,
    revenueGrowthTTM: fi.quarterly_revenue_growth ?? null,
    epsGrowthTTM: fi.quarterly_earnings_growth_yoy ?? null,
  };
}

// -------- Income Statement --------

export interface IncomeStatementPeriod {
  fiscal_date: string;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  ebitda: number | null;
  eps_basic: number | null;
  eps_diluted: number | null;
  r_and_d_expenses: number | null;
  selling_general_administrative_expenses: number | null;
  interest_expense: number | null;
  income_tax_expense: number | null;
}

interface TwelveDataIncomeItem {
  fiscal_date?: string;
  sales?: number | null;
  gross_profit?: number | null;
  operating_income?: number | null;
  net_income?: number | null;
  ebitda?: number | null;
  eps_basic?: number | null;
  eps_diluted?: number | null;
  operating_expense?: {
    research_and_development?: number | null;
    selling_general_and_administrative?: number | null;
  };
  non_operating_interest?: {
    expense?: number | null;
  };
  income_tax?: number | null;
}

interface TwelveDataIncomeResponse {
  income_statement?: TwelveDataIncomeItem[];
  status?: string;
  code?: number;
  message?: string;
}

export async function getIncomeStatement(
  symbol: string,
  period: 'quarterly' | 'annual' = 'quarterly'
): Promise<IncomeStatementPeriod[]> {
  logUsage('income_statement', symbol);
  const url = buildUrl('/income_statement', {
    symbol: symbol.toUpperCase(),
    period,
    outputsize: 4,
  });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataIncomeResponse;

  if (!response.ok || data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data income statement error for ${symbol}`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }

  return (data.income_statement ?? []).map((item) => ({
    fiscal_date: item.fiscal_date ?? '',
    revenue: item.sales ?? null,
    gross_profit: item.gross_profit ?? null,
    operating_income: item.operating_income ?? null,
    net_income: item.net_income ?? null,
    ebitda: item.ebitda ?? null,
    eps_basic: item.eps_basic ?? null,
    eps_diluted: item.eps_diluted ?? null,
    r_and_d_expenses: item.operating_expense?.research_and_development ?? null,
    selling_general_administrative_expenses: item.operating_expense?.selling_general_and_administrative ?? null,
    interest_expense: item.non_operating_interest?.expense ?? null,
    income_tax_expense: item.income_tax ?? null,
  }));
}

// -------- Balance Sheet --------

export interface BalanceSheetPeriod {
  fiscal_date: string;
  total_assets: number | null;
  total_current_assets: number | null;
  cash_and_equivalents: number | null;
  total_liabilities: number | null;
  total_current_liabilities: number | null;
  long_term_debt: number | null;
  total_stockholders_equity: number | null;
  retained_earnings: number | null;
  goodwill_and_intangible_assets: number | null;
}

interface TwelveDataBalanceItem {
  fiscal_date?: string;
  assets?: {
    current_assets?: {
      cash_and_cash_equivalents?: number | null;
      total_current_assets?: number | null;
    };
    non_current_assets?: {
      goodwill?: number | null;
      intangible_assets?: number | null;
    };
    total_assets?: number | null;
  };
  liabilities?: {
    current_liabilities?: {
      total_current_liabilities?: number | null;
    };
    non_current_liabilities?: {
      long_term_debt?: number | null;
    };
    total_liabilities?: number | null;
  };
  shareholders_equity?: {
    total_shareholders_equity?: number | null;
    retained_earnings?: number | null;
  };
}

interface TwelveDataBalanceResponse {
  balance_sheet?: TwelveDataBalanceItem[];
  status?: string;
  code?: number;
  message?: string;
}

export async function getBalanceSheet(
  symbol: string,
  period: 'quarterly' | 'annual' = 'quarterly'
): Promise<BalanceSheetPeriod[]> {
  logUsage('balance_sheet', symbol);
  const url = buildUrl('/balance_sheet', {
    symbol: symbol.toUpperCase(),
    period,
    outputsize: 4,
  });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataBalanceResponse;

  if (!response.ok || data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data balance sheet error for ${symbol}`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }

  return (data.balance_sheet ?? []).map((item) => ({
    fiscal_date: item.fiscal_date ?? '',
    total_assets: item.assets?.total_assets ?? null,
    total_current_assets: item.assets?.current_assets?.total_current_assets ?? null,
    cash_and_equivalents: item.assets?.current_assets?.cash_and_cash_equivalents ?? null,
    total_liabilities: item.liabilities?.total_liabilities ?? null,
    total_current_liabilities: item.liabilities?.current_liabilities?.total_current_liabilities ?? null,
    long_term_debt: item.liabilities?.non_current_liabilities?.long_term_debt ?? null,
    total_stockholders_equity: item.shareholders_equity?.total_shareholders_equity ?? null,
    retained_earnings: item.shareholders_equity?.retained_earnings ?? null,
    goodwill_and_intangible_assets:
      (item.assets?.non_current_assets?.goodwill ?? 0) +
      (item.assets?.non_current_assets?.intangible_assets ?? 0) || null,
  }));
}

// -------- Cash Flow --------

export interface CashFlowPeriod {
  fiscal_date: string;
  net_income: number | null;
  depreciation_and_amortization: number | null;
  operating_cash_flow: number | null;
  capital_expenditures: number | null;
  free_cash_flow: number | null;
  investing_activities_cash_flow: number | null;
  financing_activities_cash_flow: number | null;
  dividends_paid: number | null;
}

interface TwelveDataCashFlowItem {
  fiscal_date?: string;
  free_cash_flow?: number | null;
  operating_activities?: {
    net_income?: number | null;
    depreciation?: number | null;
    operating_cash_flow?: number | null;
  };
  investing_activities?: {
    capital_expenditures?: number | null;
    investing_cash_flow?: number | null;
  };
  financing_activities?: {
    common_dividends?: number | null;
    financing_cash_flow?: number | null;
  };
}

interface TwelveDataCashFlowResponse {
  cash_flow?: TwelveDataCashFlowItem[];
  status?: string;
  code?: number;
  message?: string;
}

export async function getCashFlow(
  symbol: string,
  period: 'quarterly' | 'annual' = 'quarterly'
): Promise<CashFlowPeriod[]> {
  logUsage('cash_flow', symbol);
  const url = buildUrl('/cash_flow', {
    symbol: symbol.toUpperCase(),
    period,
    outputsize: 4,
  });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataCashFlowResponse;

  if (!response.ok || data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data cash flow error for ${symbol}`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }

  return (data.cash_flow ?? []).map((item) => ({
    fiscal_date: item.fiscal_date ?? '',
    net_income: item.operating_activities?.net_income ?? null,
    depreciation_and_amortization: item.operating_activities?.depreciation ?? null,
    operating_cash_flow: item.operating_activities?.operating_cash_flow ?? null,
    capital_expenditures: item.investing_activities?.capital_expenditures ?? null,
    free_cash_flow: item.free_cash_flow ?? null,
    investing_activities_cash_flow: item.investing_activities?.investing_cash_flow ?? null,
    financing_activities_cash_flow: item.financing_activities?.financing_cash_flow ?? null,
    dividends_paid: item.financing_activities?.common_dividends ?? null,
  }));
}

// -------- Dividends --------

export interface DividendItem {
  ex_dividend_date: string;
  payment_date: string | null;
  record_date: string | null;
  declaration_date: string | null;
  amount: number;
  currency: string;
}

interface TwelveDataDividendItem {
  ex_date?: string;           // current field name returned by /dividends
  ex_dividend_date?: string;  // legacy field name (kept as a fallback)
  payment_date?: string | null;
  record_date?: string | null;
  declaration_date?: string | null;
  amount?: number;
  currency?: string;
}

interface TwelveDataDividendsResponse {
  dividends?: TwelveDataDividendItem[];
  status?: string;
  code?: number;
  message?: string;
}

export async function getDividends(symbol: string): Promise<DividendItem[]> {
  logUsage('dividends', symbol);
  // /dividends defaults to a single (most recent) record and does NOT honour
  // `outputsize`; a date range is required to get real history. Fetch ~6y so
  // TTM yield and the dividend-history table both have enough data.
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 6);
  const url = buildUrl('/dividends', {
    symbol: symbol.toUpperCase(),
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataDividendsResponse;

  if (!response.ok || data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data dividends error for ${symbol}`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }

  return (data.dividends ?? []).map((item) => ({
    // The API returns `ex_date`; older responses used `ex_dividend_date`.
    ex_dividend_date: item.ex_date ?? item.ex_dividend_date ?? '',
    payment_date: item.payment_date ?? null,
    record_date: item.record_date ?? null,
    declaration_date: item.declaration_date ?? null,
    amount: item.amount ?? 0,
    currency: item.currency ?? 'USD',
  }));
}

// -------- Company Profile --------

export interface CompanyProfile {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  ceo: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip: string | null;
  employees: number | null;
  ipo_date: string | null;
  type: string | null;
  logo: string | null;
}

interface TwelveDataProfileResponse {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  sector?: string;
  industry?: string;
  description?: string;
  CEO?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  employees?: number | string;
  IPO_date?: string;
  type?: string;
  logo?: string;
  status?: string;
  code?: number;
  message?: string;
}

export async function getCompanyProfile(symbol: string): Promise<CompanyProfile> {
  logUsage('profile', symbol);
  const url = buildUrl('/profile', { symbol: symbol.toUpperCase() });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataProfileResponse;

  if (!response.ok || data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data profile error for ${symbol}`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }

  return {
    symbol: data.symbol ?? symbol,
    name: data.name ?? symbol,
    exchange: data.exchange ?? '',
    currency: data.currency ?? 'USD',
    sector: data.sector ?? null,
    industry: data.industry ?? null,
    description: data.description ?? null,
    ceo: data.CEO ?? null,
    website: data.website ?? null,
    address: data.address ?? null,
    city: data.city ?? null,
    state: data.state ?? null,
    country: data.country ?? null,
    zip: data.zip ?? null,
    employees: data.employees ? Number(data.employees) : null,
    ipo_date: data.IPO_date ?? null,
    type: data.type ?? null,
    logo: data.logo ?? null,
  };
}

// -------- Key Executives --------

export interface KeyExecutive {
  name: string;
  title: string;
  age: number | null;
  gender: string | null;
  total_compensation: number | null;
  currency: string;
}

interface TwelveDataExecutive {
  name?: string;
  title?: string;
  age?: number | null;
  gender?: string | null;
  total_compensation?: number | null;
  currency?: string;
}

interface TwelveDataExecutivesResponse {
  symbol?: string;
  executives?: TwelveDataExecutive[];
  status?: string;
  code?: number;
  message?: string;
}

export async function getKeyExecutives(symbol: string): Promise<KeyExecutive[]> {
  logUsage('key_executives', symbol);
  const url = buildUrl('/key_executives', { symbol: symbol.toUpperCase() });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataExecutivesResponse;

  if (!response.ok || data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data executives error for ${symbol}`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }

  return (data.executives ?? []).map((e) => ({
    name: e.name ?? '',
    title: e.title ?? '',
    age: e.age ?? null,
    gender: e.gender ?? null,
    total_compensation: e.total_compensation ?? null,
    currency: e.currency ?? 'USD',
  }));
}

// -------- Logo --------

export interface TwelveDataLogoResponse {
  url?: string;         // Direct CDN URL to logo image (stocks)
  logo_base?: string;   // For crypto/forex base currency
  logo_quote?: string;  // For crypto/forex quote currency
}

/**
 * Fetch the logo URL for a stock symbol.
 * Endpoint: GET /logo
 * Cost: 1 API credit per symbol.
 * Returns the direct CDN URL (no API key required to load the image itself).
 */
export async function getLogoUrl(symbol: string): Promise<string | null> {
  logUsage('/logo', symbol);
  const url = buildUrl('/logo', { symbol: symbol.toUpperCase() });
  const res = await fetch(url, {
    next: { revalidate: 86400 }, // cache 24 h server-side
  });
  if (!res.ok) return null;
  const json = (await res.json()) as TwelveDataLogoResponse & { status?: string };
  if (json.status === 'error') return null;
  return json.url ?? json.logo_base ?? null;
}

// -------- Symbol Search --------

export interface SymbolSearchResult {
  symbol: string;
  instrument_name: string;
  exchange: string;
  mic_code: string;
  exchange_timezone: string;
  instrument_type: string;
  country: string;
  currency: string;
}

/**
 * Search for financial instruments by ticker or name.
 * Endpoint: GET /symbol_search
 * Cost: 1 API credit per request.
 */
export async function symbolSearch(
  query: string,
  outputsize = 20
): Promise<SymbolSearchResult[]> {
  logUsage('/symbol_search', query);
  const url = buildUrl('/symbol_search', { symbol: query, outputsize });
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TwelveData symbol_search HTTP ${res.status}`);
  const json = (await res.json()) as { data?: SymbolSearchResult[]; status?: string; message?: string };
  if (json.status === 'error') throw new Error(json.message ?? 'TwelveData symbol_search error');
  return json.data ?? [];
}

// -------- Stocks reference list --------

export interface StockReference {
  symbol: string;
  name: string;
  exchange: string;
  mic_code: string;
  country: string;
  currency: string;
  type: string;
}

interface TwelveDataStocksResponse {
  data?: Array<{
    symbol?: string;
    name?: string;
    exchange?: string;
    mic_code?: string;
    country?: string;
    currency?: string;
    type?: string;
  }>;
  status?: string;
  message?: string;
}

/**
 * Fetch the TwelveData stocks reference list (not market data — the catalogue of
 * listed instruments). Used to seed the screener universe table.
 * Endpoint: GET /stocks. Reference data — very low credit cost.
 */
export async function getUsStocksList(
  opts: { country?: string; exchange?: string } = {}
): Promise<StockReference[]> {
  logUsage('/stocks', opts.exchange ?? opts.country ?? 'all');
  const url = buildUrl('/stocks', {
    country: opts.country ?? 'United States',
    exchange: opts.exchange,
  });
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TwelveData /stocks HTTP ${res.status}`);
  const json = (await res.json()) as TwelveDataStocksResponse;
  if (json.status === 'error') throw new Error(json.message ?? 'TwelveData /stocks error');
  return (json.data ?? []).map((d) => ({
    symbol: d.symbol ?? '',
    name: d.name ?? d.symbol ?? '',
    exchange: d.exchange ?? '',
    mic_code: d.mic_code ?? '',
    country: d.country ?? '',
    currency: d.currency ?? '',
    type: d.type ?? '',
  })).filter((d) => d.symbol);
}

// -------- Press Releases --------

export interface PressRelease {
  title: string;
  published_at: string;
  /** Present when the provider returns a direct link; otherwise the card shows text only. */
  url?: string;
  snippet?: string;
}

interface TwelveDataPressRelease {
  id?: string;
  title?: string;
  /** Current API field (ISO 8601) */
  datetime?: string;
  /** Legacy/alternate field name */
  published_at?: string;
  body?: string;
  url?: string;
  link?: string;
  snippet?: string;
}

interface TwelveDataPressReleasesResponse {
  /** Current Twelve Data shape (see /press_releases docs) */
  press_releases?: TwelveDataPressRelease[];
  /** Legacy shape — keep for compatibility */
  data?: TwelveDataPressRelease[];
  status?: string;
  code?: number;
  message?: string;
}

function pressReleasePlainSnippet(html: string | undefined, maxLen: number): string | undefined {
  if (!html) return undefined;
  const plain = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return undefined;
  return plain.length <= maxLen ? plain : `${plain.slice(0, maxLen - 1)}…`;
}

function isTwelveDataHttpError(json: TwelveDataPressReleasesResponse, res: Response): boolean {
  if (!res.ok) return true;
  if (json.status === 'error') return true;
  if (typeof json.code === 'number' && json.code >= 400) return true;
  return false;
}

/**
 * GET /press_releases — official company press releases.
 * Cost: 1 API credit per request. Available from Basic+ (Venture included).
 * Response uses `press_releases` (not `data`); items use `datetime` and HTML `body`.
 */
export async function getPressReleases(
  symbol: string,
  outputsize = 10
): Promise<PressRelease[]> {
  const sym = symbol.toUpperCase();
  logUsage('/press_releases', sym);
  const cappedSize = Math.min(Math.max(outputsize, 1), 10);
  const url = buildUrl('/press_releases', { symbol: sym, outputsize: cappedSize });
  const res = await fetch(url, { next: { revalidate: 3600 } }); // cache 1 h
  const json = (await res.json()) as TwelveDataPressReleasesResponse;
  if (isTwelveDataHttpError(json, res)) {
    const msg = json.message ?? `press_releases error: ${res.status}`;
    if (/rate.?limit|credits? exceeded/i.test(msg) || json.code === 429) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }

  const rows = json.press_releases ?? json.data ?? [];

  return rows.map((r) => {
    const title = r.title ?? '';
    const published_at = r.datetime ?? r.published_at ?? '';
    const snippet = r.snippet ?? pressReleasePlainSnippet(r.body, 220);
    const urlField = (r.url ?? r.link ?? '').trim();
    return {
      title,
      published_at,
      ...(urlField ? { url: urlField } : {}),
      snippet,
    };
  });
}

// -------- Splits --------

export interface SplitItem {
  date: string;
  ratio: string;
  from_factor: number;
  to_factor: number;
}

interface TwelveDataSplitItem {
  date?: string;
  ratio?: string;
  from_factor?: number | string;
  to_factor?: number | string;
}

interface TwelveDataSplitsResponse {
  symbol?: string;
  splits?: TwelveDataSplitItem[];
  status?: string;
  code?: number;
  message?: string;
}

/**
 * GET /splits — historical stock splits.
 * Cost: 20 API credits per request. Available on Venture and above.
 */
export async function getSplits(symbol: string): Promise<SplitItem[]> {
  logUsage('/splits', symbol);
  const url = buildUrl('/splits', { symbol: symbol.toUpperCase() });
  const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24 h
  const json = (await res.json()) as TwelveDataSplitsResponse;
  if (!res.ok || json.code || json.status === 'error') {
    const msg = json.message ?? `splits error: ${res.status}`;
    if (/rate.?limit|credits? exceeded/i.test(msg)) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }
  return (json.splits ?? []).map((s) => ({
    date: s.date ?? '',
    ratio: s.ratio ?? '',
    from_factor: Number(s.from_factor ?? 0),
    to_factor: Number(s.to_factor ?? 0),
  }));
}

// -------- Technical Indicators --------

export interface IndicatorValue {
  datetime: string;
  [key: string]: string | number;
}

interface TwelveDataIndicatorResponse {
  values?: Array<Record<string, string>>;
  status?: string;
  code?: number;
  message?: string;
  meta?: Record<string, unknown>;
}

/**
 * Generic technical indicator fetcher.
 * Endpoint: GET /<indicator> (e.g. /sma, /ema, /rsi, /macd, /bbands)
 * Cost: 1 credit per request.
 */
export async function getIndicator(
  symbol: string,
  indicator: string,
  params: Record<string, string | number> = {}
): Promise<{ values: IndicatorValue[]; meta: Record<string, unknown> }> {
  logUsage(`/${indicator}`, symbol);
  const url = buildUrl(`/${indicator}`, { symbol: symbol.toUpperCase(), ...params });
  const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5 min
  const json = (await res.json()) as TwelveDataIndicatorResponse;
  const apiFailed =
    !res.ok ||
    json.status === 'error' ||
    (typeof json.code === 'number' && json.code >= 400);
  if (apiFailed) {
    const msg = json.message ?? `${indicator} error: ${res.status}`;
    if (/rate.?limit|credits? exceeded/i.test(msg) || json.code === 429) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }
  const values = (json.values ?? []).map((v) => {
    const entry: IndicatorValue = { datetime: v.datetime ?? '' };
    for (const [k, val] of Object.entries(v)) {
      if (k === 'datetime') continue;
      if (typeof val === 'string') {
        const n = parseFloat(val);
        entry[k] = Number.isFinite(n) ? n : val;
      } else if (typeof val === 'number') {
        entry[k] = val;
      }
    }
    return entry;
  });
  return { values, meta: (json.meta as Record<string, unknown>) ?? {} };
}

// -------- Calendar endpoints (for Market Events Calendar page) --------

export interface EarningsCalendarItem {
  symbol: string;
  name?: string;
  date: string;
  time?: string;
  eps_estimate?: number | null;
  eps_actual?: number | null;
  revenue_estimate?: number | null;
  revenue_actual?: number | null;
  fiscal_quarter?: string;
  surprise?: number | null;
}

/**
 * Single entry inside a date bucket in the /earnings_calendar response.
 * The API returns earnings as a map: { "2026-04-14": [item, ...], ... }
 */
interface TwelveDataEarningsCalItem {
  symbol?: string;
  name?: string;
  currency?: string;
  exchange?: string;
  mic_code?: string;
  country?: string;
  time?: string;
  eps_estimate?: number | null;
  eps_actual?: number | null;
  /** eps_actual − eps_estimate */
  difference?: number | null;
  /** Surprise as a percentage */
  surprise_prc?: number | null;
}

interface TwelveDataEarningsCalResponse {
  /** Map of date strings → array of earnings items */
  earnings?: Record<string, TwelveDataEarningsCalItem[]>;
  status?: string;
  code?: number;
  message?: string;
}

/**
 * GET /earnings_calendar — upcoming earnings announcements across all stocks.
 * Cost: 40 credits per request. Available on Venture+.
 * Response shape: { earnings: { "YYYY-MM-DD": [...items] }, status: "ok" }
 */
export async function getEarningsCalendarRange(
  startDate: string,
  endDate: string,
  country = 'United States'
): Promise<EarningsCalendarItem[]> {
  logUsage('/earnings_calendar', `${startDate}..${endDate}`);
  const url = buildUrl('/earnings_calendar', {
    start_date: startDate,
    end_date: endDate,
    country,
  });
  const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24 h — earnings calendars are set in advance
  const json = (await res.json()) as TwelveDataEarningsCalResponse;

  const apiFailed =
    !res.ok ||
    json.status === 'error' ||
    (typeof json.code === 'number' && json.code >= 400);
  if (apiFailed) {
    const msg = json.message ?? `earnings_calendar error: ${res.status}`;
    if (/rate.?limit|credits? exceeded/i.test(msg) || json.code === 429) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }

  // Flatten date-bucketed map → single sorted array
  const earningsMap = json.earnings ?? {};
  const raw: EarningsCalendarItem[] = [];

  for (const [date, entries] of Object.entries(earningsMap)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      raw.push({
        symbol: e.symbol ?? '',
        name: e.name,
        date,
        time: e.time,
        eps_estimate: e.eps_estimate ?? null,
        eps_actual: e.eps_actual ?? null,
        revenue_estimate: null,
        revenue_actual: null,
        fiscal_quarter: undefined,
        surprise: e.surprise_prc ?? null,
      });
    }
  }

  const items = deduplicateEarnings(raw);

  // Sort chronologically then alphabetically by symbol
  items.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  return items;
}

/**
 * Strip market-specific suffixes from a company name so that duplicate
 * listings of the same company can be identified.
 * e.g. "Apple Inc. CEDEAR", "Apple Inc. BDR", "Apple Inc." → all map to "apple inc"
 */
function normalizeCompanyName(name: string | undefined): string {
  if (!name) return '';
  return name
    .replace(/\s+(BDR|CEDEAR|ADR|ADS|GDR|ETF|FUND|REIT)\b.*/i, '')
    .replace(/[.,]?\s*(Inc|Corp|Ltd|LLC|PLC|SA|AG|NV|SE|Co)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Score a ticker to prefer the primary (US-exchange) listing.
 * Higher = more preferred.
 *   +20  purely alphabetic (no digits) — primary US listing
 *   +10  has EPS estimate or actual data
 *    -5  per digit in the symbol (BDR/CEDEAR tickers often end in "34", "3L" etc.)
 *    -5  name contains BDR / CEDEAR / ADR suffix
 *    -1  per extra character beyond 4 (penalises long regional variants)
 */
function tickerScore(item: EarningsCalendarItem): number {
  let score = 0;
  if (/^[A-Z]+$/.test(item.symbol)) score += 20;
  if (item.eps_estimate != null || item.eps_actual != null) score += 10;
  const digits = (item.symbol.match(/\d/g) ?? []).length;
  score -= digits * 5;
  if (/\b(BDR|CEDEAR)\b/i.test(item.name ?? '')) score -= 5;
  score -= Math.max(0, item.symbol.length - 4);
  return score;
}

/**
 * For each (normalized company name + date) pair keep only the highest-scoring
 * ticker, eliminating duplicate listings (BDR, CEDEAR, regional variants).
 */
function deduplicateEarnings(items: EarningsCalendarItem[]): EarningsCalendarItem[] {
  // key = normalizedName + '|' + date
  const best = new Map<string, EarningsCalendarItem>();

  for (const item of items) {
    const key = `${normalizeCompanyName(item.name)}|${item.date}`;
    const current = best.get(key);
    if (!current || tickerScore(item) > tickerScore(current)) {
      best.set(key, item);
    }
  }

  return Array.from(best.values());
}

export interface DividendsCalendarItem {
  symbol: string;
  name?: string;
  ex_dividend_date: string;
  dividend_amount?: number | null;
  payment_date?: string;
  frequency?: string;
}

interface TwelveDataDivCalItem {
  symbol?: string;
  name?: string;
  ex_dividend_date?: string;
  dividend?: string | number | null;
  payment_date?: string;
  frequency?: string;
}

interface TwelveDataDivCalResponse {
  dividends?: TwelveDataDivCalItem[];
  status?: string;
  code?: number;
  message?: string;
}

/**
 * GET /dividends_calendar — upcoming ex-dividend dates.
 * Cost: 40 credits per request. Available on Venture+.
 */
export async function getDividendsCalendar(
  startDate: string,
  endDate: string
): Promise<DividendsCalendarItem[]> {
  logUsage('/dividends_calendar', `${startDate}..${endDate}`);
  const url = buildUrl('/dividends_calendar', { start_date: startDate, end_date: endDate });
  const res = await fetch(url, { next: { revalidate: 3600 } });
  const json = (await res.json()) as TwelveDataDivCalResponse;
  const divFailed = !res.ok || json.status === 'error' || (typeof json.code === 'number' && json.code >= 400);
  if (divFailed) {
    const msg = json.message ?? `dividends_calendar error: ${res.status}`;
    if (/rate.?limit|credits? exceeded/i.test(msg) || json.code === 429) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }
  return (json.dividends ?? []).map((d) => ({
    symbol: d.symbol ?? '',
    name: d.name,
    ex_dividend_date: d.ex_dividend_date ?? '',
    dividend_amount: d.dividend != null ? Number(d.dividend) : null,
    payment_date: d.payment_date,
    frequency: d.frequency,
  }));
}

export interface SplitsCalendarItem {
  symbol: string;
  name?: string;
  date: string;
  ratio?: string;
  from_factor?: number;
  to_factor?: number;
}

interface TwelveDataSplitsCalResponse {
  splits?: Array<{
    symbol?: string;
    name?: string;
    date?: string;
    ratio?: string;
    from_factor?: number | string;
    to_factor?: number | string;
  }>;
  status?: string;
  code?: number;
  message?: string;
}

/**
 * GET /splits_calendar — upcoming stock splits.
 * Cost: 40 credits per request. Available on Venture+.
 */
export async function getSplitsCalendar(
  startDate: string,
  endDate: string
): Promise<SplitsCalendarItem[]> {
  logUsage('/splits_calendar', `${startDate}..${endDate}`);
  const url = buildUrl('/splits_calendar', { start_date: startDate, end_date: endDate });
  const res = await fetch(url, { next: { revalidate: 3600 } });
  const json = (await res.json()) as TwelveDataSplitsCalResponse;
  const splitsFailed = !res.ok || json.status === 'error' || (typeof json.code === 'number' && json.code >= 400);
  if (splitsFailed) {
    const msg = json.message ?? `splits_calendar error: ${res.status}`;
    if (/rate.?limit|credits? exceeded/i.test(msg) || json.code === 429) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }
  return (json.splits ?? []).map((s) => ({
    symbol: s.symbol ?? '',
    name: s.name,
    date: s.date ?? '',
    ratio: s.ratio,
    from_factor: s.from_factor != null ? Number(s.from_factor) : undefined,
    to_factor: s.to_factor != null ? Number(s.to_factor) : undefined,
  }));
}

export interface IPOCalendarItem {
  symbol: string;
  name?: string;
  date: string;
  exchange?: string;
  price_from?: number | null;
  price_to?: number | null;
  shares?: number | null;
  status?: string;
}

interface TwelveDataIPOCalResponse {
  ipos?: Array<{
    symbol?: string;
    name?: string;
    date?: string;
    exchange?: string;
    price_from?: string | number | null;
    price_to?: string | number | null;
    shares?: string | number | null;
    status?: string;
  }>;
  status?: string;
  code?: number;
  message?: string;
}

/**
 * GET /ipo_calendar — upcoming IPOs.
 * Cost: 40 credits per request. Available on Venture+.
 */
export async function getIPOCalendar(
  startDate: string,
  endDate: string
): Promise<IPOCalendarItem[]> {
  logUsage('/ipo_calendar', `${startDate}..${endDate}`);
  const url = buildUrl('/ipo_calendar', { start_date: startDate, end_date: endDate });
  const res = await fetch(url, { next: { revalidate: 3600 } });
  const json = (await res.json()) as TwelveDataIPOCalResponse;
  const ipoFailed = !res.ok || json.status === 'error' || (typeof json.code === 'number' && json.code >= 400);
  if (ipoFailed) {
    const msg = json.message ?? `ipo_calendar error: ${res.status}`;
    if (/rate.?limit|credits? exceeded/i.test(msg) || json.code === 429) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }
  return (json.ipos ?? []).map((i) => ({
    symbol: i.symbol ?? '',
    name: i.name,
    date: i.date ?? '',
    exchange: i.exchange,
    price_from: i.price_from != null ? Number(i.price_from) : null,
    price_to: i.price_to != null ? Number(i.price_to) : null,
    shares: i.shares != null ? Number(i.shares) : null,
    status: i.status,
  }));
}

// -------- Pre/After-Market Quotes --------

export interface ExtendedHoursQuote {
  symbol: string;
  pre_or_post: 'pre' | 'post';
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  timestamp?: number;
}

interface TwelveDataQuoteExtended extends TwelveDataQuoteResponse {
  extended_change?: string;
  extended_percent_change?: string;
  extended_price?: string;
  extended_timestamp?: number;
  is_market_open?: boolean;
}

/**
 * Fetch extended-hours (pre/after-market) quote data.
 * Uses the standard /quote endpoint which returns extended_* fields.
 * Extended fields are only populated outside regular market hours.
 */
export async function getExtendedHoursQuote(
  symbol: string
): Promise<ExtendedHoursQuote | null> {
  logUsage('/quote (extended)', symbol);
  // prepost=true is required for TwelveData to include extended_* fields (Pro plan+).
  const url = buildUrl('/quote', { symbol: symbol.toUpperCase(), prepost: 'true' });
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as TwelveDataQuoteExtended;
  if (data.status === 'error' || data.code) return null;

  const extPrice = parseFloat(data.extended_price ?? '0');
  if (!extPrice) return null;

  // Skip stale extended data when the regular session is currently active.
  if (data.is_market_open) return null;

  // Determine pre vs post from ET clock time. 4:00 AM – 9:30 AM ET = pre, else post.
  const etTimeStr = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  const [etHStr, etMStr] = etTimeStr.split(':');
  const etMins = parseInt(etHStr, 10) * 60 + parseInt(etMStr, 10);
  const preOrPost: 'pre' | 'post' = etMins >= 240 && etMins < 570 ? 'pre' : 'post';

  const extChange = parseFloat(data.extended_change ?? '0');
  const extChangePct = parseFloat(data.extended_percent_change ?? '0');

  return {
    symbol,
    pre_or_post: preOrPost,
    price: extPrice,
    change: extChange,
    changePercent: extChangePct,
    timestamp: data.extended_timestamp,
  };
}

// -------- Insider Transactions --------

export interface InsiderTransaction {
  full_name: string;
  position: string;
  date_reported: string;
  is_direct: boolean;
  shares: number;
  value: number;
  description: string;
  /** Derived: 'buy' | 'sell' | 'other' parsed from description */
  transaction_type: 'buy' | 'sell' | 'other';
}

interface TwelveDataInsiderResponse {
  meta?: { symbol: string; name?: string };
  insider_transactions?: Array<{
    full_name: string;
    position: string;
    date_reported: string;
    is_direct: boolean;
    shares: number;
    value: number;
    description: string;
  }>;
  status?: string;
  code?: number;
  message?: string;
}

function parseTransactionType(description: string): InsiderTransaction['transaction_type'] {
  const lower = description.toLowerCase();
  if (/sale|sold|disposition|dispose/i.test(lower)) return 'sell';
  if (/purchase|bought|acquisition|acqui/i.test(lower)) return 'buy';
  return 'other';
}

/**
 * GET /insider_transactions — trades by company executives & directors.
 * Cost: 200 credits per symbol. Available on Venture plan and above.
 */
export async function getInsiderTransactions(symbol: string): Promise<InsiderTransaction[]> {
  logUsage('/insider_transactions', symbol);
  const url = buildUrl('/insider_transactions', { symbol: symbol.toUpperCase() });
  const res = await fetch(url, { next: { revalidate: 3600 } }); // cache 1 hour
  const json = (await res.json()) as TwelveDataInsiderResponse;

  if (!res.ok || json.code || json.status === 'error') {
    const msg = json.message ?? `insider_transactions error: ${res.status}`;
    if (/rate.?limit|too many|credits? exceeded/i.test(msg) || json.code === 429) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }

  return (json.insider_transactions ?? []).map((t) => ({
    ...t,
    transaction_type: parseTransactionType(t.description),
  }));
}

// -------- Fundamentals Last Changes --------

export interface FundamentalsLastChange {
  profile?: { last_change: string | null };
  statistics?: { last_change: string | null };
  income_statement?: { last_change: string | null };
  balance_sheet?: { last_change: string | null };
  cash_flow?: { last_change: string | null };
}

/**
 * Returns the date each fundamental data type was last updated by TwelveData.
 * Use this to determine whether cached fundamental data is stale before spending
 * credits on a full re-fetch.
 *
 * Endpoint: GET /fundamentals/last_changes
 * Cost: 1 API credit per symbol.
 */
export async function getFundamentalsLastChange(symbol: string): Promise<FundamentalsLastChange> {
  logUsage('/fundamentals/last_changes', symbol);
  const url = buildUrl('/fundamentals/last_changes', { symbol: symbol.toUpperCase() });
  const res = await fetch(url, { cache: 'no-store' }); // always need fresh timestamps
  const json = (await res.json()) as FundamentalsLastChange & { code?: number; status?: string; message?: string };

  if (!res.ok || json.code || json.status === 'error') {
    const msg = json.message ?? `fundamentals/last_changes error: ${res.status}`;
    if (/rate.?limit|too many|credits? exceeded/i.test(msg) || json.code === 429) {
      throw new TwelveDataRateLimitError(msg);
    }
    throw new Error(msg);
  }

  return {
    profile: json.profile,
    statistics: json.statistics,
    income_statement: json.income_statement,
    balance_sheet: json.balance_sheet,
    cash_flow: json.cash_flow,
  };
}

