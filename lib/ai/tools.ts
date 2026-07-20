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
    const { data } = await db
      .from('company_index')
      .select('ticker, name')
      .or(`normalized_name.ilike.%${query.toLowerCase()}%,normalized_ticker.ilike.%${query.toLowerCase()}%`)
      .eq('has_data', true)
      .limit(8);

    if (!data || data.length === 0) {
      return { note: `No companies found matching "${query}".`, results: [] };
    }
    return { results: data };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Screen Companies
// ─────────────────────────────────────────────────────────────────────────────

export const screenCompanies = tool({
  description:
    'Find companies that match financial criteria. Use this when the user asks to find, ' +
    'list, or compare companies based on metrics like revenue size, margins, EPS, ' +
    'cash flow, or sector. Returns the top 10 matches sorted by revenue.',
  inputSchema: jsonSchema<{
    sector?: string;
    revenueMinB?: number;
    revenueMaxB?: number;
    grossMarginMin?: number;
    netMarginMin?: number;
    epsDilutedMin?: number;
    fcfMinB?: number;
    revenueGrowthMin?: number;
    limit?: number;
  }>({
    type: 'object',
    properties: {
      sector: { type: 'string', description: 'Filter by sector, e.g. "Technology", "Healthcare"' },
      revenueMinB: { type: 'number', description: 'Minimum annual revenue in billions' },
      revenueMaxB: { type: 'number', description: 'Maximum annual revenue in billions' },
      grossMarginMin: { type: 'number', description: 'Minimum gross margin as a percentage, e.g. 50 means 50%' },
      netMarginMin: { type: 'number', description: 'Minimum net margin as a percentage' },
      epsDilutedMin: { type: 'number', description: 'Minimum diluted EPS in dollars' },
      fcfMinB: { type: 'number', description: 'Minimum free cash flow in billions' },
      revenueGrowthMin: { type: 'number', description: 'Minimum YoY revenue growth as a percentage' },
      limit: { type: 'number', minimum: 1, maximum: 20, default: 10, description: 'Number of results to return' },
    },
    additionalProperties: false,
  }),
  execute: async ({
    sector, revenueMinB, revenueMaxB, grossMarginMin, netMarginMin,
    epsDilutedMin, fcfMinB, revenueGrowthMin, limit = 10,
  }) => {
    const db = supabase();
    const { data, error } = await db.rpc('get_screener_data');
    if (error) return { error: error.message };

    type Row = {
      ticker: string; name: string; sector: string | null;
      revenue: number | null; gross_profit: number | null;
      operating_income: number | null; net_income: number | null;
      eps_diluted: number | null; free_cash_flow: number | null;
      prev_revenue: number | null;
    };

    let rows = (data as Row[]) ?? [];

    if (sector) {
      rows = rows.filter((r) => r.sector?.toLowerCase().includes(sector.toLowerCase()));
    }
    if (revenueMinB != null) {
      rows = rows.filter((r) => r.revenue != null && r.revenue >= revenueMinB * 1e9);
    }
    if (revenueMaxB != null) {
      rows = rows.filter((r) => r.revenue != null && r.revenue <= revenueMaxB * 1e9);
    }
    if (grossMarginMin != null) {
      rows = rows.filter((r) => r.revenue && r.gross_profit != null && (r.gross_profit / r.revenue) * 100 >= grossMarginMin);
    }
    if (netMarginMin != null) {
      rows = rows.filter((r) => r.revenue && r.net_income != null && (r.net_income / r.revenue) * 100 >= netMarginMin);
    }
    if (epsDilutedMin != null) {
      rows = rows.filter((r) => r.eps_diluted != null && r.eps_diluted >= epsDilutedMin);
    }
    if (fcfMinB != null) {
      rows = rows.filter((r) => r.free_cash_flow != null && r.free_cash_flow >= fcfMinB * 1e9);
    }
    if (revenueGrowthMin != null) {
      rows = rows.filter((r) => {
        if (r.revenue == null || r.prev_revenue == null || r.prev_revenue === 0) return false;
        return ((r.revenue - r.prev_revenue) / Math.abs(r.prev_revenue)) * 100 >= revenueGrowthMin;
      });
    }

    rows.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
    rows = rows.slice(0, limit);

    return {
      count: rows.length,
      companies: rows.map((r) => ({
        ticker: r.ticker,
        name: r.name,
        sector: r.sector ?? 'Unknown',
        revenue: fmt(r.revenue),
        grossMargin: r.revenue && r.gross_profit != null ? fmtPct((r.gross_profit / r.revenue) * 100) : 'N/A',
        netMargin: r.revenue && r.net_income != null ? fmtPct((r.net_income / r.revenue) * 100) : 'N/A',
        epsDiluted: r.eps_diluted != null ? `$${r.eps_diluted.toFixed(2)}` : 'N/A',
        freeCashFlow: fmt(r.free_cash_flow),
        revenueGrowth: r.revenue && r.prev_revenue
          ? fmtPct(((r.revenue - r.prev_revenue) / Math.abs(r.prev_revenue)) * 100)
          : 'N/A',
      })),
    };
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
    'Use when the user asks to compare two or more companies.',
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
    const db = supabase();

    const results = await Promise.all(
      tickers.map(async (ticker) => {
        const company = await resolveCompanyId(ticker);
        if (!company) return { ticker, error: 'Not found' };

        const { data: fmData } = await db
          .from('financial_metrics')
          .select('value, period_end_date, fiscal_year, fiscal_quarter')
          .eq('company_id', company.companyId)
          .eq('metric_type', metric)
          .eq('period_type', period)
          .order('period_end_date', { ascending: false })
          .limit(4);

        type FmRow = { value: number | null; period_end_date: string; fiscal_year: number; fiscal_quarter: number };
        const isMonetary = !['eps_diluted', 'eps_basic', 'shares_outstanding'].includes(metric);
        return {
          ticker: ticker.toUpperCase(),
          company: company.name,
          metric: METRIC_LABELS[metric] ?? metric,
          period,
          data: ((fmData ?? []) as FmRow[]).map((r) => ({
            period: period === 'annual' ? `FY${r.fiscal_year}` : `Q${r.fiscal_quarter} FY${r.fiscal_year}`,
            value: r.value,
            formatted: isMonetary ? fmt(r.value) : `$${Number(r.value).toFixed(4)}`,
          })),
        };
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

export const openCompanyPage = tool({
  description:
    'Open a company\'s stock page in BullPen. Use when the user asks to open, view, go to, or show a company\'s page. ' +
    'Examples: "open NVIDIA", "show me Apple\'s page", "go to NVDA", "take me to Microsoft".',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: { ticker: { type: 'string', description: 'Stock ticker symbol, e.g. NVDA, AAPL' } },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker }) => {
    const company = await resolveCompanyId(ticker);
    if (!company) return { error: `Company "${ticker}" not found.` };
    return { ...clientAction({ type: 'navigate', path: `/stock/${ticker.toUpperCase()}` }), opened: company.name };
  },
});

export const openComparison = tool({
  description:
    'Open the stock screener or comparison view. Use when the user asks to compare companies, ' +
    'e.g. "compare NVIDIA and AMD", "show me NVDA vs AMD", "compare these companies".',
  inputSchema: jsonSchema<{ tickers: string[] }>({
    type: 'object',
    properties: {
      tickers: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 5,
        description: 'Ticker symbols to compare',
      },
    },
    required: ['tickers'],
    additionalProperties: false,
  }),
  execute: async ({ tickers }) => {
    const normalized = tickers.slice(0, 5).map((t) => t.toUpperCase());
    const params = new URLSearchParams({ tickers: normalized.join(',') });
    return clientAction({ type: 'navigate', path: `/tools/compare?${params.toString()}` });
  },
});

export const openScreener = tool({
  description:
    'Open the BullPen stock screener, optionally pre-applying filters so the user sees results immediately. ' +
    'Use whenever the user asks to find, screen, filter, or browse stocks — even vague requests like ' +
    '"show me value stocks", "find tech growth plays", or "I want dividend ideas". ' +
    'Map natural language criteria to filter params: ' +
    '"large-cap" → marketCapMin=10, "mega-cap" → marketCapMin=200, "small-cap" → marketCapMax=2, ' +
    '"deep value" → peMax=15 + pbMax=2, "growth stocks" → revenueGrowthMin=15, ' +
    '"high quality" → profitMarginMin=15 + revenueGrowthMin=10, "dividend" → divYieldMin=2.5, ' +
    '"low volatility" → betaMax=0.8, "high volatility" → betaMin=1.5. ' +
    'Always prefer this over openComparison or screenCompanies when the user wants to browse visually.',
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
    },
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
      ...clientAction({ type: 'navigate', path }),
      ...(appliedCount > 0 ? { filtersApplied: appliedCount, description: `Screener opened with ${appliedCount} filter(s)` } : {}),
    };
  },
});

