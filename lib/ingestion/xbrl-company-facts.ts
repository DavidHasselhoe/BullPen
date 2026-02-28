/**
 * XBRL Company Facts Extractor
 *
 * Fetches ALL financial metrics for a company in ONE API call using the SEC's
 * Company Facts API (data.sec.gov/api/xbrl/companyfacts/CIK{10-digit}.json).
 *
 * This replaces the previous AI table-reading pipeline entirely for structured
 * financial metrics. No AI is needed — XBRL is fully machine-readable.
 *
 * Coverage:
 *   - US-GAAP filers (10-K, 10-Q): revenue, net income, EPS, balance sheet, cash flows
 *   - IFRS filers (20-F): same via ifrs-full taxonomy
 *   - DEI taxonomy: shares outstanding
 *   - Calculated: free_cash_flow = operating_cash_flow - capital_expenditures
 */

import { createServerClient } from '../supabase/client';
import type { MetricType, InsertFinancialMetric } from '../types/database';

// ============================================================
// CONSTANTS
// ============================================================

/** Filing forms we extract metrics from */
const ACCEPTED_FORMS = new Set([
  '10-K', '10-K/A',
  '10-Q', '10-Q/A',
  '20-F', '20-F/A',
]);

/** Balance sheet metrics — these are instantaneous (no start date, no period-length filter) */
const INSTANT_METRICS = new Set<MetricType>([
  'total_assets',
  'total_liabilities',
  'shareholders_equity',
  'shares_outstanding',
]);

/** EPS metrics are always marked split-adjusted when sourced from XBRL */
const EPS_METRICS = new Set<MetricType>(['eps_basic', 'eps_diluted']);

/** Keep at most this many periods per metric+period_type to match history policy */
const MAX_ANNUAL_PERIODS = 5;
const MAX_QUARTERLY_PERIODS = 12;

// ============================================================
// TAG MAPS
// Tags are listed in priority order — first match per (metric, period) wins.
// ============================================================

interface TagMapping {
  tag: string;
  metricType: MetricType;
}

