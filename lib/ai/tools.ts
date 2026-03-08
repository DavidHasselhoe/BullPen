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

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Get Company Financial Metrics
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
  shares_outstanding: 'Shares Outstanding',
};

const METRIC_VALUES = [
  'revenue', 'gross_profit', 'operating_income', 'net_income',
  'eps_diluted', 'eps_basic', 'operating_cash_flow', 'free_cash_flow',
  'capital_expenditures', 'total_assets', 'total_liabilities',
  'shareholders_equity', 'shares_outstanding',
] as const;

export const getCompanyMetrics = tool({
  description:
    'Fetch historical financial metrics for a specific company from the BullPen database. ' +
    'Use this when the user asks about a company\'s revenue, earnings, EPS, margins, cash flow, ' +
    'balance sheet items, or any other financial data. Returns up to 8 periods.',
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
    const company = await resolveCompanyId(ticker);
    if (!company) {
      return { error: `Company with ticker "${ticker}" not found in the database.` };
    }

    const db = supabase();
    const { data, error } = await db
      .from('financial_metrics')
      .select('value, period_end_date, fiscal_year, fiscal_quarter, unit')
      .eq('company_id', company.companyId)
      .eq('metric_type', metric)
      .eq('period_type', period)
      .order('period_end_date', { ascending: false })
      .limit(8);

    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return {
        ticker,
        company: company.name,
        metric: METRIC_LABELS[metric] ?? metric,
        period,
        note: 'No data found. The company may not have been ingested yet.',
        rows: [],
      };
    }

    type MetricRow = { value: number | null; period_end_date: string; fiscal_year: number; fiscal_quarter: number };
    const metrics = data as MetricRow[];
    const isMonetary = !['eps_diluted', 'eps_basic', 'shares_outstanding'].includes(metric);
    const rows = metrics.map((r) => {
      const label =
        period === 'annual'
          ? `FY${r.fiscal_year}`
          : `Q${r.fiscal_quarter} FY${r.fiscal_year}`;
      return {
        period: label,
        periodEnd: r.period_end_date,
        value: r.value,
        formatted: isMonetary ? fmt(r.value) : metric.startsWith('eps') ? `$${Number(r.value).toFixed(4)}` : String(r.value),
      };
    });

    return {
      ticker: ticker.toUpperCase(),
      company: company.name,
      metric: METRIC_LABELS[metric] ?? metric,
      period,
      rows,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Get Company Profile
// ─────────────────────────────────────────────────────────────────────────────

export const getCompanyProfile = tool({
  description:
    'Fetch the company profile including sector, industry, description, employee count, ' +
    'and fiscal year end. Use this when the user asks general questions about a company.',
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
    'Open the stock screener. Use when the user asks to find, screen, or filter companies by criteria. ' +
    'Examples: "show companies with high revenue growth", "find tech companies", "open the screener".',
  inputSchema: jsonSchema<Record<string, never>>({
    type: 'object',
    properties: {},
    additionalProperties: false,
  }),
  execute: async () => clientAction({ type: 'navigate', path: '/tools/screener' }),
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
    'Examples: "add 5 NVIDIA to my holdings", "add AAPL to my portfolio", "track 10 shares of Microsoft". ' +
    'Requires ticker; quantity and average price are optional.',
  inputSchema: jsonSchema<{
    ticker: string;
    quantity?: number;
    avg_price?: number;
  }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol, e.g. NVDA, AAPL' },
      quantity: { type: 'number', description: 'Number of shares (optional)' },
      avg_price: { type: 'number', description: 'Average cost per share in USD (optional)' },
    },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker, quantity, avg_price }) => {
    const company = await resolveCompanyId(ticker);
    if (!company) return { error: `Company "${ticker}" not found.` };
    return {
      ...clientAction({
        type: 'addHolding',
        ticker: ticker.toUpperCase(),
        company_name: company.name,
        quantity: quantity ?? null,
        avg_price: avg_price ?? null,
      }),
      added: company.name,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Exported tool map (passed directly to streamText)
// ─────────────────────────────────────────────────────────────────────────────

export const BULLPEN_TOOLS = {
  getCompanyMetrics,
  getCompanyProfile,
  searchCompanies,
  screenCompanies,
  compareCompanies,
  openCompanyPage,
  openComparison,
  openScreener,
  openHoldings,
  openDiscover,
  openTools,
  openCompanyEarnings,
  openCompanyNews,
  addHolding,
};

export const CLIENT_ACTION_KEY = '__clientAction';
