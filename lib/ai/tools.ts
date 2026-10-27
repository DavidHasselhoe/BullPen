/**
 * BullPen AI Tools — Supabase data access for the AI agent.
 *
 * Each tool runs server-side only. The AI decides which tool(s) to call
 * based on the user's question, executes them, then uses the results to
 * compose its final answer.
 *
 * Uses jsonSchema() instead of Zod to avoid schema conversion bugs
 * (e.g. type: "None" with Zod v4).
 */

import { tool, jsonSchema } from 'ai';
import { createServerClient } from '@/lib/supabase/client';
import {
  getStockQuotes,
  getStockCandles,
  isOutsideRegularSessionET,
  getStatistics,
  getCompanyEarnings,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  getCompanyProfile as getTwelveDataProfile,
  getInsiderTransactions,
  TwelveDataRateLimitError,
  type IncomeStatementPeriod,
  type BalanceSheetPeriod,
  type CashFlowPeriod,
  type EarningsCalendarItem,
} from '@/lib/twelvedata/twelvedata-client';
import { getCalendarRange, WARM_DAYS_BACK, WARM_DAYS_FORWARD } from '@/lib/market-data/calendar-days';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { coalesce } from '@/lib/cache/request-coalesce';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { getHealthScoreForSymbol } from '@/lib/finance/get-health-score';
import { computeTechnicals } from '@/lib/finance/technicals';
import { getTier, isPro } from '@/lib/billing/tier';
import { AlertTypeSchema, alertTypeLabel, describeAlert, FREE_ACTIVE_ALERT_LIMIT, type AlertType } from '@/types/alerts';
import { DIVIDEND_QUICK_PICKS } from '@/lib/finance/dividend-quick-picks';
import { getHoldings } from '@/lib/holdings/holdings-db';
import { APP_DESTINATION_IDS, resolveDestination, type AppDestinationId } from '@/lib/ai/app-destinations';
import { loadScreenerUniverse, matchesScreenerFilters, type ScreenerFilterParams } from '@/lib/screener/screener-query';
import type { ScreenerRow } from '@/app/api/screener/route';
import { getLatestPickRow, getPickRowByDate, toDetail } from '@/lib/picks/picks-db';
import { resolveThesisAccess } from '@/lib/picks/thesis-access';
import { getCachedPerformance, livePerformanceFor } from '@/lib/picks/performance';
import { QUARTER_RE } from '@/lib/picks/quarters';
import { toTeaser } from '@/lib/briefs/teaser';
import { getEconomicEvents } from '@/lib/market-data/economic-calendar';
import { THEME_DISPLAY_ORDER } from '@/lib/discover/theme-config';
import { loadFundHoldings } from '@/lib/institutions/load-holdings';
import type { DiffableHolding, HoldingChange } from '@/lib/institutions/compute-diff';
import changelog from '@/content/changelog.json';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function supabase() {
  return createServerClient();
}

function fmt(n: number | null): string {
  if (n == null) return 'N/A';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${n.toFixed(2)}`;
}

// Every current caller (dividendYield, profitMargin, revenueGrowthTTM,
// epsGrowthTTM from getStatistics()) is TwelveData's own 0..1 scale, so this
// multiplies by 100 — same convention StatisticsGrid's fmt('percent') uses
// for the identical fields. Passing an already-percent-scale value in here
// would need a new helper, not a change to this one.
function fmtPct(n: number | null): string {
  if (n == null) return 'N/A';
  return `${(n * 100).toFixed(1)}%`;
}

/** Resolve a ticker to a company_id (returns null if not found). */
async function resolveCompanyId(ticker: string): Promise<{ companyId: string; name: string } | null> {
  const db = supabase();
  const { data } = await db
    .from('companies')
    .select('id, name')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();
  if (!data) return null;
  const d = data as { id: string; name: string };
  return { companyId: d.id, name: d.name };
}

/**
 * Resolve a display name for any ticker, without requiring it to be ingested.
 * Checks companies → company_index → falls back to the ticker symbol itself.
 */
async function resolveCompanyName(ticker: string): Promise<string> {
  const sym = ticker.toUpperCase();
  const db = supabase();

  // Primary: full company record
  const { data: company } = await db
    .from('companies')
    .select('name')
    .eq('ticker', sym)
    .maybeSingle();
  if (company) return (company as { name: string }).name;

  // Fallback: lightweight search index (populated by TwelveData searches)
  const { data: indexed } = await db
    .from('company_index')
    .select('name')
    .eq('ticker', sym)
    .maybeSingle();
  if (indexed) return (indexed as { name: string }).name;

  // Last resort: use ticker as the name so the holding can still be created
  return sym;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: financial statement metric extraction (TwelveData-backed)
// ─────────────────────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  gross_profit: 'Gross Profit',
  operating_income: 'Operating Income',
  net_income: 'Net Income',
  eps_diluted: 'EPS (Diluted)',
  eps_basic: 'EPS (Basic)',
  operating_cash_flow: 'Operating Cash Flow',
  free_cash_flow: 'Free Cash Flow',
  capital_expenditures: 'Capital Expenditures',
  total_assets: 'Total Assets',
  total_liabilities: 'Total Liabilities',
  shareholders_equity: "Shareholders' Equity",
};

const METRIC_VALUES = [
  'revenue', 'gross_profit', 'operating_income', 'net_income',
  'eps_diluted', 'eps_basic', 'operating_cash_flow', 'free_cash_flow',
  'capital_expenditures', 'total_assets', 'total_liabilities',
  'shareholders_equity',
] as const;

const INCOME_STATEMENT_METRICS: Record<string, (r: IncomeStatementPeriod) => number | null> = {
  revenue: (r) => r.revenue,
  gross_profit: (r) => r.gross_profit,
  operating_income: (r) => r.operating_income,
  net_income: (r) => r.net_income,
  eps_diluted: (r) => r.eps_diluted,
  eps_basic: (r) => r.eps_basic,
};

const BALANCE_SHEET_METRICS: Record<string, (r: BalanceSheetPeriod) => number | null> = {
  total_assets: (r) => r.total_assets,
  total_liabilities: (r) => r.total_liabilities,
  shareholders_equity: (r) => r.total_stockholders_equity,
};

const CASH_FLOW_METRICS: Record<string, (r: CashFlowPeriod) => number | null> = {
  operating_cash_flow: (r) => r.operating_cash_flow,
  free_cash_flow: (r) => r.free_cash_flow,
  capital_expenditures: (r) => r.capital_expenditures,
};

// ─────────────────────────────────────────────────────────────────────────────
// Cache + credit-budget gate for expensive TwelveData calls. Every equivalent
// stock-page route (app/api/stock/[ticker]/statistics|financials|earnings)
// checks Supabase cache and reserves against the shared per-minute credit
// budget before firing a live fetch; these AI tools call the exact same
// TwelveData endpoints and must go through the same gate, or a single chat
// message ("compare these 15 tickers' financials") can fan out into
// thousands of uncapped, uncached credits with nothing to stop it repeating.
const STATS_TTL_SECONDS = 24 * 60 * 60;
const FINANCIALS_TTL_SECONDS = 24 * 60 * 60;
const EARNINGS_TTL_SECONDS = 24 * 60 * 60;

async function gatedFetch<T>(
  cacheKey: string,
  ticker: string,
  dataType: string,
  cost: number,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<{ denied: true } | { denied: false; data: T }> {
  const cached = await getCached<T>(cacheKey);
  if (cached !== null) return { denied: false, data: cached };

  if (await tryReserveOrganicCredits(cost)) {
    const data = await coalesce(cacheKey, fetcher);
    if (Array.isArray(data) ? data.length > 0 : !!data) {
      void setCached(cacheKey, ticker, dataType, data, ttlSeconds);
    }
    return { denied: false, data };
  }

  const stale = await getCachedStale<T>(cacheKey);
  if (stale !== null) return { denied: false, data: stale };
  return { denied: true };
}

/** Same cache key shape as app/api/stock/[ticker]/financials/route.ts, so tool calls and page views share hits. */
async function fetchGatedStatementRows(
  ticker: string,
  statementType: 'income' | 'balance' | 'cashflow',
  period: 'annual' | 'quarterly'
): Promise<{ denied: true } | { denied: false; data: unknown[] }> {
  const cacheKey = `financials:${ticker}:${statementType}:${period}`;
  const fetcher =
    statementType === 'income' ? () => getIncomeStatement(ticker, period)
    : statementType === 'balance' ? () => getBalanceSheet(ticker, period)
    : () => getCashFlow(ticker, period);
  return gatedFetch<unknown[]>(cacheKey, ticker, 'financials', 101, FINANCIALS_TTL_SECONDS, fetcher);
}

/** Fetches up to `outputsize` periods for `metric` from whichever TwelveData statement endpoint carries it. */
async function fetchMetricPeriods(
  ticker: string,
  metric: string,
  period: 'annual' | 'quarterly',
  outputsize: number
): Promise<{ fiscalDate: string; value: number | null }[]> {
  if (metric in INCOME_STATEMENT_METRICS) {
    const outcome = await fetchGatedStatementRows(ticker, 'income', period);
    if (outcome.denied) return [];
    const extract = INCOME_STATEMENT_METRICS[metric];
    return (outcome.data as IncomeStatementPeriod[]).slice(0, outputsize).map((r) => ({ fiscalDate: r.fiscal_date, value: extract(r) }));
  }
  if (metric in BALANCE_SHEET_METRICS) {
    const outcome = await fetchGatedStatementRows(ticker, 'balance', period);
    if (outcome.denied) return [];
    const extract = BALANCE_SHEET_METRICS[metric];
    return (outcome.data as BalanceSheetPeriod[]).slice(0, outputsize).map((r) => ({ fiscalDate: r.fiscal_date, value: extract(r) }));
  }
  const outcome = await fetchGatedStatementRows(ticker, 'cashflow', period);
  if (outcome.denied) return [];
  const extract = CASH_FLOW_METRICS[metric];
  return (outcome.data as CashFlowPeriod[]).slice(0, outputsize).map((r) => ({ fiscalDate: r.fiscal_date, value: extract(r) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Get Company Financial Metrics
// ─────────────────────────────────────────────────────────────────────────────

export const getCompanyMetrics = tool({
  description:
    'Fetch historical financial metrics for a specific company. Works for any ticker globally, not just ' +
    'companies in the BullPen database. Use this when the user asks about a company\'s revenue, earnings, ' +
    'EPS, margins, cash flow, balance sheet items, or any other financial data. Returns up to 6 periods. ' +
    'Costs ~1 API credit.',
  inputSchema: jsonSchema<{ ticker: string; metric: typeof METRIC_VALUES[number]; period: 'annual' | 'quarterly' }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'The stock ticker symbol, e.g. "NVDA", "AAPL", "MSFT"' },
      metric: {
        type: 'string',
        enum: [...METRIC_VALUES],
        description: 'The financial metric to retrieve',
      },
      period: {
        type: 'string',
        enum: ['annual', 'quarterly'],
        default: 'annual',
        description: 'Whether to return annual or quarterly data',
      },
    },
    required: ['ticker', 'metric'],
    additionalProperties: false,
  }),
  execute: async ({ ticker, metric, period = 'annual' }) => {
    try {
      const sym = ticker.toUpperCase();
      const company = await resolveCompanyId(sym);
      const companyName = company?.name ?? sym;
      const isMonetary = metric !== 'eps_diluted' && metric !== 'eps_basic';

      const periods = await fetchMetricPeriods(sym, metric, period, 6);

      if (periods.length === 0) {
        return {
          ticker: sym,
          company: companyName,
          metric: METRIC_LABELS[metric] ?? metric,
          period,
          note: 'No data found for this ticker.',
          rows: [],
        };
      }

      const rows = periods.map((p) => ({
        period: p.fiscalDate,
        periodEnd: p.fiscalDate,
        value: p.value,
        formatted: isMonetary ? fmt(p.value) : p.value != null ? `$${p.value.toFixed(2)}` : 'N/A',
      }));

      return {
        ticker: sym,
        company: companyName,
        metric: METRIC_LABELS[metric] ?? metric,
        period,
        rows,
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch ${METRIC_LABELS[metric] ?? metric} for ${ticker}: ${(err as Error).message}` };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Get Company Profile
// ─────────────────────────────────────────────────────────────────────────────