const US_GAAP_TAGS: TagMapping[] = [
  // ── Revenue ──────────────────────────────────────────────
  { tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', metricType: 'revenue' },
  { tag: 'Revenues',                                           metricType: 'revenue' },
  { tag: 'SalesRevenueNet',                                    metricType: 'revenue' },
  { tag: 'RevenueFromContractWithCustomerIncludingAssessedTax',metricType: 'revenue' },
  { tag: 'SalesRevenueGoodsNet',                               metricType: 'revenue' },
  { tag: 'SalesRevenueServicesNet',                            metricType: 'revenue' },
  { tag: 'RevenuesNetOfInterestExpense',                       metricType: 'revenue' }, // banks
  { tag: 'InterestAndDividendIncomeOperating',                 metricType: 'revenue' }, // banks alt

  // ── Cost of Revenue ───────────────────────────────────────
  { tag: 'CostOfGoodsAndServicesSold', metricType: 'cost_of_revenue' },
  { tag: 'CostOfRevenue',              metricType: 'cost_of_revenue' },
  { tag: 'CostOfGoodsSold',            metricType: 'cost_of_revenue' },

  // ── Gross Profit ──────────────────────────────────────────
  { tag: 'GrossProfit', metricType: 'gross_profit' },

  // ── Operating Income ──────────────────────────────────────
  { tag: 'OperatingIncomeLoss', metricType: 'operating_income' },

  // ── Net Income ────────────────────────────────────────────
  { tag: 'NetIncomeLoss',                                     metricType: 'net_income' },
  { tag: 'NetIncomeLossAvailableToCommonStockholdersBasic',   metricType: 'net_income' },

  // ── EPS Basic ─────────────────────────────────────────────
  { tag: 'EarningsPerShareBasic',                           metricType: 'eps_basic' },
  { tag: 'IncomeLossFromContinuingOperationsPerBasicShare', metricType: 'eps_basic' },

  // ── EPS Diluted ───────────────────────────────────────────
  { tag: 'EarningsPerShareDiluted',                           metricType: 'eps_diluted' },
  { tag: 'IncomeLossFromContinuingOperationsPerDilutedShare', metricType: 'eps_diluted' },

  // ── Balance Sheet ─────────────────────────────────────────
  { tag: 'Assets',      metricType: 'total_assets' },
  { tag: 'Liabilities', metricType: 'total_liabilities' },
  { tag: 'StockholdersEquity',                                                           metricType: 'shareholders_equity' },
  { tag: 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',       metricType: 'shareholders_equity' },

  // ── Cash Flows ────────────────────────────────────────────
  { tag: 'NetCashProvidedByUsedInOperatingActivities', metricType: 'operating_cash_flow' },

  // ── Capital Expenditures (for FCF calculation) ────────────
  { tag: 'PaymentsToAcquirePropertyPlantAndEquipment',     metricType: 'capital_expenditures' },
  { tag: 'CapitalExpendituresIncurringObligation',         metricType: 'capital_expenditures' },
  { tag: 'PaymentsForPropertyPlantAndEquipment',           metricType: 'capital_expenditures' },
  { tag: 'PurchasesOfPropertyPlantAndEquipment',           metricType: 'capital_expenditures' },

  // ── Shares Outstanding (also in DEI below) ────────────────
  { tag: 'CommonStockSharesOutstanding', metricType: 'shares_outstanding' },
];

/** DEI taxonomy — shares outstanding is commonly filed here */
const DEI_TAGS: TagMapping[] = [
  { tag: 'EntityCommonStockSharesOutstanding', metricType: 'shares_outstanding' },
];

/** IFRS-full taxonomy for foreign private issuers (20-F) */
const IFRS_TAGS: TagMapping[] = [
  { tag: 'Revenue',                                                               metricType: 'revenue' },
  { tag: 'RevenueFromContractsWithCustomers',                                     metricType: 'revenue' },
  { tag: 'GrossProfit',                                                           metricType: 'gross_profit' },
  { tag: 'ProfitLossFromOperatingActivities',                                     metricType: 'operating_income' },
  { tag: 'OperatingIncomeLoss',                                                   metricType: 'operating_income' },
  { tag: 'ProfitLoss',                                                            metricType: 'net_income' },
  { tag: 'BasicEarningsLossPerShare',                                             metricType: 'eps_basic' },
  { tag: 'EarningsPerShareBasicAndDiluted',                                       metricType: 'eps_basic' },
  { tag: 'DilutedEarningsLossPerShare',                                           metricType: 'eps_diluted' },
  { tag: 'Assets',                                                                metricType: 'total_assets' },
  { tag: 'Liabilities',                                                           metricType: 'total_liabilities' },
  { tag: 'Equity',                                                                metricType: 'shareholders_equity' },
  { tag: 'CashFlowsFromUsedInOperatingActivities',                                metricType: 'operating_cash_flow' },
  { tag: 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',   metricType: 'capital_expenditures' },
  { tag: 'PurchaseOfPropertyPlantAndEquipment',                                   metricType: 'capital_expenditures' },
];

// ============================================================
// EXPORTED TYPES
// ============================================================

export interface FilingIndexEntry {
  filingId: string;
  filingType: string;
  periodEndDate: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
}

export interface CompanyMetricsResult {
  metricsExtracted: number;
  metricsStored: number;
  fcfCalculated: number;
  errors: string[];
}

// ============================================================
// INTERNAL TYPES
// ============================================================

interface XBRLFact {
  val: number | string;
  end: string;        // Period end date YYYY-MM-DD
  start?: string;     // Period start date YYYY-MM-DD (duration facts only)
  accn?: string;      // Accession number
  fy?: number | string;
  fp?: string;        // FY | Q1 | Q2 | Q3 | Q4
  form?: string;
  filed?: string;     // Date filed YYYY-MM-DD
  frame?: string;
}

// ============================================================
// HELPERS
// ============================================================

function monthsBetween(startDate: string, endDate: string): number {
  const s = new Date(startDate);
  const e = new Date(endDate);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

function normalizeAccessionNumber(accn: string): string {
  // SEC sometimes omits dashes — ensure format XXXXXXXXXX-YY-XXXXXX
  if (accn.includes('-')) return accn;
  if (accn.length === 18) {
    return `${accn.slice(0, 10)}-${accn.slice(10, 12)}-${accn.slice(12)}`;
  }
  return accn;
}

function getUnitForMetric(metricType: MetricType): string {
  if (metricType === 'shares_outstanding') return 'shares';
  if (EPS_METRICS.has(metricType)) return 'USD/shares';
  return 'USD';
}

function getCurrencyFromUnit(unit: string, metricType: MetricType): string {
  if (metricType === 'shares_outstanding') return 'USD';
  const knownCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NOK', 'SEK', 'DKK'];
  return knownCurrencies.includes(unit) ? unit : 'USD';
}

function isUnitRelevantForMetric(unit: string, metricType: MetricType): boolean {
  if (metricType === 'shares_outstanding') return unit === 'shares';
  if (EPS_METRICS.has(metricType)) return unit === 'USD/shares';
  // Money metrics — accept any currency unit, reject pure shares
  return unit !== 'shares' && unit !== 'pure';
}

// ============================================================
// CORE EXTRACTION FROM A SINGLE TAXONOMY
// ============================================================

function extractFactsFromTaxonomy(
  taxonomyFacts: Record<string, { units: Record<string, XBRLFact[]> }>,
  tagMap: TagMapping[],
  filingIdMap: Map<string, FilingIndexEntry>,
  companyId: string,
  existingPeriodKeys: Set<string>, // Already covered by a previous taxonomy call
): InsertFinancialMetric[] {
  /**
   * We iterate tags in priority order. `coveredPeriodKeys` ensures a lower-priority
   * tag cannot overwrite data already obtained from a higher-priority tag.
   *
   * Within the same tag, if a period appears in multiple accession numbers (amendments),
   * we keep the one most recently filed.
   */
  const coveredPeriodKeys = new Set<string>(existingPeriodKeys);

  // tag+period → best metric so far (to deduplicate amendments within the same tag)
  const candidateByTagPeriod = new Map<string, InsertFinancialMetric & { _filed: string }>();

  for (const { tag, metricType } of tagMap) {
    const conceptData = taxonomyFacts[tag];
    if (!conceptData?.units) continue;

    const isInstant = INSTANT_METRICS.has(metricType);

    for (const [unit, facts] of Object.entries(conceptData.units)) {
      if (!isUnitRelevantForMetric(unit, metricType)) continue;

      for (const fact of facts) {
        if (!fact.accn || !fact.end) continue;

        const accn = normalizeAccessionNumber(fact.accn);

        // Only keep forms we care about
        const form = (fact.form || '').toUpperCase().trim();
        const baseForm = form.replace('/A', '');
        if (!ACCEPTED_FORMS.has(form) && !ACCEPTED_FORMS.has(baseForm)) continue;

        // Determine period type from the XBRL fiscal period indicator
        const fp = (fact.fp || '').toUpperCase().trim();
        const isAnnual = fp === 'FY';
        const isQuarterly = fp === 'Q1' || fp === 'Q2' || fp === 'Q3' || fp === 'Q4';
        if (!isAnnual && !isQuarterly) continue;

        const periodType: 'annual' | 'quarterly' = isAnnual ? 'annual' : 'quarterly';

        // Period-length filter for income statement / cash flow facts (duration, have start date)
        if (!isInstant) {
          if (fact.start) {
            const months = monthsBetween(fact.start, fact.end);
            if (isAnnual   && (months < 10 || months > 14)) continue; // ~12 months
            if (isQuarterly && (months < 2  || months > 4))  continue; // ~3 months
          } else {
            // Duration fact without a start date — cannot validate, skip unless it's EPS
            // (some older filings omit start for EPS; we accept based on fp alone)
            if (!EPS_METRICS.has(metricType)) continue;
          }
        }

        // The canonical deduplication key shared across all tags for this metric+period
        const periodKey = `${metricType}:${fact.end}:${periodType}`;
        if (coveredPeriodKeys.has(periodKey)) continue; // Higher-priority tag already won

        // Within the same tag: deduplicate by period — keep most recently filed
        const tagPeriodKey = `${tag}:${periodKey}`;
        const existing = candidateByTagPeriod.get(tagPeriodKey);
        if (existing && (fact.filed || '') <= existing._filed) continue;

        // Link to our DB filing record via accession number
        const filingEntry = filingIdMap.get(accn);
        if (!filingEntry) continue; // We don't have this filing stored — skip

        const rawValue = typeof fact.val === 'string' ? parseFloat(fact.val) : fact.val;
        if (!isFinite(rawValue)) continue;

        const fiscalYear = fact.fy != null ? parseInt(String(fact.fy)) : (filingEntry.fiscalYear ?? null);
        const fiscalQuarter = isQuarterly ? parseInt(fp[1]) : null;

        const metric: InsertFinancialMetric & { _filed: string } = {
          filing_id:        filingEntry.filingId,
          company_id:       companyId,
          metric_type:      metricType,
          value:            rawValue,
          unit:             getUnitForMetric(metricType),
          period_type:      periodType,
          period_start_date: fact.start || null,
          period_end_date:  fact.end,
          fiscal_year:      fiscalYear,
          fiscal_quarter:   fiscalQuarter,
          accounting_basis: 'gaap',
          currency:         getCurrencyFromUnit(unit, metricType),
          // XBRL EPS values are always reported on a split-adjusted basis
          split_adjusted:   EPS_METRICS.has(metricType),
          is_restated:      form.includes('/A'),
          ingested_at:      new Date().toISOString(),
          metadata:         {},
          _filed:           fact.filed || '',
        };

        candidateByTagPeriod.set(tagPeriodKey, metric);
        // Mark this period as covered so lower-priority tags in the same taxonomy skip it
        coveredPeriodKeys.add(periodKey);
      }
    }
  }

  // Strip the internal _filed tracking field before returning
  return Array.from(candidateByTagPeriod.values()).map(({ _filed, ...metric }) => metric);
}

// ============================================================
// FREE CASH FLOW CALCULATION
// ============================================================

function calculateFreeCashFlow(
  metrics: InsertFinancialMetric[],
): InsertFinancialMetric[] {
  const fcfResults: InsertFinancialMetric[] = [];

  // Index OCF and CapEx by (filing_id, period_end_date, period_type)
  const ocfByKey  = new Map<string, InsertFinancialMetric>();
  const capexByKey = new Map<string, InsertFinancialMetric>();

  for (const m of metrics) {
    const key = `${m.filing_id}:${m.period_end_date}:${m.period_type}`;
    if (m.metric_type === 'operating_cash_flow')  ocfByKey.set(key, m);
    if (m.metric_type === 'capital_expenditures') capexByKey.set(key, m);
  }

  for (const [key, ocf] of ocfByKey) {
    const capex = capexByKey.get(key);
    if (!capex) continue;

    // CapEx from PaymentsToAcquire... is stored as a positive number in XBRL
    // (it represents cash paid out). FCF = OCF - CapEx.
    const fcfValue = ocf.value - Math.abs(capex.value);

    fcfResults.push({
      ...ocf,
      metric_type:   'free_cash_flow',
      value:         fcfValue,
      // FCF inherits its period window from the OCF entry
    });
  }

  return fcfResults;
}

// ============================================================
// HISTORY POLICY
// ============================================================

function applyHistoryPolicy(metrics: InsertFinancialMetric[]): InsertFinancialMetric[] {
  // Group by (metric_type, period_type) and keep only the most recent N periods
  const groups = new Map<string, InsertFinancialMetric[]>();

  for (const m of metrics) {
    const key = `${m.metric_type}:${m.period_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const result: InsertFinancialMetric[] = [];
  for (const [key, group] of groups) {
    // Sort most recent first
    group.sort((a, b) => b.period_end_date.localeCompare(a.period_end_date));
    const limit = key.endsWith(':annual') ? MAX_ANNUAL_PERIODS : MAX_QUARTERLY_PERIODS;
    result.push(...group.slice(0, limit));
  }
  return result;
}

// ============================================================
// BULK DATABASE UPSERT
// ============================================================

async function bulkUpsertMetrics(
  metrics: InsertFinancialMetric[],
  supabase: ReturnType<typeof createServerClient>,
): Promise<{ stored: number; errors: string[] }> {
  const BATCH_SIZE = 100;
  let stored = 0;
  const errors: string[] = [];

  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE);
    try {
      const { error } = await supabase
        .from('financial_metrics')
        .upsert(batch as any, {
          onConflict: 'filing_id,metric_type,period_end_date',
          ignoreDuplicates: false,
        });

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        stored += batch.length;
      }
    } catch (err) {
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return { stored, errors };
}

// ============================================================
// PUBLIC ENTRY POINT
// ============================================================

/**
 * Fetches the SEC Company Facts JSON for a company (one API call) and extracts
 * all available financial metrics across all historical periods.
 *
 * Results are linked to our `filings` table via the `filingIdMap` (accession → filing_id).
 * Only facts whose accession number exists in `filingIdMap` are stored.
 */
export async function fetchAndExtractCompanyMetrics(
  cik: string,
  companyId: string,
  filingIdMap: Map<string, FilingIndexEntry>,
  onProgress?: (msg: string) => void,
): Promise<CompanyMetricsResult> {
  const supabase = createServerClient();
  const errors: string[] = [];

  try {
    const paddedCik = cik.replace(/^0+/, '').padStart(10, '0');
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`;

    onProgress?.('Fetching XBRL company facts from SEC');
    await new Promise((r) => setTimeout(r, 150)); // 10 req/sec rate limit

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'david@hasselo.no',
        'Accept':     'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { metricsExtracted: 0, metricsStored: 0, fcfCalculated: 0, errors: ['No XBRL data available (404)'] };
      }
      throw new Error(`SEC XBRL API ${response.status}: ${response.statusText}`);
    }

    const companyFacts = await response.json();
    const facts = companyFacts.facts || {};

    onProgress?.('Mapping XBRL tags to metrics');

    let allMetrics: InsertFinancialMetric[] = [];

    // Track which (metric, period) keys have been covered across taxonomies
    // so that higher-quality US-GAAP data is not overwritten by IFRS fallbacks
    const coveredKeys = new Set<string>();

    // 1. US-GAAP (domestic filers — most companies)
    if (facts['us-gaap']) {
      const m = extractFactsFromTaxonomy(facts['us-gaap'], US_GAAP_TAGS, filingIdMap, companyId, coveredKeys);
      m.forEach((metric) => coveredKeys.add(`${metric.metric_type}:${metric.period_end_date}:${metric.period_type}`));
      allMetrics.push(...m);
    }

    // 2. DEI taxonomy — shares outstanding is commonly here
    if (facts['dei']) {
      const m = extractFactsFromTaxonomy(facts['dei'], DEI_TAGS, filingIdMap, companyId, coveredKeys);
      m.forEach((metric) => coveredKeys.add(`${metric.metric_type}:${metric.period_end_date}:${metric.period_type}`));
      allMetrics.push(...m);
    }

    // 3. IFRS-full taxonomy — foreign private issuers (20-F)
    if (facts['ifrs-full']) {
      const m = extractFactsFromTaxonomy(facts['ifrs-full'], IFRS_TAGS, filingIdMap, companyId, coveredKeys);
      allMetrics.push(...m);
    }

    const metricsExtracted = allMetrics.length;
    onProgress?.(`Extracted ${metricsExtracted} data points from XBRL`);

    // 4. Calculate Free Cash Flow from OCF + CapEx pairs
    const fcfMetrics = calculateFreeCashFlow(allMetrics);
    allMetrics.push(...fcfMetrics);
    onProgress?.(`Calculated ${fcfMetrics.length} free cash flow periods`);

    // 5. Apply history policy (keep last 5 annual, 12 quarterly per metric)
    allMetrics = applyHistoryPolicy(allMetrics);
    onProgress?.(`After history policy: ${allMetrics.length} metrics to store`);

    // 6. Bulk upsert to database
    onProgress?.('Writing metrics to database');
    const { stored, errors: upsertErrors } = await bulkUpsertMetrics(allMetrics, supabase);
    errors.push(...upsertErrors);

    onProgress?.(`Stored ${stored} metrics`);

    return { metricsExtracted, metricsStored: stored, fcfCalculated: fcfMetrics.length, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    errors.push(msg);
    return { metricsExtracted: 0, metricsStored: 0, fcfCalculated: 0, errors };
  }
}
