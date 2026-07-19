# Financial Metrics Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `screenCompanies`, `compareCompanies`, `getCompanyMetrics`, and `app/api/compare/route.ts` — all currently broken because they query the `financial_metrics` Supabase table, which was dropped in migration `038_cleanup.sql` and never replaced.

**Architecture:** `screenCompanies` is retired outright (redundant with the working `openScreener` tool, and its filter set doesn't map onto any live table). `compareCompanies`, `getCompanyMetrics`, and the `/api/compare` route are migrated to TwelveData's `/income_statement`, `/balance_sheet`, and `/cash_flow` endpoints via the existing `getIncomeStatement`/`getBalanceSheet`/`getCashFlow` wrapper functions — the exact pattern `getCompanyFinancials` already uses successfully. A new shared helper (`fetchMetricPeriods`) picks the right endpoint per metric name so `getCompanyMetrics` and `compareCompanies` don't duplicate the same three-way branch.

**Tech Stack:** Next.js API routes, Vercel AI SDK `tool()`/`jsonSchema()`, TwelveData REST API via `lib/twelvedata/twelvedata-client.ts`.

## Global Constraints

- No unit test framework in this repo — verify manually via `npm run dev` + the live chat/page, per `CLAUDE.md`.
- Every new TwelveData call path must catch `TwelveDataRateLimitError` per `CLAUDE.md`'s golden rule: AI tools return `{ error: 'Rate limit reached. Try again shortly.' }` (matching `getCompanyFinancials`'s existing convention); API routes return `{ success: false, error: 'plan_restricted' }` at HTTP 200 (matching the rest of the app's route convention).
- Response shapes consumed by existing UI must not change: `CompanyMetricsResultCard`'s `{ period, periodEnd, value, formatted }` row shape, and `app/tools/compare`'s `CompareCompany` interface (`app/api/compare/route.ts:18-52`), are both frozen.
- `npm run lint` must show 0 errors (64 pre-existing warnings is the current baseline) before each commit.
- `shares_outstanding` is dropped from `getCompanyMetrics`'s metric enum — no TwelveData endpoint provides a historical share-count series.
- `screenCompanies` is deleted, not deprecated-in-place — remove it from every file that references it, including the now-dead `ScreenerResultCard.tsx` component.

---

## File Structure

| File | Change |
|---|---|
| `lib/twelvedata/twelvedata-client.ts` | Modify — add optional `outputsize` param to `getIncomeStatement`, `getBalanceSheet`, `getCashFlow` |
| `lib/ai/tools.ts` | Modify — add shared `fetchMetricPeriods` helper; rewrite `getCompanyMetrics` and `compareCompanies`; delete `screenCompanies` and its registrations |
| `lib/ai/systemPrompt.ts` | Modify — remove `screenCompanies` docs, move `getCompanyMetrics`/`compareCompanies` docs into the TwelveData section with credit costs |
| `lib/ai/tool-ux.ts` | Modify — remove `screenCompanies`'s `STATUS_LABELS` entry |
| `components/ai/ToolResultCard.tsx` | Modify — remove the `screenCompanies` switch case and its import |
| `components/ai/cards/ScreenerResultCard.tsx` | Delete — dead once `screenCompanies` is gone |
| `app/api/compare/route.ts` | Modify — replace the `financial_metrics` query with per-ticker TwelveData fetches |

---

### Task 1: Add optional `outputsize` to the TwelveData statement wrappers

**Files:**
- Modify: `lib/twelvedata/twelvedata-client.ts:868-877` (`getIncomeStatement`), `:953-962` (`getBalanceSheet`), `:1027-1036` (`getCashFlow`)

**Interfaces:**
- Produces: `getIncomeStatement(symbol: string, period?: 'quarterly' | 'annual', outputsize?: number): Promise<IncomeStatementPeriod[]>`, same signature change for `getBalanceSheet` → `Promise<BalanceSheetPeriod[]>` and `getCashFlow` → `Promise<CashFlowPeriod[]>`. Default `outputsize = 4` preserves current behavior for existing callers (`getCompanyFinancials`, which already does its own `.slice(0, 4)`).

- [ ] **Step 1: Add the parameter to `getIncomeStatement`**

In `lib/twelvedata/twelvedata-client.ts`, find:

```ts
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
```

Replace with:

```ts
export async function getIncomeStatement(
  symbol: string,
  period: 'quarterly' | 'annual' = 'quarterly',
  outputsize = 4
): Promise<IncomeStatementPeriod[]> {
  logUsage('income_statement', symbol);
  const url = buildUrl('/income_statement', {
    symbol: symbol.toUpperCase(),
    period,
    outputsize,
  });
```

- [ ] **Step 2: Add the parameter to `getBalanceSheet`**

Find:

```ts
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
```

Replace with:

```ts
export async function getBalanceSheet(
  symbol: string,
  period: 'quarterly' | 'annual' = 'quarterly',
  outputsize = 4
): Promise<BalanceSheetPeriod[]> {
  logUsage('balance_sheet', symbol);
  const url = buildUrl('/balance_sheet', {
    symbol: symbol.toUpperCase(),
    period,
    outputsize,
  });
```

- [ ] **Step 3: Add the parameter to `getCashFlow`**

Find:

```ts
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
```

Replace with:

```ts
export async function getCashFlow(
  symbol: string,
  period: 'quarterly' | 'annual' = 'quarterly',
  outputsize = 4
): Promise<CashFlowPeriod[]> {
  logUsage('cash_flow', symbol);
  const url = buildUrl('/cash_flow', {
    symbol: symbol.toUpperCase(),
    period,
    outputsize,
  });
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors, same 64-warning baseline.

- [ ] **Step 5: Commit**

```bash
git add lib/twelvedata/twelvedata-client.ts
git commit -m "feat: add optional outputsize param to TwelveData statement wrappers"
```

---

### Task 2: Shared metric extraction + rewrite `getCompanyMetrics`

**Files:**
- Modify: `lib/ai/tools.ts:93-196` (the `METRIC_LABELS`/`METRIC_VALUES` constants and the `getCompanyMetrics` tool)

**Interfaces:**
- Consumes: `getIncomeStatement`, `getBalanceSheet`, `getCashFlow` (Task 1's 3-arg signatures), `TwelveDataRateLimitError`, `resolveCompanyId` (existing, `lib/ai/tools.ts:53-63`), `fmt` (existing, `lib/ai/tools.ts:37-...`).
- Produces: `fetchMetricPeriods(ticker: string, metric: string, period: 'annual' | 'quarterly', outputsize: number): Promise<{ fiscalDate: string; value: number | null }[]>`, exported at module scope in `lib/ai/tools.ts` for Task 3 to import. `getCompanyMetrics` output shape is unchanged: `{ ticker, company, metric, period, rows: [{ period, periodEnd, value, formatted }] } | { ticker, company, metric, period, note, rows: [] } | { error: string }`.

- [ ] **Step 1: Import the statement period types**

The new extraction helper needs `IncomeStatementPeriod`, `BalanceSheetPeriod`, and `CashFlowPeriod` as type references — these are already exported from `lib/twelvedata/twelvedata-client.ts` but not yet imported into `lib/ai/tools.ts`. In `lib/ai/tools.ts`, find the existing import block:

```ts
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
} from '@/lib/twelvedata/twelvedata-client';
```

Replace with:

```ts
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
```

- [ ] **Step 2: Replace `METRIC_LABELS`/`METRIC_VALUES` and add the shared extraction helper**

In `lib/ai/tools.ts`, find (starting at the `// Tool: Get Company Financial Metrics` comment, ending right before `export const getCompanyMetrics = tool({`):

