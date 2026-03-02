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
  existingPeriodKeys: Set<string>,
): Array<InsertFinancialMetric & { _filed: string }> {
  /**
   * Tags are processed in priority order.  `coveredPeriodKeys` prevents a
   * lower-priority tag from overwriting data already captured by a higher one.
   *
   * Within the same tag, a period may appear in many filings (original 10-Q,
   * comparative in next year's 10-Q, restated in 10-K, etc.).  We keep the
   * **most recently filed** value so that stock-split restatements and
   * amendment corrections are automatically preferred.
   *
   * IMPORTANT: `coveredPeriodKeys` is populated only AFTER all facts for a
   * tag are processed, so that within-tag dedup can compare originals against
   * restatements without premature blocking.
   */
  const coveredPeriodKeys = new Set<string>(existingPeriodKeys);

  const candidateByTagPeriod = new Map<string, InsertFinancialMetric & { _filed: string }>();

  for (const { tag, metricType } of tagMap) {
    const conceptData = taxonomyFacts[tag];
    if (!conceptData?.units) continue;

    const isInstant = INSTANT_METRICS.has(metricType);
    const newPeriodKeys = new Set<string>();

    for (const [unit, facts] of Object.entries(conceptData.units)) {
      if (!isUnitRelevantForMetric(unit, metricType)) continue;

      for (const fact of facts) {
        if (!fact.accn || !fact.end) continue;

        const accn = normalizeAccessionNumber(fact.accn);

        const form = (fact.form || '').toUpperCase().trim();
        const baseForm = form.replace('/A', '');
        if (!ACCEPTED_FORMS.has(form) && !ACCEPTED_FORMS.has(baseForm)) continue;

        const fp = (fact.fp || '').toUpperCase().trim();
        const isAnnual = fp === 'FY';
        const isQuarterly = fp === 'Q1' || fp === 'Q2' || fp === 'Q3' || fp === 'Q4';
        if (!isAnnual && !isQuarterly) continue;

        const periodType: 'annual' | 'quarterly' = isAnnual ? 'annual' : 'quarterly';

        if (!isInstant) {
          if (fact.start) {
            const months = monthsBetween(fact.start, fact.end);
            if (isAnnual   && (months < 10 || months > 14)) continue;
            if (isQuarterly && (months < 2  || months > 4))  continue;
          } else {
            if (!EPS_METRICS.has(metricType)) continue;
          }
        }

        const periodKey = `${metricType}:${fact.end}:${periodType}`;
        if (coveredPeriodKeys.has(periodKey)) continue;

        const tagPeriodKey = `${tag}:${periodKey}`;
        const existing = candidateByTagPeriod.get(tagPeriodKey);
        if (existing && (fact.filed || '') <= existing._filed) continue;

        const filingEntry = filingIdMap.get(accn);
        if (!filingEntry) continue;

        const rawValue = typeof fact.val === 'string' ? parseFloat(fact.val) : fact.val;
        if (!isFinite(rawValue)) continue;

        let fiscalYear = fact.fy != null ? parseInt(String(fact.fy)) : (filingEntry.fiscalYear ?? null);
        const fiscalQuarter = isQuarterly ? parseInt(fp[1]) : null;

        // When a restated value replaces an original, the XBRL fact carries the
        // REPORTING filing's FY (e.g. fy=2026 for a Q1 FY2025 comparative restated
        // in the FY2026 10-Q).  The correct FY for the data is the lower value.
        if (existing?.fiscal_year != null && fiscalYear != null) {
          fiscalYear = Math.min(existing.fiscal_year, fiscalYear);
        } else if (existing?.fiscal_year != null) {
          fiscalYear = existing.fiscal_year;
        }

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
          split_adjusted:   EPS_METRICS.has(metricType),
          is_restated:      form.includes('/A'),
          ingested_at:      new Date().toISOString(),
          metadata:         {},
          _filed:           fact.filed || '',
        };

        candidateByTagPeriod.set(tagPeriodKey, metric);
        newPeriodKeys.add(periodKey);
      }
    }

    // Only after ALL facts for this tag are processed do we block lower-priority
    // tags from providing data for the same periods.
    for (const pk of newPeriodKeys) coveredPeriodKeys.add(pk);
  }

  return Array.from(candidateByTagPeriod.values());
}

