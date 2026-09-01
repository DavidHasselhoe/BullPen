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
  getStockQuote,
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
} from '@/lib/twelvedata/twelvedata-client';
import { getHealthScoreForSymbol } from '@/lib/finance/get-health-score';
import { getTier, isPro } from '@/lib/billing/tier';
import { AlertTypeSchema, alertTypeLabel, describeAlert, FREE_ACTIVE_ALERT_LIMIT, type AlertType } from '@/types/alerts';
import { DIVIDEND_QUICK_PICKS } from '@/lib/finance/dividend-quick-picks';
import { getHoldings } from '@/lib/holdings/holdings-db';
import { APP_DESTINATIONS, APP_DESTINATION_IDS, type AppDestinationId } from '@/lib/ai/app-destinations';

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

function fmtPct(n: number | null): string {
  if (n == null) return 'N/A';
  return `${n.toFixed(1)}%`;
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

/** Fetches `outputsize` periods for `metric` from whichever TwelveData statement endpoint carries it. */
async function fetchMetricPeriods(
  ticker: string,
  metric: string,
  period: 'annual' | 'quarterly',
  outputsize: number
): Promise<{ fiscalDate: string; value: number | null }[]> {
  if (metric in INCOME_STATEMENT_METRICS) {
    const rows = await getIncomeStatement(ticker, period, outputsize);
    const extract = INCOME_STATEMENT_METRICS[metric];
    return rows.map((r) => ({ fiscalDate: r.fiscal_date, value: extract(r) }));
  }
  if (metric in BALANCE_SHEET_METRICS) {
    const rows = await getBalanceSheet(ticker, period, outputsize);
    const extract = BALANCE_SHEET_METRICS[metric];
    return rows.map((r) => ({ fiscalDate: r.fiscal_date, value: extract(r) }));
  }
  const rows = await getCashFlow(ticker, period, outputsize);
  const extract = CASH_FLOW_METRICS[metric];
  return rows.map((r) => ({ fiscalDate: r.fiscal_date, value: extract(r) }));
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
  return clientAction({ type: 'navigate', path, label, requiresConfirmation: !explicitUserRequest });
}

export const openCompanyPage = tool({
  description:
    'Open a company\'s stock page in BullPen. Use when the user asks to open, view, go to, or show a company\'s page. ' +
    'Examples: "open NVIDIA", "show me Apple\'s page", "go to NVDA", "take me to Microsoft" — these are all explicit ' +
    'requests (explicitUserRequest: true). If you are instead suggesting a company\'s page as a helpful next step to a ' +
    'different question, set explicitUserRequest: false.',
  inputSchema: jsonSchema<{ ticker: string; explicitUserRequest: boolean }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol, e.g. NVDA, AAPL' },
      explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA,
    },
    required: ['ticker', 'explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async ({ ticker, explicitUserRequest }) => {
    const company = await resolveCompanyId(ticker);
    if (!company) return { error: `Company "${ticker}" not found.` };
    return {
      ...navigateAction(`/stock/${ticker.toUpperCase()}`, `${company.name}'s page`, explicitUserRequest),
      opened: company.name,
    };
  },
});