```ts
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
```

Replace with:

```ts
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
```

- [ ] **Step 3: Rewrite `getCompanyMetrics`'s `execute` function**

Find:

```ts
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
```

Replace with:

```ts
  execute: async ({ ticker, metric, period = 'annual' }) => {
    try {
      const sym = ticker.toUpperCase();
      const company = await resolveCompanyId(sym);
      const companyName = company?.name ?? sym;
      const isMonetary = metric !== 'eps_diluted' && metric !== 'eps_basic';

      const periods = await fetchMetricPeriods(sym, metric, period, 8);

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
```

Also update the tool's `description` field a few lines above (still inside the same `export const getCompanyMetrics = tool({` block) — find:

```ts
  description:
    'Fetch historical financial metrics for a specific company from the BullPen database. ' +
    'Use this when the user asks about a company\'s revenue, earnings, EPS, margins, cash flow, ' +
    'balance sheet items, or any other financial data. Returns up to 8 periods.',
```

Replace with:

```ts
  description:
    'Fetch historical financial metrics for a specific company. Works for any ticker globally, not just ' +
    'companies in the BullPen database. Use this when the user asks about a company\'s revenue, earnings, ' +
    'EPS, margins, cash flow, balance sheet items, or any other financial data. Returns up to 8 periods. ' +
    'Costs ~1 API credit.',
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors, same warning baseline.

- [ ] **Step 5: Manual verification in the browser**

Run `npm run dev`, open Ask Bull, send "Show me AAPL's revenue history". Confirm the `CompanyMetricsResultCard` renders with a `TrendBars` chart showing multiple real periods (not an error, not empty). Then send "What's NVDA's total assets?" (a balance-sheet metric) and "Show me MSFT's free cash flow" (a cash-flow metric) to confirm all three statement branches work.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/tools.ts
git commit -m "feat: migrate getCompanyMetrics off the dead financial_metrics table to TwelveData"
```

