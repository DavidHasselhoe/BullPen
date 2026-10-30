import { createServerClient } from '@/lib/supabase/client';
import { getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { resolveCik } from '@/lib/segments/cik';
import { fetchSubmissions } from '@/lib/edgar/edgar-watch';
import type { IncomeStatementPeriod, BalanceSheetPeriod, CashFlowPeriod } from '@/lib/twelvedata/twelvedata-client';

/**
 * A company's newest quarters read straight from its 10-Q/10-K XBRL, for the
 * days TwelveData hasn't caught up yet.
 *
 * Measured 2026-10-30 (docs/research/earnings-watcher-feasibility.md): the
 * 10-Q reached EDGAR a median 4.1h after the earnings 8-K for the Nasdaq-100's
 * Q3, while TwelveData still showed June for GOOGL and AMZN two days later.
 * Every figure here is a tagged fact from the filing. The only arithmetic is
 * what the filing itself implies: a quarter as year-to-date minus the
 * year-to-date before it (10-Q cash flows, a 10-K's Q4), gross profit as
 * revenue minus a tagged cost of revenue, liabilities as total liabilities
 * and equity minus equity, and free cash flow as operating cash flow minus
 * capital expenditure. EPS and EBITDA are never derived.
 *
 * TwelveData wins wherever it has the quarter (mergeSecRows). A SEC row only
 * fills a quarter TwelveData lacks, or a TwelveData stub row (AMZN Q2 2026
 * had EPS and nothing else), and only when it carries every figure the
 * calculations use that TwelveData's own newest row does (REQUIRED).
 */

export type StatementType = 'income' | 'balance' | 'cashflow';
type Row = { fiscal_date: string; source?: 'sec' } & Record<string, unknown>;

export interface SecStatements {
  accession: string;
  form: string;
  /** Exact end of the quarter that filing covers. */
  periodEnd: string;
  /** EDGAR acceptance time of the newest filing read, real UTC. */
  acceptedAt: string;
  income: IncomeStatementPeriod[];
  balance: BalanceSheetPeriod[];
  cashflow: CashFlowPeriod[];
}

interface Fact { start?: string; end: string; val: number; accn: string; fy?: number; fp?: string; form: string; filed: string }
type Facts = Record<string, { units?: Record<string, Fact[]> }>;

const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;
const isQuarter = (d: number) => d >= 80 && d <= 100;
/** Stored for as long as a quarter can plausibly still be waiting on TwelveData. */
const TTL_SEC = 120 * 24 * 60 * 60;
export const secStatementsKey = (sym: string) => `sec:statements:${sym}`;

function userAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT || 'BullPen contact@bullpeninvest.com';
}

/** Latest-filed USD fact per (start, end) for a tag. Restatements and later comparatives win. */
function latest(facts: Facts, tag: string, unit = 'USD'): Map<string, Fact> {
  const out = new Map<string, Fact>();
  for (const f of facts[tag]?.units?.[unit] ?? []) {
    if (!/^10-[QK]/.test(f.form) || !Number.isFinite(f.val)) continue;
    const key = `${f.start ?? ''}|${f.end}`;
    const prev = out.get(key);
    if (!prev || f.filed > prev.filed) out.set(key, f);
  }
  return out;
}

/** Three months ending `end`: a direct quarter fact, else year-to-date minus the year-to-date one quarter earlier. */
function flow(facts: Facts, tags: string[], end: string, derive = true): number | null {
  for (const tag of tags) {
    const all = [...latest(facts, tag).values()].filter((f) => f.start);
    const direct = all.find((f) => f.end === end && isQuarter(days(f.start!, f.end)));
    if (direct) return direct.val;
    if (!derive) continue;
    for (const ytd of all.filter((f) => f.end === end && days(f.start!, f.end) > 100)) {
      const before = all.find((f) => f.start === ytd.start && isQuarter(days(f.end, end)));
      if (before) return ytd.val - before.val;
    }
  }
  return null;
}

function instant(facts: Facts, tags: string[], end: string): number | null {
  for (const tag of tags) {
    const f = [...latest(facts, tag).values()].find((x) => !x.start && x.end === end);
    if (f) return f.val;
  }
  return null;
}