export const openComparison = tool({
  description:
    'Open the stock screener or comparison view. Use when the user asks to compare companies, ' +
    'e.g. "compare NVIDIA and AMD", "show me NVDA vs AMD", "compare these companies" — these are explicit requests ' +
    '(explicitUserRequest: true). If you are suggesting a comparison as a helpful next step rather than something ' +
    'the user asked to see, set explicitUserRequest: false.',
  inputSchema: jsonSchema<{ tickers: string[]; explicitUserRequest: boolean }>({
    type: 'object',
    properties: {
      tickers: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 5,
        description: 'Ticker symbols to compare',
      },
      explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA,
    },
    required: ['tickers', 'explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async ({ tickers, explicitUserRequest }) => {
    const normalized = tickers.slice(0, 5).map((t) => t.toUpperCase());
    const params = new URLSearchParams({ tickers: normalized.join(',') });
    return navigateAction(`/tools/compare?${params.toString()}`, `a comparison of ${normalized.join(', ')}`, explicitUserRequest);
  },
});

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
    '"low volatility" → betaMax=0.8, "high volatility" → betaMin=1.5. ' +
    'Always prefer this over openComparison when the user wants to browse visually.',
  inputSchema: jsonSchema<{
    sector?: string;
    industry?: string;
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
    explicitUserRequest: boolean;
  }>({
    type: 'object',
    properties: {
      sector:           { type: 'string', description: 'Sector name, e.g. "Technology", "Healthcare", "Energy", "Financials", "Consumer Cyclical"' },
      industry:         { type: 'string', description: 'Industry within the sector, e.g. "Semiconductors", "Software—Application", "Biotechnology"' },
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
      week52ChangeMin:  { type: 'number', description: 'Min 52-week price change % — e.g. -30 for stocks down >30% (beaten-down)' },
      week52ChangeMax:  { type: 'number', description: 'Max 52-week price change % — e.g. 0 for stocks still below prior high' },
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

export const openHoldings = tool({
  description:
    'Open the user\'s holdings page. Use when the user asks to view holdings, portfolio, or my positions.',
  inputSchema: jsonSchema<{ explicitUserRequest: boolean }>({
    type: 'object',
    properties: { explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA },
    required: ['explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async ({ explicitUserRequest }) => navigateAction('/holdings', 'your holdings', explicitUserRequest),
});

export const openDiscover = tool({
  description:
    'Open the user\'s home dashboard. Use when the user asks to go home or see the dashboard. ' +
    'For the separate Discover page (curated market content), use navigateTo with destination "discover" instead.',
  inputSchema: jsonSchema<{ explicitUserRequest: boolean }>({
    type: 'object',
    properties: { explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA },
    required: ['explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async ({ explicitUserRequest }) => navigateAction('/dashboard', 'your dashboard', explicitUserRequest),
});

export const openTools = tool({
  description:
    'Open the BullPen tools hub. Use when the user asks for tools, utilities, screeners, or the tools page.',
  inputSchema: jsonSchema<{ explicitUserRequest: boolean }>({
    type: 'object',
    properties: { explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA },
    required: ['explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async ({ explicitUserRequest }) => navigateAction('/tools', 'the tools hub', explicitUserRequest),
});

export const openCompanyEarnings = tool({
  description:
    'Open a company\'s stock page and scroll to the earnings calendar. Use when the user asks about earnings dates, ' +
    'next earnings, when a company reports, or to see the earnings calendar. Most of these are informational ' +
    'questions rather than a direct "take me there" request — set explicitUserRequest accordingly (usually false ' +
    'unless the user explicitly asked to be shown/opened to the earnings calendar itself).',
  inputSchema: jsonSchema<{ ticker: string; explicitUserRequest: boolean }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol' },
      explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA,
    },
    required: ['ticker', 'explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async ({ ticker, explicitUserRequest }) => {
    const company = await resolveCompanyId(ticker);
    if (!company) return { error: `Company "${ticker}" not found.` };
    return {
      ...navigateAction(`/stock/${ticker.toUpperCase()}#earnings`, `${company.name}'s earnings calendar`, explicitUserRequest),
      opened: company.name,
    };
  },
});

export const openCompanyNews = tool({
  description:
    'Open a company\'s stock page and scroll to the news section. Use when the user asks for news, headlines, or ' +
    'recent updates about a company. Most of these are informational questions rather than a direct "take me there" ' +
    'request — set explicitUserRequest accordingly (usually false unless the user explicitly asked to be shown/opened ' +
    'to the news section itself).',
  inputSchema: jsonSchema<{ ticker: string; explicitUserRequest: boolean }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol' },
      explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA,
    },
    required: ['ticker', 'explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async ({ ticker, explicitUserRequest }) => {
    const company = await resolveCompanyId(ticker);
    if (!company) return { error: `Company "${ticker}" not found.` };
    return {
      ...navigateAction(`/stock/${ticker.toUpperCase()}#news`, `${company.name}'s news`, explicitUserRequest),
      opened: company.name,
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

export const navigateTo = tool({
  description:
    'Navigate the user to a page elsewhere in BullPen — anything not covered by a more specific navigation tool ' +
    '(openCompanyPage for a stock, openComparison for comparing companies, openScreener for the screener, ' +
    'openHoldings for holdings, openDiscover for the home dashboard, openTools for the tools hub, ' +
    'openDividendCalculator for the dividend calculator). Use this for: the Discover page, Academy (and its ' +
    'leaderboard), watchlist, price alerts, the Portfolio Builder, the market events calendar, "If You Bought Here", ' +
    'Market Mood, the S&P 500 Heatmap, the community feed, browsing members, notifications, the Upgrade page, and ' +
    "Bull's Weekly Pick. Also use this for the AI Deep Dive report on a specific ticker (destination: \"deep_dive\", " +
    'with ticker set). BullPen has no other pages to send someone to — never invent a path or send the user to an ' +
    'external site; if what they want genuinely does not exist in the app, say so instead of guessing a destination.',
  inputSchema: jsonSchema<{ destination: AppDestinationId | 'deep_dive'; ticker?: string; explicitUserRequest: boolean }>({
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        enum: [...APP_DESTINATION_IDS, 'deep_dive'],
        description:
          'Which page to open. "deep_dive" requires ticker to be set; every other value is a fixed, ' +
          'ticker-independent page.',
      },
      ticker: { type: 'string', description: 'Stock ticker symbol — required when destination is "deep_dive", ignored otherwise.' },
      explicitUserRequest: EXPLICIT_USER_REQUEST_SCHEMA,
    },
    required: ['destination', 'explicitUserRequest'],
    additionalProperties: false,
  }),
  execute: async ({ destination, ticker, explicitUserRequest }) => {
    if (destination === 'deep_dive') {
      if (!ticker) return { error: 'ticker is required when destination is "deep_dive".' };
      const sym = ticker.toUpperCase();
      return navigateAction(`/tools/deep-dive/${sym}`, `the AI Deep Dive on ${sym}`, explicitUserRequest);
    }
    const dest = APP_DESTINATIONS[destination];
    if (!dest) return { error: `Unknown destination "${destination}".` };
    return navigateAction(dest.path, dest.label, explicitUserRequest);
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
export function getPortfolioContextTool(userId: string) {
  return tool({
    description:
      'Read the user\'s actual holdings and watchlist. Use when the user asks about their own portfolio in a way ' +
      'that needs the real data — "what do I own", "how much of my portfolio is in tech", "am I overweight NVDA", ' +
      '"what\'s on my watchlist". Position weights returned here are by COST BASIS (what was paid), not live market ' +
      'value, so treat them as a rough guide. If the user wants a precise, scored risk assessment (diversification ' +
      'score, stress-test scenarios, live-priced weights), do NOT attempt that yourself — tell them to run Portfolio ' +
      'Risk Analysis on the Holdings page instead; that feature is built for exactly that and keeps a history to ' +
      'compare over time.',
    inputSchema: jsonSchema<Record<string, never>>({
      type: 'object',
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => {
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
        watchlist: ((watchlistRes.data ?? []) as Array<{ symbol: string; company_name: string }>).map((w) => ({
          ticker: w.symbol,
          companyName: w.company_name,
        })),
      };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TwelveData live tools
// ─────────────────────────────────────────────────────────────────────────────

const getLiveQuote = tool({
  description:
    'Fetch the live (real-time) stock price and basic market data for a ticker. ' +
    'Use this when the user asks what a stock is trading at, its daily change, volume, ' +
    'or 52-week range. Costs ~1 API credit.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol, e.g. AAPL, NVDA, TSM' },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker }) => {
    try {
      const q = await getStockQuote(ticker.toUpperCase());
      // StockQuote uses short Finnhub-style fields: c=close, d=change, dp=changePercent,
      // h=high, l=low, o=open, pc=previousClose, t=timestamp
      const changeSign = (q.d ?? 0) >= 0 ? '+' : '';
      return {
        ticker: ticker.toUpperCase(),
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
      return { error: `Could not fetch quote for ${ticker}: ${(err as Error).message}` };
    }
  },
});

const getKeyStatistics = tool({
  description:
    'Fetch key valuation and financial statistics for a stock: P/E ratio (TTM and forward), ' +
    'P/B ratio, EV/EBITDA, beta, market cap, dividend yield, profit margin, short ratio, and growth rates. ' +
    'Use when the user asks whether a stock is expensive, its valuation multiples, or general financial health. ' +
    'Costs ~200 API credits — use only when statistics are specifically needed.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol' },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker }) => {
    try {
      const s = await getStatistics(ticker.toUpperCase());
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
    'Costs ~30 API credits per call.',
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
      if (type === 'income') {
        const rows = await getIncomeStatement(sym, period);
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
        const rows = await getBalanceSheet(sym, period);
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
        const rows = await getCashFlow(sym, period);
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

const getEarningsData = tool({
  description:
    'Fetch historical earnings data for a stock: EPS estimates vs actuals, beat/miss, and upcoming earnings dates. ' +
    'Use when the user asks when a company next reports, whether it beat earnings, or its EPS history. ' +
    'Costs ~20 API credits.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol' },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker }) => {
    try {
      const earnings = await getCompanyEarnings(ticker.toUpperCase(), 8);
      return earnings.map((e) => {
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
      });
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch earnings for ${ticker}: ${(err as Error).message}` };
    }
  },
});

const getInsiderActivity = tool({
  description:
    'Fetch recent insider trading activity for a stock — buys and sells by executives, directors, and ' +
    '10%+ shareholders, aggregated into net buy/sell value plus the top individual trades. ' +
    'Use only when the user explicitly asks about insider buying/selling, executive trades, or insider ' +
    'sentiment — do not call this speculatively. Costs ~200 API credits.',
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
      const transactions = await getInsiderTransactions(symbol);
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

const getHealthScore = tool({
  description:
    'Fetch BullPen\'s computed Financial Health score (0-100, grade A-F) for a stock — the same score ' +
    'shown on the stock page\'s Financial Health card, broken into Profitability, Financial Strength, ' +
    'Valuation, Growth, and Market Risk. Use this whenever the user asks about a company\'s "financial health", ' +
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
  getKeyStatistics,
  getCompanyFinancials,
  getEarningsData,
  getHealthScore,
  getLiveCompanyProfile,
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported tool map (passed directly to streamText)
// ─────────────────────────────────────────────────────────────────────────────

export const BULLPEN_TOOLS = {
  // Supabase tools — fast, no API credits, limited to ingested companies
  getCompanyProfile,
  searchCompanies,
  // Navigation
  openCompanyPage,
  openComparison,
  openScreener,
  openHoldings,
  openDiscover,
  openTools,
  openCompanyEarnings,
  openCompanyNews,
  openDividendCalculator,
  navigateTo,
  // Portfolio management
  addHolding,
  updateHolding,
  removeHolding,
  // TwelveData live tools — real-time data for any ticker globally
  getCompanyMetrics,
  compareCompanies,
  getLiveQuote,
  getKeyStatistics,
  getCompanyFinancials,
  getEarningsData,
  getHealthScore,
  getLiveCompanyProfile,
  getInsiderActivity,
};

export const CLIENT_ACTION_KEY = '__clientAction';