---

### Task 3: Rewrite `compareCompanies`

**Files:**
- Modify: `lib/ai/tools.ts:374-442` (the `compareCompanies` tool's `execute` function and description)

**Interfaces:**
- Consumes: `fetchMetricPeriods` (Task 2), `TwelveDataRateLimitError`, `resolveCompanyId`, `fmt`, `METRIC_LABELS` (Task 2, now missing `shares_outstanding` — unused by `compareCompanies` regardless, since it was never in `COMPARE_METRIC_VALUES`).
- Produces: unchanged output shape `{ comparison: [{ ticker, company, metric, period, data: [{ period, value, formatted }] } | { ticker, error: string }] }`.

- [ ] **Step 1: Rewrite the `execute` function**

Find:

```ts
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
```

Replace with:

```ts
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
```

Also update the tool's `description` — find:

```ts
  description:
    'Compare multiple companies side-by-side on key financial metrics. ' +
    'Use when the user asks to compare two or more companies.',
```

Replace with:

```ts
  description:
    'Compare multiple companies side-by-side on key financial metrics. ' +
    'Use when the user asks to compare two or more companies. Costs ~1 API credit per company.',
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors, same warning baseline.

- [ ] **Step 3: Manual verification in the browser**

Send "Which has higher net margin, AAPL or MSFT?" to Ask Bull — phrased as a specific analytical question (per the tool's own description) rather than "compare X and Y", to steer the model toward `compareCompanies` instead of `openComparison`. Confirm a real inline answer with real numbers for both tickers, no error.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools.ts
git commit -m "feat: migrate compareCompanies off the dead financial_metrics table to TwelveData"
```

---

### Task 4: Retire `screenCompanies`

**Files:**
- Modify: `lib/ai/tools.ts` (delete the `screenCompanies` tool definition; remove it from `COMPANY_DATA_TOOLS` and `BULLPEN_TOOLS`; regroup those two objects now that `getCompanyMetrics`/`compareCompanies` are TwelveData-backed)
- Modify: `lib/ai/tool-ux.ts:49` (remove the `screenCompanies` `STATUS_LABELS` entry)
- Modify: `components/ai/ToolResultCard.tsx` (remove the `screenCompanies` case and its import)
- Delete: `components/ai/cards/ScreenerResultCard.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `screenCompanies` no longer exists anywhere in the codebase; `BULLPEN_TOOLS`/`COMPANY_DATA_TOOLS` no longer reference it.

- [ ] **Step 1: Delete the `screenCompanies` tool from `lib/ai/tools.ts`**

Find the entire block, from the section comment through the closing `});` (immediately before the `// Tool: Compare Companies` comment):

```ts
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

```

Delete it entirely (including the trailing blank line before `// Tool: Compare Companies`). If `fmtPct` becomes unused elsewhere in the file after this deletion, remove its definition too — check with `grep -n fmtPct lib/ai/tools.ts` before deleting it; leave it if anything else still calls it.

- [ ] **Step 2: Remove `screenCompanies` from `COMPANY_DATA_TOOLS` and `BULLPEN_TOOLS`, and regroup**

Find:

```ts
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
```

Replace with:

```ts
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
```

Find:

```ts
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
```

Replace with:

```ts
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
```