// ============================================================
// STOCK SPLIT DETECTION & ADJUSTMENT
// ============================================================

interface StockSplitEvent {
  ratio: number;
  /** Approximate effective date — values filed before this need adjustment */
  effectiveDate: string;
}

/**
 * Detects stock splits from the SEC Company Facts JSON.
 *
 * Primary: reads the `StockholdersEquityNoteStockSplitConversionRatio1` tag
 * which explicitly reports the split ratio and effective date.
 *
 * Fallback: compares original vs. restated quarterly EPS values for the same
 * period end date.  If the ratio is a clean integer >= 2, a split is inferred.
 */
function detectStockSplits(
  facts: Record<string, any>,
): StockSplitEvent[] {
  const splits: StockSplitEvent[] = [];
  const seenRatios = new Set<number>();

  // ── Primary: explicit split tag ──────────────────────────────────────
  const splitTag = facts?.['us-gaap']?.StockholdersEquityNoteStockSplitConversionRatio1;
  if (splitTag?.units?.pure) {
    const byRatio = new Map<number, string>(); // ratio → earliest effective date
    for (const fact of splitTag.units.pure as XBRLFact[]) {
      const ratio = typeof fact.val === 'string' ? parseFloat(fact.val) : fact.val;
      if (!isFinite(ratio) || ratio < 2) continue;
      const roundedRatio = Math.round(ratio);
      if (Math.abs(ratio - roundedRatio) > 0.5) continue;

      const effectiveDate = fact.end || fact.filed || '';
      if (!effectiveDate) continue;

      const existing = byRatio.get(roundedRatio);
      if (!existing || effectiveDate < existing) {
        byRatio.set(roundedRatio, effectiveDate);
      }
    }

    for (const [ratio, effectiveDate] of byRatio) {
      splits.push({ ratio, effectiveDate });
      seenRatios.add(ratio);
    }
  }

  // ── Fallback: detect from EPS value ratios across restatements ───────
  if (splits.length === 0) {
    const epsTag = facts?.['us-gaap']?.EarningsPerShareDiluted;
    const epsFacts: XBRLFact[] = epsTag?.units?.['USD/shares'] || [];

    // Group quarterly facts by period end date
    const byEnd = new Map<string, Array<{ val: number; filed: string }>>();
    for (const fact of epsFacts) {
      if (!fact.end || fact.val == null || !fact.filed) continue;
      const fp = (fact.fp || '').toUpperCase();
      if (fp !== 'Q1' && fp !== 'Q2' && fp !== 'Q3' && fp !== 'Q4') continue;
      if (fact.start) {
        const months = monthsBetween(fact.start, fact.end);
        if (months < 2 || months > 4) continue;
      }
      const val = typeof fact.val === 'string' ? parseFloat(fact.val) : fact.val;
      if (!isFinite(val) || Math.abs(val) < 0.001) continue;
      if (!byEnd.has(fact.end)) byEnd.set(fact.end, []);
      byEnd.get(fact.end)!.push({ val, filed: fact.filed });
    }

    const candidateRatios = new Map<number, string>(); // ratio → latest pre-split filed
    for (const [, group] of byEnd) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.filed.localeCompare(b.filed));
      const earliest = group[0];
      const latest = group[group.length - 1];
      if (Math.abs(latest.val) < 0.001) continue;
      const ratio = earliest.val / latest.val;
      if (ratio < 1.5) continue;
      const roundedRatio = Math.round(ratio);
      if (Math.abs(ratio - roundedRatio) / roundedRatio > 0.15) continue;
      const existing = candidateRatios.get(roundedRatio);
      if (!existing || earliest.filed > existing) {
        candidateRatios.set(roundedRatio, earliest.filed);
      }
    }

    for (const [ratio, effectiveAfter] of candidateRatios) {
      if (!seenRatios.has(ratio)) {
        splits.push({ ratio, effectiveDate: effectiveAfter });
      }
    }
  }

  // Sort most-recent split first so adjustments compound correctly
  splits.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return splits;
}