const minus = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);
const plus = (a: number | null, b: number | null) => (a != null && b != null ? a + b : null);

const REVENUE = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet'];
const COST_OF_REVENUE = ['CostOfRevenue', 'CostOfGoodsAndServicesSold'];
const INTEREST = ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'];
const DA = ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet'];
const CAPEX = ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'];
const DIVIDENDS = ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'];

/** The company's own fiscal tag for a period, from any fact its own filing reported for it. */
function fiscalTag(facts: Facts, end: string): { fy: number | null; q: number | null } {
  for (const tag of [...REVENUE, 'NetIncomeLoss', 'Assets']) {
    const f = [...latest(facts, tag).values()].find((x) => x.end === end && x.fy && x.fp);
    if (f) return { fy: f.fy!, q: f.fp === 'FY' ? 4 : Number(f.fp!.slice(1)) || null };
  }
  return { fy: null, q: null };
}

/** Pure, so scripts/test-sec-statements.ts can run it on recorded companyfacts. */
export function buildRows(facts: Facts, periodEnds: string[]): Pick<SecStatements, 'income' | 'balance' | 'cashflow'> {
  const income: IncomeStatementPeriod[] = [];
  const balance: BalanceSheetPeriod[] = [];
  const cashflow: CashFlowPeriod[] = [];
  for (const end of periodEnds) {
    const revenue = flow(facts, REVENUE, end);
    const { fy, q } = fiscalTag(facts, end);
    if (revenue != null) {
      income.push({
        fiscal_date: end,
        fiscal_quarter: q,
        fiscal_year: fy,
        revenue,
        gross_profit: flow(facts, ['GrossProfit'], end) ?? minus(revenue, flow(facts, COST_OF_REVENUE, end)),
        operating_income: flow(facts, ['OperatingIncomeLoss'], end),
        // Including minority interests, as TwelveData reports it (28 of 40 mismatches on NetIncomeLoss matched ProfitLoss).
        net_income: flow(facts, ['ProfitLoss', 'NetIncomeLoss'], end),
        ebitda: null,
        // Per-share figures don't subtract: a 10-K's Q4 EPS is only ever a direct fact.
        eps_basic: flowEps(facts, 'EarningsPerShareBasic', end),
        eps_diluted: flowEps(facts, 'EarningsPerShareDiluted', end),
        r_and_d_expenses: flow(facts, ['ResearchAndDevelopmentExpense'], end),
        selling_general_administrative_expenses: flow(facts, ['SellingGeneralAndAdministrativeExpense'], end)
          ?? plus(flow(facts, ['SellingAndMarketingExpense'], end), flow(facts, ['GeneralAndAdministrativeExpense'], end)),
        interest_expense: flow(facts, INTEREST, end),
        income_tax_expense: flow(facts, ['IncomeTaxExpenseBenefit'], end),
        reported_currency: 'USD',
        source: 'sec',
      });
    }
    const assets = instant(facts, ['Assets'], end);
    if (assets != null) {
      // Equity including minority interests, or the identity overstates liabilities.
      // With temporary (mezzanine) equity on the books it doesn't hold, so it isn't used.
      const totalEquity = instant(facts, ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity'], end);
      const hasTemporaryEquity = instant(facts, ['TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests', 'RedeemableNoncontrollingInterestEquityCarryingAmount'], end);
      balance.push({
        fiscal_date: end,
        total_assets: assets,
        total_current_assets: instant(facts, ['AssetsCurrent'], end),
        cash_and_equivalents: instant(facts, ['CashAndCashEquivalentsAtCarryingValue'], end),
        total_liabilities: instant(facts, ['Liabilities'], end)
          ?? (hasTemporaryEquity ? null : minus(instant(facts, ['LiabilitiesAndStockholdersEquity'], end), totalEquity)),
        total_current_liabilities: instant(facts, ['LiabilitiesCurrent'], end),
        long_term_debt: instant(facts, ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'], end),
        total_stockholders_equity: totalEquity,
        retained_earnings: instant(facts, ['RetainedEarningsAccumulatedDeficit'], end),
        goodwill_and_intangible_assets: null,
        reported_currency: 'USD',
        source: 'sec',
      });
    }
    const ocf = flow(facts, ['NetCashProvidedByUsedInOperatingActivities'], end);
    if (ocf != null) {
      const capex = flow(facts, CAPEX, end);
      const dividends = flow(facts, DIVIDENDS, end);
      cashflow.push({
        fiscal_date: end,
        net_income: flow(facts, ['ProfitLoss', 'NetIncomeLoss'], end),
        depreciation_and_amortization: flow(facts, DA, end),
        operating_cash_flow: ocf,
        // Outflows read negative, as TwelveData reports them.
        capital_expenditures: capex != null ? -capex : null,
        free_cash_flow: minus(ocf, capex),
        investing_activities_cash_flow: null,
        financing_activities_cash_flow: null,
        dividends_paid: dividends != null ? -dividends : null,
        reported_currency: 'USD',
        source: 'sec',
      });
    }
  }
  return { income, balance, cashflow };
}

function flowEps(facts: Facts, tag: string, end: string): number | null {
  for (const f of latest(facts, tag, 'USD/shares').values()) {
    if (f.start && f.end === end && isQuarter(days(f.start, f.end))) return f.val;
  }
  return null;
}

const KEY_FIELD: Record<StatementType, string> = { income: 'revenue', balance: 'total_assets', cashflow: 'operating_cash_flow' };
/**
 * A SEC row must carry every one of these TwelveData's own newest row has:
 * the figures Health Score, statement valuation and the screener compute
 * with, so a new quarter never quietly drops one out of a ratio or a sum.
 * Display-only lines (R&D, SG&A, basic EPS, D&A, dividends) may be empty.
 *
 * Never filled: EBITDA (not in filings), and goodwill plus intangibles and
 * the investing and financing totals, which are a different quantity at
 * TwelveData (checked against the Nasdaq-100 on 2026-10-30: 4 of 304, 68 of
 * 342 and 169 of 353 agreed), so a SEC figure beside TwelveData's older
 * quarters would draw a jump that never happened.
 */
const REQUIRED: Record<StatementType, string[]> = {
  income: ['revenue', 'gross_profit', 'operating_income', 'net_income', 'eps_diluted', 'interest_expense', 'income_tax_expense'],
  balance: ['total_assets', 'total_current_assets', 'cash_and_equivalents', 'total_liabilities', 'total_current_liabilities', 'long_term_debt', 'total_stockholders_equity'],
  cashflow: ['operating_cash_flow', 'free_cash_flow', 'net_income'],
};
const near = (a: string, b: string) => Math.abs(days(a, b)) <= 31; // TwelveData rounds period ends to the month

/** Required fields TwelveData's row has and the SEC row lacks. Exported for the coverage report. */
export function missingRequired(template: Record<string, unknown> | undefined, sec: Record<string, unknown>, type: StatementType): string[] {
  return template ? REQUIRED[type].filter((k) => template[k] != null && sec[k] == null) : [];
}

/**
 * TwelveData rows with SEC rows laid over, newest first, as many rows as
 * TwelveData returned. Idempotent: earlier SEC rows in `td` are replaced.
 */
export function mergeSecRows<T extends Row>(td: T[], sec: T[], type: StatementType): T[] {
  const key = KEY_FIELD[type];
  const base = td.filter((r) => r.source !== 'sec');
  const template = base.find((r) => r[key] != null);
  const out = base.map((r) => {
    if (r[key] != null) return r;
    const s = sec.find((x) => near(x.fiscal_date, r.fiscal_date));
    if (!s) return r;
    const filled: Record<string, unknown> = { ...r };
    for (const [k, v] of Object.entries(s)) if (filled[k] == null && v != null && k !== 'source') filled[k] = v;
    return filled as T;
  });
  for (const s of sec) {
    if (out.some((r) => near(r.fiscal_date, s.fiscal_date))) continue;
    if (base[0] && s.fiscal_date < base[0].fiscal_date) continue;
    if (missingRequired(template, s, type).length) continue;
    out.push(s);
  }
  return out.sort((a, b) => b.fiscal_date.localeCompare(a.fiscal_date)).slice(0, Math.max(base.length, 4));
}

/** Overlay for a TwelveData statement fetch. Never throws: a SEC miss leaves TwelveData's rows as they were. */
export async function withSecQuarters<T extends { fiscal_date: string }>(symbol: string, type: StatementType, rows: T[]): Promise<T[]> {
  try {
    const sec = await getCachedStale<SecStatements>(secStatementsKey(symbol.toUpperCase()));
    if (!sec) return rows;
    return mergeSecRows(rows as unknown as Row[], sec[type] as unknown as Row[], type) as unknown as T[];
  } catch {
    return rows;
  }
}

async function secJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent(), Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The newest 10-Q/10-K filed on or after `filedSince` (YYYY-MM-DD) for a
 * period ending at most `maxAgeDays` before it, or null. One small request.
 */
export async function findPeriodicFiling(ticker: string, filedSince: string, maxAgeDays = 120) {
  const cik = await resolveCik(ticker);
  if (!cik) return null;
  const { filings } = await fetchSubmissions(cik);
  const hit = filings.find((f) => /^10-[QK]$/.test(f.form) && f.filingDate >= filedSince && f.reportDate
    && days(f.reportDate, filedSince) <= maxAgeDays);
  if (!hit) return null;
  // Quarters to read: this one and the three before it, for stub rows TwelveData left behind.
  const ends = [...new Set(filings.filter((f) => /^10-[QK]/.test(f.form) && f.reportDate && f.reportDate <= hit.reportDate).map((f) => f.reportDate))]
    .sort().reverse().slice(0, 4);
  return { cik, filing: hit, periodEnds: ends };
}

/**
 * Reads the filing's quarter from SEC's XBRL API, stores it and lays it into
 * the cached TwelveData statements. Returns false when the XBRL doesn't carry
 * the period yet (the API can trail the filing briefly) or isn't in USD; the
 * caller tries again next run.
 */
export async function storeSecStatements(
  ticker: string,
  found: NonNullable<Awaited<ReturnType<typeof findPeriodicFiling>>>,
): Promise<boolean> {
  const sym = ticker.toUpperCase();
  const body = await secJson<{ facts?: { 'us-gaap'?: Facts } }>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${found.cik}.json`);
  const facts = body?.facts?.['us-gaap'];
  if (!facts) return false;
  const rows = buildRows(facts, found.periodEnds);
  if (!rows.income.some((r) => r.fiscal_date === found.filing.reportDate) && !rows.balance.some((r) => r.fiscal_date === found.filing.reportDate)) {
    return false;
  }
  const stored: SecStatements = {
    accession: found.filing.accessionNumber,
    form: found.filing.form,
    periodEnd: found.filing.reportDate,
    acceptedAt: found.filing.acceptanceDateTime ?? '',
    ...rows,
  };
  await setCached(secStatementsKey(sym), sym, 'sec_statements', stored, TTL_SEC);
  await patchCachedStatements(sym, stored);
  return true;
}

/**
 * Re-merges the cached quarterly statements in place. Leaves fetched_at and
 * expires_at alone: the freshness check compares TwelveData's last_change
 * against fetched_at, and a bumped timestamp would hide TwelveData's own
 * update when it lands.
 */
async function patchCachedStatements(sym: string, sec: SecStatements): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- market_data_cache isn't in the generated types
  const supabase = createServerClient() as any;
  for (const type of ['income', 'balance', 'cashflow'] as const) {
    const key = `financials:${sym}:${type}:quarterly`;
    const { data } = (await supabase.from('market_data_cache').select('payload').eq('cache_key', key).maybeSingle()) as { data: { payload: Row[] } | null };
    if (!Array.isArray(data?.payload)) continue;
    const merged = mergeSecRows(data.payload, sec[type] as unknown as Row[], type);
    await supabase.from('market_data_cache').update({ payload: merged }).eq('cache_key', key);
  }
  // The fiscal-quarter names come from SEC's filing list, cached 12h: let the new filing in.
  await supabase.from('market_data_cache').update({ expires_at: new Date().toISOString() }).eq('cache_key', `sec:fiscal-calendar:${sym}`);
}
