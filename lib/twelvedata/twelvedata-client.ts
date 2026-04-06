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

export async function getStockQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  if (symbols.length === 0) return new Map();
  const apiKey = getApiKey();

  // Build one batch request — all quotes in a single POST instead of N sequential GETs
  const requests: Record<string, string> = {};
  for (const sym of symbols) {
    requests[sym] = `/quote?symbol=${encodeURIComponent(sym.toUpperCase())}&apikey=${apiKey}`;
  }

  const raw = await batchFetch<TwelveDataQuoteResponse>(requests);
  const quotes = new Map<string, StockQuote>();
  for (const [sym, data] of Object.entries(raw)) {
    try {
      quotes.set(sym, parseQuoteResponse(data, sym));
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
  ex_dividend_date?: string;
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
  const url = buildUrl('/dividends', { symbol: symbol.toUpperCase(), outputsize: 20 });
  const response = await fetch(url);
  const data = (await response.json()) as TwelveDataDividendsResponse;

  if (!response.ok || data.code || data.status === 'error') {
    const msg = data.message || `Twelve Data dividends error for ${symbol}`;
    if (data.code === 429 || /rate.?limit|credits? exceeded/i.test(msg)) throw new TwelveDataRateLimitError(msg);
    throw new Error(msg);
  }

  return (data.dividends ?? []).map((item) => ({
    ex_dividend_date: item.ex_dividend_date ?? '',
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