/** Per-share metrics where values need to be DIVIDED by split ratio */
const PER_SHARE_METRICS = new Set<MetricType>(['eps_diluted', 'eps_basic']);

/** Share-count metrics where values need to be MULTIPLIED by split ratio */
const SHARE_COUNT_METRICS = new Set<MetricType>(['shares_outstanding']);

/**
 * Adjusts pre-split metric values so all data is on the same post-split basis.
 *
 * After `extractFactsFromTaxonomy` picks the most-recently-filed value for
 * each period, some older periods may still carry pre-split values because
 * the SEC only restates ~1 year of comparatives.  This function divides
 * per-share metrics (EPS) by the split ratio and multiplies share counts.
 */
function applySplitAdjustments(
  metrics: Array<InsertFinancialMetric & { _filed: string }>,
  splits: StockSplitEvent[],
): void {
  if (splits.length === 0) return;

  for (const split of splits) {
    for (const metric of metrics) {
      if (metric._filed >= split.effectiveDate) continue;

      const mt = metric.metric_type as MetricType;
      if (PER_SHARE_METRICS.has(mt)) {
        metric.value = parseFloat((metric.value / split.ratio).toFixed(4));
      } else if (SHARE_COUNT_METRICS.has(mt)) {
        metric.value = Math.round(metric.value * split.ratio);
      }
    }
  }
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

    // 0. Detect stock splits before extracting metrics
    const splits = detectStockSplits(facts);
    if (splits.length > 0) {
      onProgress?.(`Detected ${splits.length} stock split(s): ${splits.map((s) => `${s.ratio}:1`).join(', ')}`);
    }

    onProgress?.('Mapping XBRL tags to metrics');

    // _filed is preserved through extraction so split adjustment can use it
    type MetricWithFiled = InsertFinancialMetric & { _filed: string };
    let allMetrics: MetricWithFiled[] = [];

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

    // 3.5 Apply stock split adjustments to per-share metrics filed pre-split
    if (splits.length > 0) {
      applySplitAdjustments(allMetrics, splits);
      onProgress?.('Applied stock split adjustments to pre-split values');
    }

    // 4. Calculate Free Cash Flow from OCF + CapEx pairs (strip _filed first)
    const cleanMetrics: InsertFinancialMetric[] = allMetrics.map(({ _filed, ...rest }) => rest);
    const fcfMetrics = calculateFreeCashFlow(cleanMetrics);
    let finalMetrics: InsertFinancialMetric[] = [...cleanMetrics, ...fcfMetrics];
    onProgress?.(`Calculated ${fcfMetrics.length} free cash flow periods`);

    // 5. Apply history policy (keep last 5 annual, 12 quarterly per metric)
    finalMetrics = applyHistoryPolicy(finalMetrics);
    onProgress?.(`After history policy: ${finalMetrics.length} metrics to store`);

    // 6. Delete existing metrics for this company so stale rows with old
    //    filing_ids (from pre-split ingestions) don't persist alongside new ones
    const { error: deleteErr } = await supabase
      .from('financial_metrics')
      .delete()
      .eq('company_id', companyId);
    if (deleteErr) {
      onProgress?.(`Warning: could not clear old metrics — ${deleteErr.message}`);
    }

    // 7. Bulk upsert fresh metrics
    onProgress?.('Writing metrics to database');
    const { stored, errors: upsertErrors } = await bulkUpsertMetrics(finalMetrics, supabase);
    errors.push(...upsertErrors);

    onProgress?.(`Stored ${stored} metrics`);

    return { metricsExtracted, metricsStored: stored, fcfCalculated: fcfMetrics.length, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    errors.push(msg);
    return { metricsExtracted: 0, metricsStored: 0, fcfCalculated: 0, errors };
  }
}