export const openHoldings = tool({
  description:
    'Open the user\'s holdings page. Use when the user asks to view holdings, portfolio, or my positions.',
  inputSchema: jsonSchema<Record<string, never>>({
    type: 'object',
    properties: {},
    additionalProperties: false,
  }),
  execute: async () => clientAction({ type: 'navigate', path: '/holdings' }),
});

export const openDiscover = tool({
  description:
    'Open the Discover / home page. Use when the user asks to go home, see the dashboard, or discover page.',
  inputSchema: jsonSchema<Record<string, never>>({
    type: 'object',
    properties: {},
    additionalProperties: false,
  }),
  execute: async () => clientAction({ type: 'navigate', path: '/' }),
});

export const openTools = tool({
  description:
    'Open the BullPen tools hub. Use when the user asks for tools, utilities, screeners, or the tools page.',
  inputSchema: jsonSchema<Record<string, never>>({
    type: 'object',
    properties: {},
    additionalProperties: false,
  }),
  execute: async () => clientAction({ type: 'navigate', path: '/tools' }),
});

export const openCompanyEarnings = tool({
  description:
    'Open a company\'s stock page and scroll to the earnings calendar. Use when the user asks about earnings dates, ' +
    'next earnings, when a company reports, or to see the earnings calendar.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: { ticker: { type: 'string', description: 'Stock ticker symbol' } },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker }) => {
    const company = await resolveCompanyId(ticker);
    if (!company) return { error: `Company "${ticker}" not found.` };
    return { ...clientAction({ type: 'navigate', path: `/stock/${ticker.toUpperCase()}#earnings` }), opened: company.name };
  },
});