export const getCompanyProfile = tool({
  description:
    'Fetch the company profile (sector, industry, description, employee count, fiscal year end) from ' +
    'BullPen\'s SEC-derived database. Fast and free, but only covers companies BullPen has ingested — ' +
    'most tickers are NOT in this database. If this returns "not found", call getLiveCompanyProfile instead ' +
    '— do not tell the user the profile is unavailable without trying that fallback first.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'The stock ticker symbol' },
    },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker }) => {
    const db = supabase();
    const { data, error } = await db
      .from('companies')
      .select('ticker, name, sector, industry, description, employee_count, fiscal_year_end, sic_code, incorporation_location')
      .eq('ticker', ticker.toUpperCase())
      .maybeSingle();

    if (error || !data) {
      return { error: `Company "${ticker}" not found in the database.` };
    }
    return data;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Search Companies
// ─────────────────────────────────────────────────────────────────────────────

export const searchCompanies = tool({
  description:
    'Search for companies by name or ticker. Use this when the user refers to a company ' +
    'by name (e.g. "Apple", "the chip maker") rather than a ticker, or when disambiguating.',
  inputSchema: jsonSchema<{ query: string }>({
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Company name or partial ticker to search for' },
    },
    required: ['query'],
    additionalProperties: false,
  }),
  execute: async ({ query }) => {
    const db = supabase();
    // Strip characters meaningful to PostgREST's .or() filter DSL (`,` separates
    // conditions, `(`/`)` group them) before interpolating user input.
    const safeQuery = query.toLowerCase().replace(/[,()]/g, '');
    const { data } = await db
      .from('company_index')
      .select('ticker, name')
      .or(`normalized_name.ilike.%${safeQuery}%,normalized_ticker.ilike.%${safeQuery}%`)
      .eq('has_data', true)
      .limit(8);

    if (!data || data.length === 0) {
      return { note: `No companies found matching "${query}".`, results: [] };
    }
    return { results: data };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Compare Companies
// ─────────────────────────────────────────────────────────────────────────────

const COMPARE_METRIC_VALUES = [
  'revenue', 'gross_profit', 'operating_income', 'net_income',
  'eps_diluted', 'free_cash_flow', 'total_assets', 'shareholders_equity',
] as const;

export const compareCompanies = tool({
  description:
    'Compare multiple companies side-by-side on key financial metrics. ' +
    'Use when the user asks to compare two or more companies. Costs ~1 API credit per company.',
  inputSchema: jsonSchema<{
    tickers: string[];
    metric?: typeof COMPARE_METRIC_VALUES[number];
    period?: 'annual' | 'quarterly';
  }>({
    type: 'object',
    properties: {
      tickers: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 5,
        description: 'List of ticker symbols to compare',
      },
      metric: {
        type: 'string',
        enum: [...COMPARE_METRIC_VALUES],
        default: 'revenue',
        description: 'The metric to compare across companies',
      },
      period: {
        type: 'string',
        enum: ['annual', 'quarterly'],
        default: 'annual',
      },
    },
    required: ['tickers'],
    additionalProperties: false,
  }),
  execute: async ({ tickers, metric = 'revenue', period = 'annual' }) => {
    const isMonetary = metric !== 'eps_diluted';

    const results = await Promise.all(
      tickers.map(async (ticker) => {
        const sym = ticker.toUpperCase();
        try {
          const [company, periods] = await Promise.all([
            resolveCompanyId(sym),
            fetchMetricPeriods(sym, metric, period, 4),
          ]);
          return {
            ticker: sym,
            company: company?.name ?? sym,
            metric: METRIC_LABELS[metric] ?? metric,
            period,
            data: periods.map((p) => ({
              period: p.fiscalDate,
              value: p.value,
              formatted: isMonetary ? fmt(p.value) : p.value != null ? `$${p.value.toFixed(2)}` : 'N/A',
            })),
          };
        } catch (err) {
          if (err instanceof TwelveDataRateLimitError) return { ticker: sym, error: 'Rate limit reached. Try again shortly.' };
          return { ticker: sym, error: (err as Error).message };
        }
      }),
    );

    return { comparison: results };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Client action tools — return __clientAction for the frontend to execute
// These trigger navigation/UI actions in the browser
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_ACTION = '__clientAction';

/**
 * Every change to the user's account (holdings, alerts) waits for them to
 * press Confirm under Bull's reply; the app only runs it then. Returned with
 * each write action so the model asks instead of announcing "done".
 */
const AWAITING_CONFIRMATION =
  'NOT DONE YET. Nothing is saved until the user presses Confirm on the card under your reply (they can also Cancel). ' +
  'Say what will change and ask them to confirm. Never say it has been added, updated, removed or set.';

function clientAction<T extends Record<string, unknown>>(action: T) {
  return { [CLIENT_ACTION]: action } as { __clientAction: T };
}

/**
 * Every navigation tool shares one schema field: `explicitUserRequest`. The
 * model sets it based on whether the user's own message directly asked to
 * be taken somewhere ("take me to X", "open X") vs. Bull volunteering
 * navigation as a helpful next step to an informational question ("where
 * can I manage my alerts?"). `false` renders a Yes/No confirm prompt
 * client-side instead of navigating immediately — see the system prompt's
 * "Navigation confirmation" section for the full judgment rule, and
 * NavigateConfirmCard for the client-side prompt itself.
 */
const EXPLICIT_USER_REQUEST_SCHEMA = {
  type: 'boolean' as const,
  description:
    "True only if the user's own message directly asked to be taken/navigated somewhere " +
    '(e.g. "take me to GOOGL", "open the screener", "go to my watchlist"). False if you are ' +
    'volunteering navigation as a helpful next step to an informational question the user asked ' +
    '(e.g. "where can I manage my alerts?", "how do I add a holding?") — in that case the user has ' +
    "not yet consented to leave the page they're on, so this must be false and they'll be asked to confirm.",
};

function navigateAction(path: string, label: string, explicitUserRequest: boolean) {
  return {
    ...clientAction({ type: 'navigate', path, label, requiresConfirmation: !explicitUserRequest }),
    // The model writes again after this result. Without saying what the user
    // actually sees, it improvised: re-asked the question it had just asked,
    // or announced "Done, you should now be on the page" while the Yes/No
    // prompt was still waiting for an answer.
    // "Only add something if it answers the question" read as "add nothing"
    // when the offer came before the answer: asked which holdings report
    // soon, Bull fetched every date, offered the calendar and wrote only
    // "Use the Yes/No buttons below" (2026-10-22).
    note: explicitUserRequest
      ? `${label} is opening now. Do not announce it or say it is done; only add something if it answers the question.`
      : 'The user now sees Yes/No buttons under your reply. They have not moved. Do not repeat the offer, ask again, or ' +
        'say the buttons are there. If you have not yet written the answer to their question in this reply, write it ' +
        'now in full: the buttons are an extra, never the answer.',
  };
}

/** Filter params shared by openScreener and screenStocks. Market cap is in billions, percents are 0-100. */
type ScreenerToolFilters = {
  sector?: string;
  industry?: string;
  healthScoreMin?: number;
  healthScoreMax?: number;
  marketCapMin?: number;
  marketCapMax?: number;
  peMin?: number;
  peMax?: number;
  pbMin?: number;
  pbMax?: number;
  betaMin?: number;
  betaMax?: number;
  divYieldMin?: number;
  divYieldMax?: number;
  profitMarginMin?: number;
  profitMarginMax?: number;
  revenueGrowthMin?: number;
  revenueGrowthMax?: number;
  week52ChangeMin?: number;
  week52ChangeMax?: number;
};

const SCREENER_FILTER_PROPERTIES = {
  sector:           { type: 'string', description: 'Sector name, e.g. "Technology", "Healthcare", "Energy", "Financials", "Consumer Cyclical"' },
  industry:         { type: 'string', description: 'Industry within the sector, e.g. "Semiconductors", "Software—Application", "Biotechnology"' },
  healthScoreMin:   { type: 'number', description: 'Min BullPen Health Score, 0-100 (profitability, balance sheet strength, valuation, growth, market risk combined into one number) — e.g. 70 for financially healthy companies' },
  healthScoreMax:   { type: 'number', description: 'Max BullPen Health Score, 0-100' },
  marketCapMin:     { type: 'number', description: 'Min market cap in billions USD (e.g. 10 = $10B, 200 = $200B)' },
  marketCapMax:     { type: 'number', description: 'Max market cap in billions USD' },
  peMin:            { type: 'number', description: 'Min P/E ratio (TTM)' },
  peMax:            { type: 'number', description: 'Max P/E ratio (TTM) — e.g. 15 for value / cheap stocks' },
  pbMin:            { type: 'number', description: 'Min Price-to-Book ratio' },
  pbMax:            { type: 'number', description: 'Max Price-to-Book ratio — e.g. 2 for deep value' },
  betaMin:          { type: 'number', description: 'Min beta — e.g. 1.5 for high-volatility / aggressive stocks' },
  betaMax:          { type: 'number', description: 'Max beta — e.g. 0.8 for low-volatility / defensive stocks' },
  divYieldMin:      { type: 'number', description: 'Min dividend yield as a percentage — e.g. 2.5 for 2.5% yield' },
  divYieldMax:      { type: 'number', description: 'Max dividend yield as a percentage' },
  profitMarginMin:  { type: 'number', description: 'Min profit margin as a percentage — e.g. 15 for 15% margin' },
  profitMarginMax:  { type: 'number', description: 'Max profit margin as a percentage' },
  revenueGrowthMin: { type: 'number', description: 'Min revenue growth YoY as a percentage — e.g. 15 for 15% growth' },
  revenueGrowthMax: { type: 'number', description: 'Max revenue growth YoY as a percentage' },
  week52ChangeMin:  { type: 'number', description: 'Min gap between the 52-week low and high, as a percentage of the high (0-100) — NOT the stock\'s price return. A high value means the stock traded across a wide range this year (more volatile); e.g. 50 for stocks that swung across a very wide range.' },
  week52ChangeMax:  { type: 'number', description: 'Max gap between the 52-week low and high, as a percentage of the high (0-100) — e.g. 10 for stocks that stayed in a tight trading range all year.' },
} as const;

export const openScreener = tool({
  description:
    'Open the BullPen stock screener, optionally pre-applying filters so the user sees results immediately. ' +
    'Use whenever the user asks to find, screen, filter, or browse stocks — even vague requests like ' +
    '"show me value stocks", "find tech growth plays", or "I want dividend ideas". These are all explicit action ' +
    'requests — the tool only exists to be triggered this way, so explicitUserRequest is almost always true here; ' +
    'set it false only on the rare case where you are suggesting the screener unprompted, mid-answer to something else. ' +
    'Map natural language criteria to filter params: ' +
    '"large-cap" → marketCapMin=10, "mega-cap" → marketCapMin=200, "small-cap" → marketCapMax=2, ' +
    '"deep value" → peMax=15 + pbMax=2, "growth stocks" → revenueGrowthMin=15, ' +
    '"high quality" → profitMarginMin=15 + revenueGrowthMin=10, "dividend" → divYieldMin=2.5, ' +
    '"low volatility" → betaMax=0.8, "high volatility" → betaMin=1.5, ' +
    '"financially healthy" / "strong fundamentals" / "well-run companies" → healthScoreMin=70. ' +
    'To compare a named set of companies side by side instead, use navigateTo with destination "compare".',
  inputSchema: jsonSchema<ScreenerToolFilters & {
    explicitUserRequest: boolean;
  }>({
    type: 'object',
    properties: {
      ...SCREENER_FILTER_PROPERTIES,
      explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA,
    },
    required: ['explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async (filters) => {
    const params = new URLSearchParams();
    const add = (k: string, v: number | string | undefined) => {
      if (v != null && v !== '') params.set(k, String(v));
    };
    add('sector',           filters.sector);
    add('industry',         filters.industry);
    add('healthScoreMin',   filters.healthScoreMin);
    add('healthScoreMax',   filters.healthScoreMax);
    add('marketCapMin',     filters.marketCapMin);
    add('marketCapMax',     filters.marketCapMax);
    add('peMin',            filters.peMin);
    add('peMax',            filters.peMax);
    add('pbMin',            filters.pbMin);
    add('pbMax',            filters.pbMax);
    add('betaMin',          filters.betaMin);
    add('betaMax',          filters.betaMax);
    add('divYieldMin',      filters.divYieldMin);
    add('divYieldMax',      filters.divYieldMax);
    add('profitMarginMin',  filters.profitMarginMin);
    add('profitMarginMax',  filters.profitMarginMax);
    add('revenueGrowthMin', filters.revenueGrowthMin);
    add('revenueGrowthMax', filters.revenueGrowthMax);
    add('week52ChangeMin',  filters.week52ChangeMin);
    add('week52ChangeMax',  filters.week52ChangeMax);

    const qs = params.toString();
    const path = qs ? `/tools/screener?${qs}` : '/tools/screener';
    const appliedCount = [...params.keys()].length;
    return {
      ...navigateAction(path, 'the stock screener', filters.explicitUserRequest),
      ...(appliedCount > 0 ? { filtersApplied: appliedCount, description: `Screener opened with ${appliedCount} filter(s)` } : {}),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Screen Stocks (answers ranking questions from screener_stats, no credits)
// ─────────────────────────────────────────────────────────────────────────────

const SCREEN_SORT_COLUMNS = {
  healthScore: 'health_score',
  marketCap: 'market_cap',
  pe: 'pe_ratio',
  pb: 'pb_ratio',
  dividendYield: 'dividend_yield',
  profitMargin: 'profit_margin',
  revenueGrowth: 'revenue_growth_yoy',
  beta: 'beta',
} as const satisfies Record<string, keyof ScreenerRow>;
type ScreenSortKey = keyof typeof SCREEN_SORT_COLUMNS;

/** A negative P/E or P/B is a loss or negative equity, not "cheapest". Ranking by them only counts positive values. */
const POSITIVE_ONLY_SORTS = new Set<ScreenSortKey>(['pe', 'pb']);

/** Holdings, a watchlist, a custom screener view. Well above any real portfolio. */
const SCREEN_TICKER_CAP = 250;

const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

export const screenStocks = tool({
  description:
    'Answer a "which stock" or ranking question directly from the screener\'s data: "which stock has the highest health ' +
    'score", "top 5 dividend payers in tech", "cheapest large-caps by P/E", "which of my holdings is healthiest". ' +
    'Takes the same filters as openScreener (same units, same phrase mappings) plus sortBy, order and limit, and returns ' +
    'the top matches with health score and key metrics. Free: reads the nightly-refreshed screener table, no API credits. ' +
    'Use this when the user wants an answer and openScreener when they want to browse a list; after answering you may ' +
    'offer the screener with the same filters. On the screener page, the page context carries the view and filters the ' +
    'user has on screen: pass them unchanged so "which of these" means those results. Scores are refreshed nightly; do ' +
    'not re-check the results with getHealthScore, which costs credits. A question about one named company still goes ' +
    'to getHealthScore. Tickers the screener does not track come back in notCovered; use getHealthScore for those ' +
    'rather than saying they have no score. When filters are set, filterImpact lists how many stocks would match ' +
    'without each one, largest first: the filter with the biggest jump over matchedFilters is the bottleneck. A stock ' +
    'missing a value (no dividend, no sector on record) fails any filter on that value. dataAsOf is the date of the ' +
    'nightly refresh: P/E, forward P/E and market cap are priced at that day\'s close, so they already reflect any ' +
    'move up to then and are not old data. A result with staleAsOf missed its refresh: name that one stock\'s date, ' +
    'never present the whole set as that old, and use getKeyStatistics for its current multiples if they matter to ' +
    'the answer. week52High against a live quote measures a pullback. The user already sees the ' +
    'results as a ranked list with logos, health scores and the ranked metric: do not repeat them as a table or list. ' +
    'Reply with what the ranking means, citing a figure only where it makes a point.',
  inputSchema: jsonSchema<ScreenerToolFilters & {
    sortBy?: ScreenSortKey;
    order?: 'desc' | 'asc';
    limit?: number;
    scope?: 'sp500' | 'nasdaq100' | 'dow30' | 'all';
    tickers?: string[];
  }>({
    type: 'object',
    properties: {
      ...SCREENER_FILTER_PROPERTIES,
      sortBy: { type: 'string', enum: Object.keys(SCREEN_SORT_COLUMNS), description: 'What to rank by. Default healthScore.' },
      order: { type: 'string', enum: ['desc', 'asc'], description: 'desc = highest first (default). Use asc for "lowest", "cheapest", "least volatile".' },
      limit: { type: 'number', minimum: 1, maximum: 20, description: 'How many to return. Default 5.' },
      scope: {
        type: 'string',
        enum: ['sp500', 'nasdaq100', 'dow30', 'all'],
        description: 'sp500 = the S&P 500, the screener\'s default view (default). nasdaq100 = the Nasdaq-100. dow30 = the Dow Jones Industrial Average. all = every stock BullPen tracks, about 3,000 including smaller companies. Ignored when tickers is set.',
      },
      tickers: {
        type: 'array',
        items: { type: 'string' },
        maxItems: SCREEN_TICKER_CAP,
        description: 'Rank only within these tickers, e.g. the user\'s holdings or a named set of companies.',
      },
    },
    additionalProperties: false,
  }),
  execute: async ({ sortBy = 'healthScore', order = 'desc', limit = 5, scope = 'sp500', tickers, ...filters }) => {
    const symbols = tickers
      ? [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(0, SCREEN_TICKER_CAP)
      : undefined;
    const { rows, error } = await loadScreenerUniverse(supabase(), { symbols, scope });
    if (error) return { error: 'Could not load screener data.' };

    const params: ScreenerFilterParams = {
      ...filters,
      marketCapMin: filters.marketCapMin != null ? filters.marketCapMin * 1e9 : undefined,
      marketCapMax: filters.marketCapMax != null ? filters.marketCapMax * 1e9 : undefined,
    };
    const col = SCREEN_SORT_COLUMNS[sortBy] ?? 'health_score';
    const value = (r: ScreenerRow) => r[col] as number | null;
    const matched = rows.filter((r) => matchesScreenerFilters(r, params));
    const ranked = matched
      .filter((r) => { const v = value(r); return v != null && (!POSITIVE_ONLY_SORTS.has(sortBy) || v > 0); })
      // Health scores tie often; the bigger company wins the tie, same order the screener lists them in.
      .sort((a, b) => (order === 'asc' ? value(a)! - value(b)! : value(b)! - value(a)!) || (b.market_cap ?? 0) - (a.market_cap ?? 0))
      .slice(0, Math.min(Math.max(Math.round(limit), 1), 20));

    const present = new Set(rows.map((r) => r.ticker.toUpperCase()));
    const notCovered = symbols?.filter((t) => !present.has(t)) ?? [];
    // The newest date is the table's; a row a few days behind it missed its
    // refresh and is flagged on its own. Reporting the oldest row as the date
    // of the whole set had Bull call nightly data "five months old" because one
    // holding (TSM) had dropped out of the refresh.
    const newest = ranked.reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);
    const staleBefore = newest ? new Date(Date.parse(newest) - 3 * 86_400_000).toISOString() : null;

    // For each active filter, how many stocks would match without it. The
    // biggest jump is the bottleneck, which is what lets Bull critique a filter
    // setup with numbers instead of opinion.
    const activeGroups = [...new Set(
      (Object.keys(params) as (keyof ScreenerFilterParams)[])
        .filter((k) => params[k] != null && params[k] !== '')
        .map((k) => k.replace(/(Min|Max)$/, '')),
    )];
    const filterImpact = activeGroups.length > 0
      ? activeGroups
          .map((group) => {
            const without = Object.fromEntries(
              Object.entries(params).filter(([k]) => k.replace(/(Min|Max)$/, '') !== group),
            ) as ScreenerFilterParams;
            return { filter: group, matchesWithoutIt: rows.filter((r) => matchesScreenerFilters(r, without)).length };
          })
          .sort((a, b) => b.matchesWithoutIt - a.matchesWithoutIt)
      : undefined;

    return {
      universe: symbols ? `${symbols.length} given tickers` : { all: 'all tracked stocks', sp500: 'S&P 500', nasdaq100: 'Nasdaq-100', dow30: 'Dow 30' }[scope],
      universeSize: rows.length,
      matchedFilters: matched.length,
      ...(filterImpact ? { filterImpact } : {}),
      rankedBy: sortBy,
      order,
      dataAsOf: newest?.slice(0, 10) ?? null,
      ...(notCovered.length > 0 ? { notCovered } : {}),
      results: ranked.map((r, i) => ({
        rank: i + 1,
        ticker: r.ticker,
        name: r.name,
        sector: r.sector,
        ...(staleBefore && r.updated_at < staleBefore ? { staleAsOf: r.updated_at.slice(0, 10) } : {}),
        healthScore: r.health_score,
        healthGrade: r.health_score_grade,
        marketCap: fmt(r.market_cap),
        pe: round1(r.pe_ratio),
        forwardPe: round1(r.forward_pe),
        pb: round1(r.pb_ratio),
        week52High: r.week52_high,
        beta: round1(r.beta),
        // screener_stats stores these three as 0..1 fractions
        dividendYieldPct: round1(r.dividend_yield != null ? r.dividend_yield * 100 : null),
        profitMarginPct: round1(r.profit_margin != null ? r.profit_margin * 100 : null),
        revenueGrowthPct: round1(r.revenue_growth_yoy),
      })),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Open Dividend Calculator (client action — navigate with pre-filled picks)
// ─────────────────────────────────────────────────────────────────────────────

/** Default picks when the user doesn't name specific stocks — same set the calculator's own "Quick add" row flags as high-yield. */
const DEFAULT_DIVIDEND_PICKS: { ticker: string }[] = DIVIDEND_QUICK_PICKS
  .filter((p) => p.highYield)
  .map((p) => ({ ticker: p.ticker }));

export const openDividendCalculator = tool({
  description:
    'Open the Dividend Calculator pre-filled with stocks. Use when the user wants to build, create, or project ' +
    'a dividend portfolio — "build me a high yield dividend portfolio", "what would $50k in dividend stocks earn me", ' +
    '"set up a dividend portfolio with KO, JNJ, and O". If the user names specific stocks, pass them in picks; ' +
    'otherwise this tool defaults to a curated high-yield set on its own — do not invent tickers yourself. Only pass ' +
    'totalAmount or a per-pick amount if the user actually stated a dollar figure — if they gave no amount at all, ' +
    'leave both unset so the tool applies its own $10,000-per-stock default; do not invent a total to split. ' +
    'Do NOT ask the user for an amount, years, or which stocks before calling this tool — call it immediately with ' +
    'whatever the user gave you (defaults fill in the rest: $10,000/stock, a curated high-yield set, 10-year projection). ' +
    'The page is fully editable, so getting a starting point in front of the user beats interrogating them first. ' +
    'This only pre-fills the page — it does not compute or state projected income itself; the user still needs to ' +
    'press Calculate, so do not claim specific income numbers from this tool\'s result. Navigation to the page ' +
    'happens automatically the instant this tool runs — do NOT include a link or URL in your reply, just describe ' +
    'in plain text what was added.',
  inputSchema: jsonSchema<{
    picks?: { ticker: string; amount?: number }[];
    totalAmount?: number;
    years?: number;
  }>({
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        maxItems: 15,
        items: {
          type: 'object',
          properties: {
            ticker: { type: 'string', description: 'Stock ticker symbol, e.g. KO, O, VZ' },
            amount: {
              type: 'number',
              minimum: 0,
              description: 'Dollar amount to invest in this stock (optional — overrides totalAmount/default split for this pick)',
            },
          },
          required: ['ticker'],
          additionalProperties: false,
        },
        description: 'Specific stocks to pre-fill. Omit entirely to use a curated high-yield default set.',
      },
      totalAmount: {
        type: 'number',
        minimum: 0,
        description: 'Total dollars to invest, split evenly across the resolved picks. Ignored for picks that set their own amount.',
      },
      years: {
        type: 'number',
        enum: [1, 5, 10, 20, 30],
        description: "Projection period in years — must be one of the calculator's preset options: 1, 5, 10, 20, or 30. Defaults to 10 if omitted.",
      },
    },
    additionalProperties: false,
  }),
  execute: async ({ picks, totalAmount, years }) => {
    const chosen: { ticker: string; amount?: number }[] =
      picks && picks.length > 0 ? picks.slice(0, 15) : DEFAULT_DIVIDEND_PICKS;

    const perStockAmount = totalAmount != null && totalAmount > 0 ? totalAmount / chosen.length : null;

    const resolved = await Promise.all(
      chosen.map(async (p) => {
        const ticker = p.ticker.toUpperCase();
        const name = await resolveCompanyName(ticker);
        const amount = p.amount != null ? p.amount : (perStockAmount ?? 10000);
        return {
          ticker,
          name,
          mode: 'amount' as const,
          value: String(Math.round(amount)),
        };
      })
    );

    const params = new URLSearchParams();
    params.set('seed', JSON.stringify(resolved));
    if (years != null) params.set('years', String(Math.round(years)));

    return {
      // Always auto-navigates, no confirmation — "build/create a dividend
      // portfolio" is itself the explicit request; this tool only ever runs
      // in response to that, never as an unprompted suggestion.
      ...navigateAction(`/tools/dividend?${params.toString()}`, 'the Dividend Calculator', true),
      addedStocks: resolved.map((r) => `${r.ticker} ($${Number(r.value).toLocaleString('en-US')})`),
      description: `Opened the Dividend Calculator with ${resolved.length} stock(s) pre-filled.`,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Navigate To (client action — general-purpose internal navigation)
//
// Covers every plain destination none of the more specific navigation tools
// above already own (see lib/ai/app-destinations.ts for the full list and
// why each entry is or isn't there). Every path resolves from that fixed
// registry — this tool has no way to navigate anywhere outside BullPen.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The one navigation tool.
 *
 * Was ten tools until 2026-09-22: openCompanyPage, openComparison,
 * openHoldings, openDiscover, openTools, openCompanyEarnings, openCompanyNews
 * and this one, each carrying its own description and its own copy of the
 * explicitUserRequest parameter on every request, to express what is one row
 * in APP_DESTINATIONS. Seven folded in here; openScreener and
 * openDividendCalculator stayed separate because they have real parameter
 * sets of their own and merging them would make one tool out of unrelated
 * inputs.
 */
export const navigateTo = tool({
  description:
    `Navigate the user to a page in BullPen. This is the only way to send someone somewhere: pick a destination from the enum. Covers a company's stock page ("stock", or "stock_fullscreen" for the advanced chart view, "stock_earnings" for its earnings calendar, "stock_news" for its news), comparing companies ("compare"), the user's own pages (holdings, watchlist, notifications, dashboard), the tools (alerts, Portfolio Builder, calendar, Market Mood, heatmap, "If You Bought Here"), Academy and its leaderboard, Discover, the community feed, Browse Members, the Upgrade page, Bull's Weekly Pick, and the AI Deep Dive for a ticker. Note that "dashboard" is the user's own home and "discover" is the separate Discover page. Use openScreener instead for finding or filtering stocks, and openDividendCalculator for building a dividend portfolio. BullPen has no other pages: if what the user wants does not exist, say so rather than guessing a destination.`,
  inputSchema: jsonSchema<{
    destination: AppDestinationId;
    ticker?: string;
    tickers?: string[];
    explicitUserRequest: boolean;
  }>({
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        enum: [...APP_DESTINATION_IDS],
        description: 'Which page to open.',
      },
      ticker: {
        type: 'string',
        description:
          'Stock ticker. Required for "stock", "stock_fullscreen", "stock_earnings", "stock_news" and "deep_dive"; ignored otherwise.',
      },
      tickers: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 5,
        description: 'Two to five tickers. Required for "compare"; ignored otherwise.',
      },
      explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA,
    },
    required: ['destination', 'explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async ({ destination, ticker, tickers, explicitUserRequest }) => {
    // resolveCompanyName, not resolveCompanyId: the path is built from the
    // ticker itself, and resolveCompanyId only checks the small hand-ingested
    // `companies` table, which returned null for MU despite MU being covered
    // everywhere else in the app. resolveCompanyName falls back to the ticker
    // and so never fails.
    const companyName = ticker ? await resolveCompanyName(ticker) : undefined;
    const resolved = resolveDestination(destination, { ticker, tickers, companyName });
    if ('error' in resolved) return resolved;
    return {
      ...navigateAction(resolved.path, resolved.label, explicitUserRequest),
      ...(companyName ? { opened: companyName } : {}),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Add Holding (client action — frontend executes with user context)
// ─────────────────────────────────────────────────────────────────────────────

export const addHolding = tool({
  description:
    'Add a stock to the user\'s holdings. Use when the user asks to add, track, or save a company to their portfolio. ' +
    'Examples: "add 5 NVIDIA to my holdings", "add AAPL to my portfolio", "track 10 shares of Microsoft at $150 purchased Jan 2025". ' +
    'Requires ticker; quantity, avg_price, and date_purchased are optional.',
  inputSchema: jsonSchema<{
    ticker: string;
    quantity?: number;
    avg_price?: number;
    date_purchased?: string;
  }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol, e.g. NVDA, AAPL' },
      quantity: { type: 'number', description: 'Number of shares (optional)' },
      avg_price: { type: 'number', description: 'Average cost per share in USD (optional)' },
      date_purchased: { type: 'string', description: 'Purchase date in YYYY-MM-DD format (optional)' },
    },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker, quantity, avg_price, date_purchased }) => {
    const companyName = await resolveCompanyName(ticker);
    return {
      ...clientAction({
        type: 'addHolding',
        ticker: ticker.toUpperCase(),
        company_name: companyName,
        quantity: quantity ?? null,
        avg_price: avg_price ?? null,
        date_purchased: date_purchased ?? null,
      }),
      added: companyName,
      confirmation: AWAITING_CONFIRMATION,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Update Holding (client action)
// ─────────────────────────────────────────────────────────────────────────────

export const updateHolding = tool({
  description:
    'Update an existing holding in the user\'s portfolio. Use when the user asks to change, modify, or update a position. ' +
    'Examples: "update my NVDA position to 20 shares", "change my Apple avg price to $185", ' +
    '"set MSFT quantity to 30 shares at $420". ' +
    'Requires ticker; supply only the fields to change (quantity and/or avg_price).',
  inputSchema: jsonSchema<{
    ticker: string;
    quantity?: number;
    avg_price?: number;
  }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol of the holding to update, e.g. NVDA, AAPL' },
      quantity: { type: 'number', minimum: 0, description: 'New total number of shares (replaces current quantity)' },
      avg_price: { type: 'number', minimum: 0, description: 'New average cost per share in USD (replaces current avg price)' },
    },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker, quantity, avg_price }) => {
    if (quantity === undefined && avg_price === undefined) {
      return { error: 'Specify at least one field to update: quantity or avg_price.' };
    }
    const company = await resolveCompanyId(ticker);
    // Company lookup is informational — proceed even if not in DB (user might track OTC stocks)
    return {
      ...clientAction({
        type: 'updateHolding',
        ticker: ticker.toUpperCase(),
        quantity: quantity ?? null,
        avg_price: avg_price ?? null,
      }),
      updating: ticker.toUpperCase(),
      ...(company ? { company: company.name } : {}),
      confirmation: AWAITING_CONFIRMATION,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Remove Holding (client action)
// ─────────────────────────────────────────────────────────────────────────────

export const removeHolding = tool({
  description:
    'Remove a stock from the user\'s holdings entirely. Use when the user asks to delete, remove, or sell out of a position. ' +
    'Examples: "remove NVDA from my portfolio", "delete my Apple holding", "I sold all my Tesla, remove it". ' +
    'This removes the full position — to reduce shares use updateHolding instead.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol of the holding to remove, e.g. NVDA, AAPL' },
    },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker }) => {
    const company = await resolveCompanyId(ticker);
    return {
      ...clientAction({
        type: 'removeHolding',
        ticker: ticker.toUpperCase(),
      }),
      removing: ticker.toUpperCase(),
      ...(company ? { company: company.name } : {}),
      confirmation: AWAITING_CONFIRMATION,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Create Alert (client action — frontend executes with user context)
//
// Unlike the other client-action tools, this one is a factory that closes
// over `userId` and re-checks the free-tier active-alerts cap server-side
// (the exact same check /api/alerts' POST route enforces) before returning
// the clientAction. Without this, the model would tell the user "done" as
// soon as it decides to call the tool — the actual mutation only happens
// client-side after the assistant's text has already finished streaming, so
// a limit hit there would silently contradict what was already said. This
// tool is what lets the assistant know synchronously, in the same turn.
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_TYPE_VALUES = AlertTypeSchema.options;

export function createAlertTool(userId: string) {
  return tool({
    description:
      'Create a price or metric alert for a stock. Use when the user asks to be notified, alerted, or pinged: ' +
      '"alert me when NVDA hits $200", "notify me if AAPL drops 5% in a day", "let me know when TSLA is near its 52-week high", ' +
      '"tell me if MSFT closes at a new all-time high". ' +
      'Free accounts are capped at 5 stocks with active alerts (adding a second alert TYPE to an already-alerted stock ' +
      'does not use another slot). If the user is at that limit, this tool returns limitReached: true instead of creating ' +
      "the alert — explain the limit and suggest pausing an existing alert or upgrading to Pro. Never claim an alert was " +
      'created when the tool result has limitReached or error set.',
    inputSchema: jsonSchema<{ ticker: string; alertType: AlertType; threshold: number }>({
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol, e.g. NVDA, AAPL' },
        alertType: {
          type: 'string',
          enum: [...ALERT_TYPE_VALUES],
          description:
            'price_above / price_below: fires once the price crosses threshold (raw dollars). ' +
            'pct_change_up / pct_change_down: fires on a single-day move of at least threshold (decimal fraction — 0.05 = 5%). ' +
            'near_52w_high / near_52w_low: fires when price is within threshold of the 52-week extreme (decimal fraction — 0.02 = within 2%). ' +
            'all_time_high: fires on any new all-time-high close — threshold is unused.',
        },
        threshold: {
          type: 'number',
          minimum: 0,
          description: 'Meaning depends on alertType — see its description. Pass 0 for all_time_high.',
        },
      },
      required: ['ticker', 'alertType', 'threshold'],
      additionalProperties: false,
    }),
    execute: async ({ ticker, alertType, threshold }) => {
      const symbol = ticker.toUpperCase();
      const companyName = await resolveCompanyName(symbol);

      const tier = await getTier(userId);
      if (!isPro(tier)) {
        const db = supabase();
        const { data: activeRows } = await db
          .from('user_alerts')
          .select('symbol')
          .eq('user_id', userId)
          .eq('is_active', true);
        const activeSymbols = new Set(((activeRows ?? []) as { symbol: string }[]).map((r) => r.symbol));
        const isNewSymbol = !activeSymbols.has(symbol);
        if (isNewSymbol && activeSymbols.size >= FREE_ACTIVE_ALERT_LIMIT) {
          return {
            limitReached: true,
            error:
              `Cannot create this alert — the user's free plan is limited to ${FREE_ACTIVE_ALERT_LIMIT} stocks with ` +
              'active alerts, and they are already at that limit. Tell them plainly, suggest pausing/removing an alert ' +
              'on another stock to free a slot (or upgrading to Pro for unlimited alerts), and do NOT say the alert was created.',
          };
        }
      }

      return {
        ...clientAction({
          type: 'createAlert',
          ticker: symbol,
          companyName,
          alertType,
          threshold,
        }),
        creating: `${alertTypeLabel(alertType)} alert for ${companyName} (${symbol}) — ${describeAlert({ alertType, threshold })}`,
        confirmation: AWAITING_CONFIRMATION,
      };
    },
  });
}

/**
 * Read-only companion to createAlert, registered for every signed-in user
 * (same as createAlert). Unlike holdings, alerts carry no position sizes or
 * money, and Bull can already write them, so reading them sits behind no
 * extra opt-in.
 */
export function getMyAlertsTool(userId: string) {
  return tool({
    description:
      'Read the price and metric alerts the user has set up. Use when they ask what alerts they have, whether ' +
      'they have one on a stock ("do I have an alert on MU?"), which have fired recently, or want a summary. ' +
      'Free from any API budget. Returns each alert with its condition, whether it is active or paused, and when ' +
      'it last fired. Free accounts may have active alerts on up to ' + FREE_ACTIVE_ALERT_LIMIT + ' stocks; ' +
      'isPro says whether that cap applies.',
    inputSchema: jsonSchema<Record<string, never>>({
      type: 'object',
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => {
      const [{ data, error }, tier] = await Promise.all([
        supabase()
          .from('user_alerts')
          .select('symbol, company_name, alert_type, threshold, is_active, last_triggered_at, trigger_count')
          .eq('user_id', userId)
          .order('symbol'),
        getTier(userId),
      ]);
      if (error) return { error: 'Could not load alerts.' };

      type Row = {
        symbol: string; company_name: string | null; alert_type: AlertType; threshold: number;
        is_active: boolean; last_triggered_at: string | null; trigger_count: number;
      };
      const alerts = ((data ?? []) as Row[]).map((r) => ({
        ticker: r.symbol,
        companyName: r.company_name,
        condition: describeAlert({ alertType: r.alert_type, threshold: r.threshold }),
        status: r.is_active ? 'active' : 'paused',
        lastTriggeredAt: r.last_triggered_at,
        timesTriggered: r.trigger_count,
      }));
      return {
        alertCount: alerts.length,
        stocksWithActiveAlerts: new Set(alerts.filter((a) => a.status === 'active').map((a) => a.ticker)).size,
        isPro: isPro(tier),
        alerts,
      };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Portfolio Context (read-only — only registered when the user has
// opted in via Settings > Ask Bull > "Let Bull see my holdings & watchlist")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Only built and registered when the user opts in (see runAgent in agent.ts).
 * Deliberately lightweight: cost-basis position sizing from Supabase only, no
 * TwelveData calls, no scored risk output. The dedicated Portfolio Risk
 * Analysis feature on the Holdings page (Claude Sonnet, live market values,
 * a weighted 6-dimension rubric, saved history, Pro-gated) is the deep,
 * comparable-over-time report — this tool exists so Bull can answer quick
 * conversational questions about what the user actually owns, not to
 * reproduce that report. The tool description tells the model to defer to
 * Risk Analysis for anything wanting that depth.
 */
export function getPortfolioContextTool(userId: string, allowed: boolean) {
  return tool({
    description:
      'Read the user\'s actual holdings and watchlist. Use when the user asks about their own portfolio in a way ' +
      'that needs the real data — "what do I own", "how much of my portfolio is in tech", "am I overweight NVDA", ' +
      '"what\'s on my watchlist", "do any of my holdings report earnings soon". Position weights returned here are by ' +
      'COST BASIS (what was paid), not live market value, so treat them as a rough guide. If the user wants a precise, ' +
      'scored risk assessment (diversification score, stress-test scenarios, live-priced weights), do NOT attempt that ' +
      'yourself — tell them to run Portfolio Risk Analysis on the Holdings page instead; that feature is built for ' +
      'exactly that and keeps a history to compare over time. If the result says holdings access is off, tell the ' +
      'user exactly that and how to turn it on, or offer to answer for tickers they name. Never guess what they own.',
    inputSchema: jsonSchema<Record<string, never>>({
      type: 'object',
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => {
      // Registered even when off: without it the model did not know the
      // setting existed and answered portfolio questions with a guess.
      if (!allowed) {
        return {
          holdingsAccess: 'off' as const,
          howToTurnOn: 'Settings > Ask Bull > "Let Bull see my holdings and watchlist"',
        };
      }
      const [holdingsResult, watchlistRes] = await Promise.all([
        getHoldings(userId),
        supabase()
          .from('user_watchlist')
          .select('symbol, company_name')
          .eq('user_id', userId)
          .order('added_at', { ascending: false }),
      ]);

      if (!holdingsResult.success) {
        return { error: 'Could not load holdings.' };
      }

      const holdings = holdingsResult.holdings ?? [];
      const totalCostBasis = holdings.reduce(
        (sum, h) => sum + (h.quantity ?? 0) * (h.avg_price ?? 0),
        0
      );

      const positions = holdings.map((h) => {
        const costBasis = (h.quantity ?? 0) * (h.avg_price ?? 0);
        return {
          ticker: h.symbol,
          companyName: h.company_name,
          quantity: h.quantity,
          avgPrice: h.avg_price,
          assetType: h.asset_type,
          approxWeightPct:
            totalCostBasis > 0 ? Number(((costBasis / totalCostBasis) * 100).toFixed(1)) : null,
        };
      });

      return {
        holdingsCount: positions.length,
        positions,
        weightBasis: 'cost' as const,
        // One row per stock per list, so a stock in two lists comes back twice.
        watchlist: [...new Map(((watchlistRes.data ?? []) as Array<{ symbol: string; company_name: string }>)
          .map((w) => [w.symbol, { ticker: w.symbol, companyName: w.company_name }])).values()],
      };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TwelveData live tools
// ─────────────────────────────────────────────────────────────────────────────

const getLiveQuote = tool({
  description:
    'Fetch the current stock price and day change for a ticker. Use it whenever the answer depends on where a ' +
    'price is now: what a stock trades at, its move today, a pullback or dip, how far it sits from the user\'s ' +
    'average cost or its 52-week high. Costs 1 API credit, so fetch it rather than offer to; for several tickers, ' +
    'call it once per ticker in the same step. session says which price this is: regular (market open), ' +
    'pre-market or after-hours (an extended-hours trade at extendedTradeAt, the same price the Holdings page ' +
    'shows), or closed (the last regular close, no extended trade since). changePercent is measured from ' +
    'previousClose. Outside the regular session, open, high and low belong to the last regular session. Word ' +
    'the move to match the session: "up 0.3% in pre-market", or "closed down 1.5% on Friday", never "today" for ' +
    'a session that has ended.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol, e.g. AAPL, NVDA, TSM' },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker }) => {
    const symbol = ticker.toUpperCase();
    try {
      // Off-session a plain quote is the last close and that session's change,
      // which Bull reported as "down 1.5% today" on a Monday pre-market. prepost
      // returns the extended-hours trade instead, as the stock page and Holdings do.
      const extended = isOutsideRegularSessionET();
      const q = (await getStockQuotes([symbol], { prepost: extended })).get(symbol);
      if (!q) return { error: `Could not fetch quote for ${symbol}.` };
      // Label by the trade's own time: before Monday's first pre-market trade
      // the extended price is still Friday's after-hours print.
      const etHour = q.et != null
        ? Number(new Date(q.et * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
        : null;
      const session = !extended ? 'regular' : etHour == null ? 'closed' : etHour < 12 ? 'pre-market' : 'after-hours';
      // StockQuote uses short Finnhub-style fields: c=close, d=change, dp=changePercent,
      // h=high, l=low, o=open, pc=previousClose, t=timestamp, et=extended trade time
      const changeSign = (q.d ?? 0) >= 0 ? '+' : '';
      return {
        ticker: symbol,
        session,
        ...(q.et != null && session !== 'regular' ? {
          extendedTradeAt: new Date(q.et * 1000).toLocaleString('en-US', {
            timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit',
          }) + ' ET',
        } : {}),
        price: q.c != null ? `$${q.c.toFixed(2)}` : 'N/A',
        priceRaw: q.c ?? null,
        change: q.d != null ? `${changeSign}${q.d.toFixed(2)}` : 'N/A',
        changePercent: q.dp != null ? `${changeSign}${q.dp.toFixed(2)}%` : 'N/A',
        open: q.o != null ? `$${q.o.toFixed(2)}` : 'N/A',
        high: q.h != null ? `$${q.h.toFixed(2)}` : 'N/A',
        low: q.l != null ? `$${q.l.toFixed(2)}` : 'N/A',
        previousClose: q.pc != null ? `$${q.pc.toFixed(2)}` : 'N/A',
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch quote for ${symbol}: ${(err as Error).message}` };
    }
  },
});

/** Calendar days of daily bars: ~345 trading days, enough for a 300-day SMA plus its 20-bar slope. */
const TECHNICALS_DAYS = 500;

const etDate = (unix: number) => new Date(unix * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const getTechnicals = tool({
  description:
    'Read a ticker\'s chart from its daily price history: simple moving averages and where the price sits against ' +
    'each, RSI(14), the 52-week high and low, and support and resistance levels. Use it for any question about ' +
    'the chart or price trend: "is it above its 200-day", "where is support", "is it oversold", "is it in a ' +
    'downtrend", "how far from the high". Costs about 2 API credits, so fetch it rather than offer to or send the ' +
    'user to the chart. smaLengths defaults to 20, 50, 100, 150 and 200; pass the lengths the user names (up to 300). ' +
    'Support and resistance are price zones where at least one swing low or high turned in the last year, nearest ' +
    'first; touches counts how many times the price turned there, and more touches make a level more meaningful. ' +
    'A level with one touch is a single swing point, say so rather than calling it strong support. pctFromPrice and ' +
    'distancePct are how far the current price is above (positive) or below (negative) that level. Levels describe ' +
    'what the price has done, never a prediction.',
  inputSchema: jsonSchema<{ ticker: string; smaLengths?: number[] }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Ticker symbol, e.g. AAPL, GEV, BTC/USD' },
      smaLengths: {
        type: 'array',
        items: { type: 'integer', minimum: 2, maximum: 300 },
        maxItems: 6,
        description: 'Moving-average lengths in trading days. Omit for 20, 50, 100, 150, 200.',
      },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker, smaLengths }) => {
    const symbol = ticker.toUpperCase();
    const lengths = smaLengths?.filter((n) => Number.isInteger(n) && n >= 2 && n <= 300).slice(0, 6);
    try {
      const now = Math.floor(Date.now() / 1000);
      // Bars cache for an hour: SMAs and levels barely move intraday, and the
      // live quote below supplies the current price.
      const gated = await gatedFetch(`technicals-bars:${symbol}`, symbol, 'candles', 1, 60 * 60, () =>
        getStockCandles(symbol, now - TECHNICALS_DAYS * 86_400, now, 'D'),
      );
      if (gated.denied) return { error: 'Market data is busy right now. Try again in a minute.' };
      const bars = gated.data;
      if (bars.t.length < 30) return { error: `Not enough price history for ${symbol}.` };

      const quote = (await getStockQuotes([symbol])).get(symbol);
      const live = quote?.c ?? null;
      const price = live ?? bars.c[bars.c.length - 1];
      const t = computeTechnicals(bars, price, lengths?.length ? lengths : undefined);
      const level = (l: (typeof t.support)[number]) => ({ ...l, lastTouched: etDate(l.lastTouched) });
      return {
        ticker: symbol,
        price: t.price,
        priceSource: live != null ? 'live quote' : `last close ${etDate(bars.t[bars.t.length - 1])}`,
        historyFrom: etDate(bars.t[0]),
        movingAverages: t.movingAverages,
        ...(t.unavailableLengths.length ? { notEnoughHistoryFor: t.unavailableLengths } : {}),
        rsi14: t.rsi14,
        high52w: { ...t.high52w, at: etDate(t.high52w.at) },
        low52w: { ...t.low52w, at: etDate(t.low52w.at) },
        support: t.support.map(level),
        resistance: t.resistance.map(level),
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch price history for ${symbol}: ${(err as Error).message}` };
    }
  },
});

const getKeyStatistics = tool({
  description:
    'Fetch key valuation and financial statistics for a stock: P/E ratio (TTM and forward), ' +
    'P/B ratio, EV/EBITDA, beta, market cap, dividend yield, profit margin, short ratio, and growth rates. ' +
    'Use when the user asks whether a stock is expensive, its valuation multiples, or general financial health. ' +
    // Said ~200 until 2026-10-26; /statistics is ~53 (screener/refresh measures
    // 5 x 53), and the overstatement made Bull ask permission instead of fetching.
    'Costs about 50 API credits, cached for a day. For a set of stocks, screenStocks has nightly P/E, forward ' +
    'P/E and P/B for free; use this when a stock is not covered there, its row is stale, or EV/EBITDA, short ' +
    'ratio or EPS growth is needed.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol' },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker }) => {
    try {
      const symbol = ticker.toUpperCase();
      const outcome = await gatedFetch(`stats:${symbol}`, symbol, 'statistics', 50, STATS_TTL_SECONDS, () => getStatistics(symbol));
      if (outcome.denied) return { error: 'Rate limit reached fetching statistics. Try again shortly.' };
      const s = outcome.data;
      return {
        ticker: s.symbol,
        marketCap: fmt(s.marketCap),
        peRatioTTM: s.peRatioTTM?.toFixed(2) ?? 'N/A',
        peRatioForward: s.peRatioForward?.toFixed(2) ?? 'N/A',
        pbRatio: s.pbRatio?.toFixed(2) ?? 'N/A',
        evToEbitda: s.evToEbitda?.toFixed(2) ?? 'N/A',
        beta: s.beta?.toFixed(2) ?? 'N/A',
        dividendYield: fmtPct(s.dividendYield),
        profitMargin: fmtPct(s.profitMargin),
        shortRatio: s.shortRatio?.toFixed(2) ?? 'N/A',
        week52High: s.week52High != null ? `$${s.week52High.toFixed(2)}` : 'N/A',
        week52Low: s.week52Low != null ? `$${s.week52Low.toFixed(2)}` : 'N/A',
        week52HighRaw: s.week52High ?? null,
        week52LowRaw: s.week52Low ?? null,
        revenueGrowthTTM: fmtPct(s.revenueGrowthTTM),
        epsGrowthTTM: fmtPct(s.epsGrowthTTM),
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch statistics for ${ticker}: ${(err as Error).message}` };
    }
  },
});

const getCompanyFinancials = tool({
  description:
    'Fetch financial statement data (income statement, balance sheet, or cash flow) for any stock. ' +
    'Works for any ticker globally, not just companies in the BullPen database. ' +
    'Use when the user asks about revenue, profit, debt, free cash flow, or any line item from financial statements. ' +
    // Said ~30 credits until 2026-09-22. It calls /income_statement,
    // /balance_sheet or /cash_flow, each measured at ~101 credits against
    // TwelveData's own api-credits-used header (CLAUDE.md, 2026-08-04). The
    // old figure understated it 3.4x, in the one number the model uses to
    // decide between this and the 1-credit single-metric tool.
    'Expensive: about 100 API credits per call, against 1 credit for getCompanyMetrics. ' +
    'Prefer getCompanyMetrics when a single line item over time would answer the question; ' +
    'use this when the user wants a whole statement. Results are cached server-side for 24h.',
  inputSchema: jsonSchema<{ ticker: string; type: 'income' | 'balance' | 'cashflow'; period: 'annual' | 'quarterly' }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol' },
      type: {
        type: 'string',
        enum: ['income', 'balance', 'cashflow'],
        description: '"income" for revenue/profit/EPS, "balance" for assets/debt/equity, "cashflow" for operating/free cash flow',
      },
      period: {
        type: 'string',
        enum: ['annual', 'quarterly'],
        description: 'Reporting period. Default to "annual" unless user asks for quarterly.',
      },
    },
    required: ['ticker', 'type', 'period'],
  }),
  execute: async ({ ticker, type, period }) => {
    try {
      const sym = ticker.toUpperCase();
      const outcome = await fetchGatedStatementRows(sym, type, period);
      if (outcome.denied) return { error: 'Rate limit reached fetching financials. Try again shortly.' };
      if (type === 'income') {
        const rows = outcome.data as IncomeStatementPeriod[];
        return rows.slice(0, 4).map((r) => ({
          period: r.fiscal_date,
          revenue: fmt(r.revenue),
          grossProfit: fmt(r.gross_profit),
          operatingIncome: fmt(r.operating_income),
          netIncome: fmt(r.net_income),
          ebitda: fmt(r.ebitda),
          epsBasic: r.eps_basic?.toFixed(2) ?? 'N/A',
          epsDiluted: r.eps_diluted?.toFixed(2) ?? 'N/A',
        }));
      } else if (type === 'balance') {
        const rows = outcome.data as BalanceSheetPeriod[];
        return rows.slice(0, 4).map((r) => ({
          period: r.fiscal_date,
          totalAssets: fmt(r.total_assets),
          totalCurrentAssets: fmt(r.total_current_assets),
          cash: fmt(r.cash_and_equivalents),
          totalLiabilities: fmt(r.total_liabilities),
          longTermDebt: fmt(r.long_term_debt),
          equity: fmt(r.total_stockholders_equity),
          retainedEarnings: fmt(r.retained_earnings),
        }));
      } else {
        const rows = outcome.data as CashFlowPeriod[];
        return rows.slice(0, 4).map((r) => ({
          period: r.fiscal_date,
          operatingCashFlow: fmt(r.operating_cash_flow),
          investingCashFlow: fmt(r.investing_activities_cash_flow),
          financingCashFlow: fmt(r.financing_activities_cash_flow),
          capitalExpenditures: fmt(r.capital_expenditures),
          freeCashFlow: fmt(r.free_cash_flow),
          dividendsPaid: fmt(r.dividends_paid),
        }));
      }
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch ${type} statement for ${ticker}: ${(err as Error).message}` };
    }
  },
});

const getLiveCompanyProfile = tool({
  description:
    'Fetch a company\'s live profile — sector, industry, description, CEO, employee count, headquarters, ' +
    'and website — directly from market data, for ANY ticker globally. Use this whenever getCompanyProfile ' +
    '(the Supabase one) returns "not found", or whenever the user wants a general company overview for a ' +
    'ticker that may not be in BullPen\'s ingested database. ' +
    'Costs ~1 API credit.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol, e.g. NOW, AAPL, MSFT' },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker }) => {
    try {
      const p = await getTwelveDataProfile(ticker.toUpperCase());
      return {
        ticker: p.symbol,
        name: p.name,
        sector: p.sector,
        industry: p.industry,
        description: p.description,
        ceo: p.ceo,
        employees: p.employees,
        website: p.website,
        headquarters: [p.city, p.state, p.country].filter(Boolean).join(', ') || null,
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch profile for ${ticker}: ${(err as Error).message}` };
    }
  },
});

// Said "and upcoming earnings dates" until 2026-10-22, but /earnings returns
// past reports. Asked "any of my holdings have earnings soon?", Bull called
// this once per holding and could name no date, only six history cards.
const getEarningsData = tool({
  description:
    'Fetch one stock\'s PAST earnings: EPS estimates vs actuals and beat/miss for its recent reports. ' +
    'Use when the user asks whether a company beat earnings or about its EPS history. ' +
    'It does not give the next report date: use getUpcomingEarnings for "when does X report" or ' +
    '"which of my stocks report soon". Costs ~20 API credits.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol' },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker }) => {
    try {
      const symbol = ticker.toUpperCase();
      const outcome = await gatedFetch(
        `ai-earnings:${symbol}`, symbol, 'earnings_history', 20, EARNINGS_TTL_SECONDS,
        () => getCompanyEarnings(symbol, 8)
      );
      if (outcome.denied) return { error: 'Rate limit reached fetching earnings. Try again shortly.' };
      const earnings = outcome.data;
      // An object with the ticker, not a bare array: the card has to say whose
      // history it is, or several in one reply are anonymous.
      return {
        ticker: symbol,
        history: earnings.map((e) => {
          const beat = e.actual != null && e.estimate != null
            ? e.actual >= e.estimate ? 'Beat' : 'Missed'
            : 'N/A';
          return {
            period: e.period,
            epsActual: e.actual?.toFixed(2) ?? 'N/A',
            epsEstimate: e.estimate?.toFixed(2) ?? 'N/A',
            epsActualRaw: e.actual ?? null,
            epsEstimateRaw: e.estimate ?? null,
            result: beat,
            surprise: e.surprisePercent != null ? `${e.surprisePercent > 0 ? '+' : ''}${e.surprisePercent.toFixed(1)}%` : 'N/A',
          };
        }),
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch earnings for ${ticker}: ${(err as Error).message}` };
    }
  },
});

/** Nasdaq writes BMO/AMC, TwelveData "Pre Market" / "After Hours". */
function reportSession(time: string | undefined): 'before open' | 'after close' | null {
  const t = (time ?? '').toLowerCase();
  if (t === 'bmo' || t.startsWith('pre')) return 'before open';
  if (t === 'amc' || t.startsWith('after')) return 'after close';
  return null;
}

/**
 * Cache only, zero credits: the market calendar the prefetch cron keeps warm
 * WARM_DAYS_FORWARD ahead, then each stock page's cached /earnings rows for
 * dates past that window. A ticker in neither gets no date rather than a
 * live fan-out, since the question is usually about a whole portfolio.
 */
const getUpcomingEarnings = tool({
  description:
    'Next earnings report date for one or more stocks, e.g. every holding or watchlist stock the user has. ' +
    'Use for "when does X report", "any of my holdings have earnings soon", "what reports this week". ' +
    'Pass all tickers in ONE call. Free: reads BullPen\'s earnings calendar, no API credits. ' +
    'Answer in text, one line per stock with its date and, when known, "before open" or "after close". ' +
    'estimated: true means the date is projected from past reporting dates, not announced by the company: say so. ' +
    'reportedRecently lists stocks that already reported in the past week: say when, they are not missing. ' +
    'Tickers under noDateFound have no date on file (often ETFs, funds or crypto, which do not report earnings); ' +
    'say that rather than guessing. Do not also call getEarningsData unless the user asked about past results. ' +
    'The result already puts Yes/No buttons to open the full earnings calendar under your reply, so do not ' +
    'call navigateTo for it.',
  inputSchema: jsonSchema<{ tickers: string[] }>({
    type: 'object',
    properties: {
      tickers: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: SCREEN_TICKER_CAP,
        description: 'Stock tickers, e.g. ["MU", "AAPL"].',
      },
    },
    required: ['tickers'],
    additionalProperties: false,
  }),
  execute: async ({ tickers }) => {
    const wanted = new Set(tickers.map((t) => t.toUpperCase()));
    const today = todayET();
    type Row = { ticker: string; name: string | null; date: string; session: string | null; estimated: boolean };
    const found = new Map<string, Row>();
    // The warmed week behind today too: asked the day after TSLA and META
    // reported, a forward-only read left them dateless and Bull guessed.
    const recent = new Map<string, Row>();

    try {
      const { byDate } = await getCalendarRange<EarningsCalendarItem>(
        'earnings', addDays(today, -WARM_DAYS_BACK), addDays(today, WARM_DAYS_FORWARD), { allowFetch: false }
      );
      for (const date of [...byDate.keys()].sort()) {
        for (const r of byDate.get(date) ?? []) {
          const sym = r.symbol?.toUpperCase();
          if (!wanted.has(sym)) continue;
          const row = { ticker: sym, name: r.name ?? null, date, session: reportSession(r.time), estimated: r.date_estimated === true };
          if (date < today) recent.set(sym, row);
          else if (!found.has(sym)) found.set(sym, row);
        }
      }
    } catch {
      // Fall through to the per-stock cache below.
    }

    await Promise.all([...wanted].filter((s) => !found.has(s)).map(async (sym) => {
      const rows = await getCachedStale<Array<{ date: string; time?: string; epsActual: number | null }>>(`snap-earnings:${sym}`).catch(() => null);
      const next = (rows ?? []).filter((r) => r.date >= today && r.epsActual == null).sort((a, b) => a.date.localeCompare(b.date))[0];
      // Past the calendar window, so no company announcement backs it yet.
      if (next) found.set(sym, { ticker: sym, name: null, date: next.date, session: reportSession(next.time), estimated: true });
    }));

    // The calendar offer rides on this result. Left to a separate navigateTo
    // call, the model drafted the list in hidden reasoning, made the call,
    // and replied with only "use the buttons below" three tries out of three.
    const calendar = resolveDestination('calendar', {});
    return {
      today,
      upcoming: [...found.values()].sort((a, b) => a.date.localeCompare(b.date)),
      reportedRecently: [...recent.values()].filter((r) => !found.has(r.ticker)),
      noDateFound: [...wanted].filter((s) => !found.has(s) && !recent.has(s)),
      ...('error' in calendar ? {} : {
        ...navigateAction(calendar.path, calendar.label, false),
        // The card is bare Yes/No buttons, so the reply has to ask the question.
        note: 'Yes/No buttons that open the earnings calendar appear under your reply. Write the dated list, then ' +
          'end with one short question offering the full earnings calendar. Do not mention the buttons.',
      }),
    };
  },
});

const INSIDER_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Per-request factory (like createAlertTool/getPortfolioContextTool) because
 * this needs the caller's tier: /api/stock/[ticker]/insider-transactions
 * gates this data to Pro on the page, and this tool must match — otherwise a
 * free-tier chat user gets a Pro-only, 200-credit-per-symbol feature for free
 * just by asking Bull instead of visiting the page.
 */
export function getInsiderActivityTool(userId: string) {
  return tool({
    description:
      'Fetch recent insider trading activity for a stock — buys and sells by executives, directors, and ' +
      '10%+ shareholders, aggregated into net buy/sell value plus the top individual trades. ' +
      'Use only when the user explicitly asks about insider buying/selling, executive trades, or insider ' +
      'sentiment — do not call this speculatively. Pro feature. Costs ~200 API credits.',
    inputSchema: jsonSchema<{ ticker: string }>({
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol' },
      },
      required: ['ticker'],
    }),
    execute: async ({ ticker }) => {
      try {
        const tier = await getTier(userId);
        if (!isPro(tier)) {
          return { error: 'Insider activity is a Pro feature. Let the user know they can upgrade to unlock it.' };
        }

        const symbol = ticker.toUpperCase();
        const outcome = await gatedFetch(
          `insider:${symbol}`, symbol, 'insider_transactions', 200, INSIDER_TTL_SECONDS,
          () => getInsiderTransactions(symbol)
        );
        if (outcome.denied) return { error: 'Rate limit reached fetching insider activity. Try again shortly.' };
        const transactions = outcome.data;
        if (transactions.length === 0) {
          return { ticker: symbol, tradeCount: 0, note: 'No recent insider transactions found.' };
        }

        const buys = transactions.filter((t) => t.transaction_type === 'buy');
        const sells = transactions.filter((t) => t.transaction_type === 'sell');
        const buyValueRaw = buys.reduce((sum, t) => sum + Math.abs(t.value || 0), 0);
        const sellValueRaw = sells.reduce((sum, t) => sum + Math.abs(t.value || 0), 0);
        const netValueRaw = buyValueRaw - sellValueRaw;
        const sentiment: 'bullish' | 'bearish' | 'neutral' =
          netValueRaw > 0 ? 'bullish' : netValueRaw < 0 ? 'bearish' : 'neutral';

        const topTransactions = transactions
          .slice()
          .sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0))
          .slice(0, 3)
          .map((t) => ({
            name: t.full_name,
            position: t.position,
            type: t.transaction_type,
            value: fmt(Math.abs(t.value)),
            date: t.date_reported,
          }));

        return {
          ticker: symbol,
          buyValue: fmt(buyValueRaw),
          sellValue: fmt(sellValueRaw),
          netValue: `${netValueRaw >= 0 ? '+' : '-'}${fmt(Math.abs(netValueRaw))}`,
          buyValueRaw,
          sellValueRaw,
          netValueRaw,
          tradeCount: transactions.length,
          sentiment,
          topTransactions,
        };
      } catch (err) {
        if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
        return { error: `Could not fetch insider activity for ${ticker}: ${(err as Error).message}` };
      }
    },
  });
}

const getHealthScore = tool({
  description:
    'Fetch BullPen\'s computed Financial Health score (0-100, grade A-F) for a stock — the same score ' +
    'shown on the stock page\'s Financial Health card, broken into Profitability, Financial Strength, ' +
    'Cash Flow, Growth, and Market Risk. It measures business quality and safety, not price: a healthy company ' +
    'can still be expensive. Use this whenever the user asks about a company\'s "financial health", ' +
    '"financial strength", overall quality/fundamentals, or asks for a health score/grade. ' +
    'Works for any ticker globally. Costs ~250 API credits on a cold cache (free once cached for the day).',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol, e.g. NOW, AAPL, MSFT' },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker }) => {
    const symbol = ticker.toUpperCase();
    try {
      const { healthScore: hs } = await getHealthScoreForSymbol(symbol);
      if (hs.insufficientData) {
        return { ticker: symbol, error: 'No health score: BullPen has no balance sheet or cash flow statement for this company.' };
      }
      return {
        ticker: symbol,
        score: hs.score,
        grade: hs.grade,
        label: hs.label,
        summary: hs.summary,
        categories: hs.categories.map((c) => ({
          name: c.name,
          score: c.score,
          max: c.max,
          label: c.dataAvailable === false ? 'N/A (no data)' : c.label,
        })),
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not compute health score for ${ticker}: ${(err as Error).message}` };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Data-only tools — no navigation or portfolio mutation. Shared by any AI
// surface that needs company/financial data lookups (main chat, chart
// assistant, etc.) regardless of where in the app it's embedded.
// ─────────────────────────────────────────────────────────────────────────────

export const COMPANY_DATA_TOOLS = {
  getCompanyProfile,
  searchCompanies,
  getCompanyMetrics,
  compareCompanies,
  getLiveQuote,
  getTechnicals,
  getKeyStatistics,
  getCompanyFinancials,
  getEarningsData,
  getUpcomingEarnings,
  getHealthScore,
  getLiveCompanyProfile,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Washington Trading (stored disclosures only — no API credits)
// ─────────────────────────────────────────────────────────────────────────────

const getPoliticianTrades = tool({
  description:
    "Look up stock trades disclosed by the politicians BullPen tracks (members of Congress and a few executive-branch " +
    "officials, including Donald Trump). Use for \"what has Pelosi bought lately\", \"did any politicians trade NVDA\", " +
    '"who in Congress sold Microsoft". Pass a politician name, a ticker, or both. Free: reads stored disclosures, no API ' +
    'credits. Each trade carries the filed amount RANGE (never state a single dollar figure), the trade and disclosure ' +
    'dates, and movePct: how far the stock moved between the trade and the day it became public. Always say that trades ' +
    'are disclosed up to 45 days late, so this is history, not a live signal, and never frame it as a reason to buy. ' +
    'Only tracked politicians are covered; an empty result does not mean nobody in Congress traded the stock.',
  inputSchema: jsonSchema<{ politician?: string; ticker?: string; days?: number }>({
    type: 'object',
    properties: {
      politician: { type: 'string', description: 'Full or partial name, e.g. "Pelosi", "Tuberville", "Trump"' },
      ticker: { type: 'string', description: 'Stock ticker, e.g. NVDA' },
      days: { type: 'number', minimum: 1, maximum: 730, description: 'Look-back window by trade date. Default 180.' },
    },
    additionalProperties: false,
  }),
  execute: async ({ politician, ticker, days = 180 }) => {
    if (!politician && !ticker) return { error: 'Pass a politician name, a ticker, or both.' };
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    let query = supabase()
      .from('congress_trades')
      .select('symbol, trade_type, amount_range, transaction_date, disclosure_date, price_at_trade, price_at_disclosure, congress_politicians!inner(slug, display_name, party, chamber, is_active)')
      .eq('congress_politicians.is_active', true)
      .not('symbol', 'is', null)
      .gte('transaction_date', since)
      .order('transaction_date', { ascending: false })
      .limit(40);
    if (ticker) query = query.eq('symbol', ticker.toUpperCase());
    if (politician) query = query.ilike('congress_politicians.display_name', `%${politician.replace(/[%_]/g, '')}%`);
    const { data, error } = await query;
    if (error) return { error: 'Could not load politician trades.' };

    type Row = {
      symbol: string; trade_type: string; amount_range: string; transaction_date: string; disclosure_date: string | null;
      price_at_trade: number | null; price_at_disclosure: number | null;
      congress_politicians: { slug: string; display_name: string; party: string | null; chamber: string | null };
    };
    const trades = ((data ?? []) as unknown as Row[]).map((r) => {
      const pt = r.price_at_trade == null ? null : Number(r.price_at_trade);
      const pd = r.price_at_disclosure == null ? null : Number(r.price_at_disclosure);
      return {
        politician: r.congress_politicians.display_name,
        party: r.congress_politicians.party,
        chamber: r.congress_politicians.chamber,
        ticker: r.symbol,
        action: r.trade_type,
        amountRange: r.amount_range,
        tradeDate: r.transaction_date,
        disclosedDate: r.disclosure_date,
        movePct: pt && pd != null ? Number((((pd - pt) / pt) * 100).toFixed(1)) : null,
        memberPage: `/discover/politicians/${r.congress_politicians.slug}`,
      };
    });
    return { windowDays: days, count: trades.length, trades };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// BullPen's own published content — read-only, gated exactly like its page.
//
// The rule for what Bull may read: whatever THIS viewer would see on that page
// right now, never more. "It's shown in the app" is not the line, because most
// of these surfaces have a free layer and a Pro layer cut server-side (the
// pick thesis, the brief body, fund holdings). Each tool below reuses the
// page's own gate, so the chat can't become a way round the paywall.
// Nothing here writes: selects only. Other users' rows, billing, auth, admin
// tables and unpublished drafts are out of scope entirely.
// ─────────────────────────────────────────────────────────────────────────────

function byValue<T extends { valueUsd: number }>(rows: T[], n = 10): T[] {
  return [...rows].sort((a, b) => b.valueUsd - a.valueUsd).slice(0, n);
}

const PRO_LOCKED_NOTE =
  'This part is Pro. Do not guess at or paraphrase what it says. Tell the user it is part of Pro and where in the app it lives.';

export function appContentTools(userId: string | null) {
  return {
    getWeeklyPicks: tool({
      description:
        "Read Bull's Weekly Pick: the latest (or a given week's) pick with its headline, one-liner, entry price and " +
        'live return vs the S&P 500, plus the full track record of every past pick (wins and losses), optionally ' +
        "for one quarter. Use for any question about the weekly pick(s), this quarter's picks, or how the picks " +
        'have performed. The thesis and risks are included only when this user can read them on /picks. ' +
        'Free: stored data plus a couple of cached quotes.',
      inputSchema: jsonSchema<{ pickDate?: string; quarter?: string }>({
        type: 'object',
        properties: {
          pickDate: { type: 'string', description: 'YYYY-MM-DD of a specific pick. Omit for the latest.' },
          quarter: { type: 'string', description: 'Scope the track record to picks made in one quarter, e.g. 2026-Q4. Omit for all.' },
        },
        additionalProperties: false,
      }),
      execute: async ({ pickDate, quarter }) => {
        if (quarter && !QUARTER_RE.test(quarter)) return { error: 'quarter must look like 2026-Q4.' };
        try {
          const row = pickDate ? await getPickRowByDate(pickDate) : await getLatestPickRow();
          if (!row) return { error: pickDate ? `No pick was published on ${pickDate}.` : 'No pick has been published yet.' };
          const [access, perf, record] = await Promise.all([
            resolveThesisAccess(userId ? { userId } : null, row.pick_date, row.model),
            livePerformanceFor(row),
            getCachedPerformance(quarter),
          ]);
          // metricsSnapshot is the pipeline's working data, not something the page shows as prose.
          const { metricsSnapshot: _m, logoUrl: _l, ...pick } = toDetail(row, perf, access);
          return {
            pick: { ...pick, page: `/picks/${row.pick_date}` },
            ...(pick.locked
              ? {
                  thesisNote:
                    access.lockReason === 'anonymous'
                      ? 'The full thesis is for signed-in users. Do not guess at it.'
                      : access.lockReason === 'free_available'
                      ? 'This free account can unlock one full thesis a month with the "Read the full thesis" button on the pick page. Do not guess at the thesis.'
                      : PRO_LOCKED_NOTE,
                }
              : {}),
            trackRecord: {
              quarter: quarter ?? 'all',
              summary: record.summary,
              quartersAvailable: record.quarters,
              picks: record.picks.map((p) => ({
                pickDate: p.pickDate, symbol: p.symbol, company: p.companyName, headline: p.headline,
                status: p.status, entryPrice: p.entryPrice, currentPrice: p.currentPrice,
                returnPct: p.returnPct, sp500ReturnPct: p.benchmarkReturnPct,
              })),
            },
            disclaimer: 'Hypothetical returns from a published research pick, not advice. Never frame a pick as a reason to buy.',
          };
        } catch (err) {
          if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
          return { error: 'Could not load the weekly pick.' };
        }
      },
    }),

    getDailyBrief: tool({
      description:
        "Read BullPen's Daily Brief, the market summary published each morning before the US open (most recent " +
        'of the last two days). Use for "what\'s in today\'s brief", "what happened in the market today/yesterday" ' +
        'when the brief covers it. Free accounts get the title and TL;DR; Pro gets the full brief. Free: stored data.',
      inputSchema: jsonSchema<Record<string, never>>({ type: 'object', properties: {}, additionalProperties: false }),
      execute: async () => {
        if (!userId) return { error: 'The Daily Brief is for signed-in users. Suggest signing up to read it on Home.' };
        const [tier, { data }] = await Promise.all([
          getTier(userId),
          supabase()
            .from('daily_briefs')
            .select('published_date, title, content')
            .gte('published_date', new Date(Date.now() - 2 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))
            .order('published_date', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (!data) return { error: 'No brief has been published in the last two days.' };
        // sources is dropped for everyone: they are raw web titles/URLs, and
        // nothing in a chat answer needs them.
        const brief = data as { published_date: string; title: string; content: string };
        if (isPro(tier)) return { ...brief, page: '/' };
        return { ...toTeaser(brief), locked: true, note: `The rest of the brief is Pro. ${PRO_LOCKED_NOTE}`, page: '/' };
      },
    }),

    getEconomicCalendar: tool({
      description:
        'Scheduled US economic releases (jobs report, CPI, PCE, GDP, jobless claims, Fed decisions) in a date range, ' +
        'from the Market Events Calendar. Use for "when is the next Fed meeting", "is CPI this week". ' +
        'Times are UTC ISO; say them in ET. Free: stored data.',
      inputSchema: jsonSchema<{ from?: string; to?: string }>({
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD, default today' },
          to: { type: 'string', description: 'YYYY-MM-DD, default from + 31 days. At most 62 days after from.' },
        },
        additionalProperties: false,
      }),
      execute: async ({ from, to }) => {
        const start = from ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const end = to ?? new Date(Date.parse(start) + 31 * 86_400_000).toISOString().slice(0, 10);
        if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || end < start) return { error: 'Invalid date range.' };
        if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > 62) return { error: 'Range too long: 62 days at most.' };
        try {
          const rows = await getEconomicEvents(start, end);
          return { from: start, to: end, events: rows.map(({ source: _s, id: _id, ...e }) => e), page: '/tools/calendar' };
        } catch {
          return { error: 'Could not load the economic calendar.' };
        }
      },
    }),

    getInvestingIdeas: tool({
      description:
        "List BullPen's Investing Ideas: curated theme baskets on Discover (AI infrastructure and others) with the " +
        'tickers in each. Use for "what themes does BullPen have", "which stocks are in the X idea". These are ' +
        'ticker lists for research, not recommendations. Free: no data calls.',
      inputSchema: jsonSchema<Record<string, never>>({ type: 'object', properties: {}, additionalProperties: false }),
      execute: async () => ({
        ideas: THEME_DISPLAY_ORDER.map((t) => ({
          title: t.title, tagline: t.tagline, description: t.description, tickers: t.tickers, page: `/discover/ideas/${t.slug}`,
        })),
      }),
    }),

    getWhatsNew: tool({
      description:
        "BullPen's changelog: what has recently been added, improved or fixed in the app. Use for \"what's new\", " +
        '"can BullPen do X yet", "when did X ship". Free.',
      inputSchema: jsonSchema<{ days?: number }>({
        type: 'object',
        properties: { days: { type: 'number', minimum: 1, maximum: 30, description: 'How many changelog days to return, newest first. Default 5.' } },
        additionalProperties: false,
      }),
      execute: async ({ days = 5 }) => ({ entries: (changelog as unknown[]).slice(0, Math.min(30, Math.max(1, days))), page: '/changelog' }),
    }),

    getFundHoldings: tool({
      description:
        'The famous investment funds BullPen tracks from SEC 13F filings (Berkshire Hathaway, Bridgewater, ' +
        'Pershing Square, ARK and others). Without a fund: the list of tracked funds (free). With a fund: its ' +
        'latest reported top holdings and what it bought, sold and exited last quarter (Pro). 13Fs are filed up ' +
        'to 45 days after quarter end and list US long positions only: always say the data is that old. Free: stored data.',
      inputSchema: jsonSchema<{ fund?: string }>({
        type: 'object',
        properties: { fund: { type: 'string', description: 'Fund or manager name, e.g. "Berkshire", "Ackman", "Cathie Wood"' } },
        additionalProperties: false,
      }),
      execute: async ({ fund }) => {
        const { data } = await supabase()
          .from('institutional_investors')
          .select('slug, display_name, manager_name, description')
          .eq('is_active', true)
          .order('sort_order');
        const funds = (data ?? []) as Array<{ slug: string; display_name: string; manager_name: string | null; description: string | null }>;
        if (!fund) {
          return { funds: funds.map((f) => ({ name: f.display_name, manager: f.manager_name, page: `/discover/institutions/${f.slug}` })) };
        }
        const q = fund.toLowerCase();
        const match = funds.find((f) =>
          [f.slug, f.display_name, f.manager_name ?? ''].some((s) => s.toLowerCase().includes(q))
        );
        if (!match) return { error: `BullPen does not track "${fund}". Tracked funds: ${funds.map((f) => f.display_name).join(', ')}.` };
        const page = `/discover/institutions/${match.slug}`;
        if (!userId || !isPro(await getTier(userId))) {
          return { fund: match.display_name, manager: match.manager_name, page, locked: true, note: `Fund holdings are Pro. ${PRO_LOCKED_NOTE}` };
        }
        const result = await loadFundHoldings(match.slug, null);
        if (!result.ok) return { error: 'Could not load this fund\'s holdings.' };
        const { fund: f, filing, holdings, diff } = result.data;
        const brief = (h: DiffableHolding) => ({ ticker: h.symbol, name: h.companyName ?? h.nameOfIssuer, option: h.putCall ?? undefined, valueUsd: h.valueUsd, portfolioPct: h.portfolioPct });
        const change = (h: HoldingChange) => ({ ...brief(h), sharesChangePct: h.sharesChangePct });
        return {
          fund: f.displayName, manager: f.managerName, page,
          quarterEnded: filing.periodOfReport, filedOn: filing.filedDate,
          reportedValueUsd: filing.totalValueUsd, positions: filing.totalPositions,
          topHoldings: byValue(holdings, 25).map(brief),
          ...(diff ? {
            lastQuarter: {
              // Largest by dollars, not by % change: a tiny position tripling
              // is not what "what did Berkshire add" is asking about.
              newPositions: byValue(diff.newPositions).map(brief),
              exited: byValue(diff.exited).map(brief),
              increased: byValue(diff.increased).map(change),
              decreased: byValue(diff.decreased).map(change),
            },
          } : {}),
        };
      },
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported tool map (passed directly to streamText)
// ─────────────────────────────────────────────────────────────────────────────

export const BULLPEN_TOOLS = {
  // Supabase tools — fast, no API credits, limited to ingested companies
  getCompanyProfile,
  searchCompanies,
  getPoliticianTrades,
  // Navigation. navigateTo covers every page; openScreener and
  // openDividendCalculator stay separate because they carry real parameter
  // sets of their own. See lib/ai/app-destinations.ts.
  navigateTo,
  openScreener,
  openDividendCalculator,
  // Answers ranking questions from screener_stats (free)
  screenStocks,
  // Portfolio management
  addHolding,
  updateHolding,
  removeHolding,
  // TwelveData live tools — real-time data for any ticker globally
  getCompanyMetrics,
  compareCompanies,
  getLiveQuote,
  getTechnicals,
  getKeyStatistics,
  getCompanyFinancials,
  getEarningsData,
  getUpcomingEarnings,
  getHealthScore,
  getLiveCompanyProfile,
};

export const CLIENT_ACTION_KEY = '__clientAction';