- [ ] **Step 3: Remove the `STATUS_LABELS` entry in `lib/ai/tool-ux.ts`**

Find:

```ts
  searchCompanies: 'Searching companies…',
  screenCompanies: 'Screening companies…',
  compareCompanies: 'Comparing companies…',
```

Replace with:

```ts
  searchCompanies: 'Searching companies…',
  compareCompanies: 'Comparing companies…',
```

- [ ] **Step 4: Remove the `screenCompanies` case from `components/ai/ToolResultCard.tsx`**

Find the import:

```tsx
import { ScreenerResultCard, type ScreenerOutput } from './cards/ScreenerResultCard';
```

Delete that line.

Find the switch case:

```tsx
    case 'screenCompanies': {
      const o = output as Partial<ScreenerOutput>;
      if (!Array.isArray(o.companies)) return null;
      return <ScreenerResultCard output={o as ScreenerOutput} />;
    }
```

Delete it.

- [ ] **Step 5: Delete the now-dead card component**

```bash
rm components/ai/cards/ScreenerResultCard.tsx
```

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: 0 errors, same warning baseline (or fewer, if any newly-unused exports get flagged — resolve any new warnings by removing the dead code they point to).

- [ ] **Step 7: Manual verification in the browser**

Send "List the top 10 tech companies by revenue" to Ask Bull. Confirm it does NOT error the way it did before (no "issue accessing the data" message) — it should either answer via a different working tool or decline gracefully, never route into a dead `screenCompanies` call (which no longer exists to be routed into).

- [ ] **Step 8: Commit**

```bash
git add lib/ai/tools.ts lib/ai/tool-ux.ts components/ai/ToolResultCard.tsx
git rm components/ai/cards/ScreenerResultCard.tsx
git commit -m "refactor: retire screenCompanies in favor of the working openScreener tool"
```

---

### Task 5: Update `systemPrompt.ts`

**Files:**
- Modify: `lib/ai/systemPrompt.ts` (remove `screenCompanies` docs and its workflow line; move `getCompanyMetrics`/`compareCompanies` docs into the TwelveData section with credit costs)

**Interfaces:**
- Consumes: nothing (pure documentation text consumed by the model at request time).

- [ ] **Step 1: Remove `getCompanyMetrics` from the Supabase tools section and both `screenCompanies` doc blocks**

Find:

```
### Supabase tools (fast, no credit cost — use first)

getCompanyMetrics  
Fetch historical revenue, EPS, margins, cash flow, and balance sheet metrics from BullPen's SEC database.

getCompanyProfile
Fetch sector, industry, and company description from BullPen's SEC-derived database. **Only covers companies BullPen has ingested — most tickers are NOT in this table, regardless of whether the user has viewed that stock's page in the app.** If this returns "not found", immediately call getLiveCompanyProfile — never tell the user a profile is unavailable without trying that fallback first.

searchCompanies  
Find companies when the user provides a name but not a ticker. Always call this first before fetching data.

screenCompanies  
Identify companies matching financial criteria (e.g. P/E < 20, revenue growth > 15%).

compareCompanies
Returns comparison data for chat answers. Use ONLY when the user asks a specific analytical question (e.g. "which has higher revenue?") and does NOT want a comparison page. When in doubt, use openComparison to open the comparison tool instead.

screenCompanies
Returns a filtered list of companies IN THE CHAT. Use only when the user wants to see a ranked table in the conversation — e.g. "list the top 10 tech companies by revenue". Do NOT use when the user wants to browse visually; use openScreener instead.

### TwelveData live tools (real-time data for any ticker globally)

getLiveQuote  
Fetch the live stock price, daily change, volume, market cap, and 52-week range for any ticker.  
**Cost: ~1 credit.** Use for any "what is X trading at?", "is it up today?", or price-related question.
```

Replace with:

```
### Supabase tools (fast, no credit cost — use first)

getCompanyProfile
Fetch sector, industry, and company description from BullPen's SEC-derived database. **Only covers companies BullPen has ingested — most tickers are NOT in this table, regardless of whether the user has viewed that stock's page in the app.** If this returns "not found", immediately call getLiveCompanyProfile — never tell the user a profile is unavailable without trying that fallback first.

searchCompanies  
Find companies when the user provides a name but not a ticker. Always call this first before fetching data.

### TwelveData live tools (real-time data for any ticker globally)

getCompanyMetrics
Fetch a single financial metric's history (revenue, EPS, margins, cash flow, or balance sheet items) for any ticker globally, up to 8 periods.
**Cost: ~1 credit.** Use for trend questions like "show me AAPL's revenue over time" or "NVDA's EPS history" — cheaper than getCompanyFinancials when only one line item is needed.

compareCompanies
Returns comparison data for chat answers. Use ONLY when the user asks a specific analytical question (e.g. "which has higher revenue?") and does NOT want a comparison page. When in doubt, use openComparison to open the comparison tool instead.
**Cost: ~1 credit per company being compared.**

getLiveQuote  
Fetch the live stock price, daily change, volume, market cap, and 52-week range for any ticker.  
**Cost: ~1 credit.** Use for any "what is X trading at?", "is it up today?", or price-related question.
```

- [ ] **Step 2: Remove the `screenCompanies` workflow line**

Find:

```
- "Find me / show me / screen for stocks" → openScreener with relevant filters applied
- "List the top N companies by X in the chat" → screenCompanies (returns data inline)
- Unknown ticker → searchCompanies → if not found → getLiveQuote / getCompanyFinancials
```

Replace with:

```
- "Find me / show me / screen for stocks" → openScreener with relevant filters applied
- Unknown ticker → searchCompanies → if not found → getLiveQuote / getCompanyFinancials
```

- [ ] **Step 3: Add `getCompanyMetrics` to the credit guidance section**

Find:

```
### API credit guidance

- Prefer getLiveQuote (1 credit) for simple price questions
- Use getCompanyFinancials (30 credits) for statements — results are cached server-side for 24h
```

Replace with:

```
### API credit guidance

- Prefer getLiveQuote (1 credit) for simple price questions
- Use getCompanyMetrics (1 credit) for a single metric's trend over time; use getCompanyFinancials (30 credits) instead when the user wants a full statement (multiple line items at once)
- Use getCompanyFinancials (30 credits) for statements — results are cached server-side for 24h
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors, same warning baseline.

- [ ] **Step 5: Manual verification**

Re-run Task 2's and Task 3's manual verification prompts once more now that the docs have changed, confirming the model still routes correctly (the doc changes should only affect the model's *reasoning*, not code behavior, but worth a quick re-check since routing depends on this text).

- [ ] **Step 6: Commit**

```bash
git add lib/ai/systemPrompt.ts
git commit -m "docs: update systemPrompt for the financial_metrics migration"
```

---

### Task 6: Migrate `app/api/compare/route.ts` to TwelveData

**Files:**
- Modify: `app/api/compare/route.ts` (entire file)

**Interfaces:**
- Consumes: `getIncomeStatement`, `getBalanceSheet`, `getCashFlow` (Task 1's 3-arg signatures), `TwelveDataRateLimitError` (all from `lib/twelvedata/twelvedata-client.ts`), `getStorageLogoUrl` (existing, unchanged), `createServerClient` (existing, unchanged).
- Produces: same `GET` handler, same `CompareCompany` interface, same JSON response shape `{ success: true, companies: CompareCompany[] } | { success: false, error: string }` — `app/tools/compare/*` page components need zero changes.

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `app/api/compare/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';
import { getIncomeStatement, getBalanceSheet, getCashFlow, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';

export const dynamic = 'force-dynamic';

export interface CompareCompany {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  logo_url: string | null;
  employee_count: number | null;
  fiscal_year_end: string | null;
  sic_code: string | null;
  incorporation_location: string | null;
  metrics: {
    revenue: number | null;
    grossProfit: number | null;
    grossMargin: number | null;
    operatingIncome: number | null;
    operatingMargin: number | null;
    netIncome: number | null;
    netMargin: number | null;
    epsDiluted: number | null;
    freeCashFlow: number | null;
    totalAssets: number | null;
    shareholdersEquity: number | null;
    revenueGrowth: number | null;
  };
  history: Array<{
    period: string;
    fiscalYear: number;
    revenue: number | null;
    grossProfit: number | null;
    netIncome: number | null;
    epsDiluted: number | null;
    freeCashFlow: number | null;
  }>;
}

interface CompanyRow {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  logo_url: string | null;
  employee_count: number | null;
  fiscal_year_end: string | null;
  sic_code: string | null;
  incorporation_location: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const tickersParam = sp.get('tickers');
    const tickers = tickersParam
      ? tickersParam.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
      : [];

    if (tickers.length < 2 || tickers.length > 5) {
      return NextResponse.json(
        { success: false, error: 'Provide 2–5 comma-separated tickers, e.g. ?tickers=NVDA,AMD' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('ticker, name, sector, industry, description, logo_url, employee_count, fiscal_year_end, sic_code, incorporation_location')
      .in('ticker', tickers);

    if (companiesError) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch companies' },
        { status: 500 }
      );
    }

    const companyByTicker = new Map(((companies ?? []) as CompanyRow[]).map((c) => [c.ticker, c]));

    const results = await Promise.all(
      tickers.map(async (ticker): Promise<CompareCompany | null> => {
        const [income, balance, cashflow] = await Promise.all([
          getIncomeStatement(ticker, 'annual', 4),
          getBalanceSheet(ticker, 'annual', 4),
          getCashFlow(ticker, 'annual', 4),
        ]);

        if (income.length === 0) return null;

        const c = companyByTicker.get(ticker);
        const latest = income[0];
        const prev = income[1];
        const latestBalance = balance[0];
        const latestCashflow = cashflow[0];

        const rev = latest.revenue;
        const prevRev = prev?.revenue ?? null;
        const revenueGrowth =
          rev != null && prevRev != null && prevRev !== 0
            ? ((rev - prevRev) / Math.abs(prevRev)) * 100
            : null;

        const history = income.map((r, i) => {
          const fiscalYear = Number(r.fiscal_date.slice(0, 4));
          return {
            period: `FY${fiscalYear}`,
            fiscalYear,
            revenue: r.revenue,
            grossProfit: r.gross_profit,
            netIncome: r.net_income,
            epsDiluted: r.eps_diluted,
            freeCashFlow: cashflow[i]?.free_cash_flow ?? null,
          };
        });

        return {
          ticker,
          name: c?.name ?? ticker,
          sector: c?.sector ?? null,
          industry: c?.industry ?? null,
          description: c?.description ?? null,
          logo_url: c?.logo_url || getStorageLogoUrl(ticker),
          employee_count: c?.employee_count ?? null,
          fiscal_year_end: c?.fiscal_year_end ?? null,
          sic_code: c?.sic_code ?? null,
          incorporation_location: c?.incorporation_location ?? null,
          metrics: {
            revenue: rev,
            grossProfit: latest.gross_profit,
            grossMargin: rev && latest.gross_profit != null ? (latest.gross_profit / rev) * 100 : null,
            operatingIncome: latest.operating_income,
            operatingMargin: rev && latest.operating_income != null ? (latest.operating_income / rev) * 100 : null,
            netIncome: latest.net_income,
            netMargin: rev && latest.net_income != null ? (latest.net_income / rev) * 100 : null,
            epsDiluted: latest.eps_diluted,
            freeCashFlow: latestCashflow?.free_cash_flow ?? null,
            totalAssets: latestBalance?.total_assets ?? null,
            shareholdersEquity: latestBalance?.total_stockholders_equity ?? null,
            revenueGrowth,
          },
          history,
        };
      }),
    );

    const successfulResults = results.filter((r): r is CompareCompany => r !== null);

    if (successfulResults.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch data for any of the requested companies' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      companies: successfulResults,
    });
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 });
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors, same warning baseline.

- [ ] **Step 3: Manual verification in the browser**

Navigate to `http://localhost:3000/tools/compare?tickers=NVDA,AMD`. Confirm the page renders real company info and financial data with no 500s in the Network tab (this is the exact reproduction that confirmed the bug during brainstorming — same URL should now succeed). Try a 5-ticker comparison too (`?tickers=AAPL,MSFT,GOOGL,AMZN,META`) to confirm the fan-out works within the 2–5 ticker bound.

- [ ] **Step 4: Commit**

```bash
git add app/api/compare/route.ts
git commit -m "fix: migrate /api/compare off the dead financial_metrics table to TwelveData"
```

---

## Post-implementation

Push to `preview`:

```bash
git push origin preview
```

Do **not** merge to `main` — per the standing session instruction, `preview` → `main` merges only happen when the user explicitly says "end session".