export const openCompanyNews = tool({
  description:
    'Open a company\'s stock page and scroll to the news section. Use when the user asks for news, headlines, or recent updates about a company.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: { ticker: { type: 'string', description: 'Stock ticker symbol' } },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker }) => {
    const company = await resolveCompanyId(ticker);
    if (!company) return { error: `Company "${ticker}" not found.` };
    return { ...clientAction({ type: 'navigate', path: `/stock/${ticker.toUpperCase()}#news` }), opened: company.name };
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
  getCompanyMetrics,
  getCompanyProfile,
  searchCompanies,
  screenCompanies,
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
  getCompanyMetrics,
  getCompanyProfile,
  searchCompanies,
  screenCompanies,
  compareCompanies,
  // Navigation
  openCompanyPage,
  openComparison,
  openScreener,
  openHoldings,
  openDiscover,
  openTools,
  openCompanyEarnings,
  openCompanyNews,
  // Portfolio management
  addHolding,
  updateHolding,
  removeHolding,
  // TwelveData live tools — real-time data for any ticker globally
  getLiveQuote,
  getKeyStatistics,
  getCompanyFinancials,
  getEarningsData,
  getHealthScore,
  getLiveCompanyProfile,
  getInsiderActivity,
};

export const CLIENT_ACTION_KEY = '__clientAction';
