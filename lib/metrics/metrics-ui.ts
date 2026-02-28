// Server actions for Metrics UI
// Read-only queries for frontend display
// Phase 1: Gates charts behind re-ingested data only

import { createServerClient } from '../supabase/client';
import type { MetricType, PeriodType } from '../types/database';
import { FISCAL_REFACTOR_RELEASE_DATE } from './ingestion-constants';

export interface MetricDataPoint {
  periodEndDate: string;
  value: number;
  unit: string;
  filingId: string;
  fiscalYear?: number | null;
  fiscalQuarter?: number | null;
  accountingBasis?: string;
  /** When set, indicates YTD (e.g. 9 = nine months) - computed from quarters when no 10-K for current year */
  ytdMonths?: number;
}

export interface MetricTimeSeries {
  metricType: MetricType;
  periodType: PeriodType;
  unit: string;
  data: MetricDataPoint[];
}

export interface DeltaCard {
  label: string;
  value: number;
  valueFormatted: string;
  percentage: number;
  isPositive: boolean;
}

/** Metrics that can be summed for YTD (additive); EPS and balance-sheet items are excluded */
const YTD_SUMMABLE_METRICS: MetricType[] = [
  'revenue',
  'cost_of_revenue',
  'gross_profit',
  'operating_income',
  'net_income',
  'operating_cash_flow',
];

/**
 * Income statement / cash flow metrics for which Q4 can be derived by:
 *   Q4 = Annual − (Q1 + Q2 + Q3)
 *
 * Balance-sheet (instantaneous) metrics are excluded because the annual
 * period-end value IS Q4 — there's nothing to derive.
 */
const Q4_DERIVABLE_METRICS: Set<MetricType> = new Set([
  'revenue',
  'cost_of_revenue',
  'gross_profit',
  'operating_income',
  'net_income',
  'eps_diluted',
  'eps_basic',
  'operating_cash_flow',
  'capital_expenditures',
  'free_cash_flow',
]);

interface RawMetricRow {
  period_end_date: string;
  value: number;
  unit: string;
  filing_id: string;
  fiscal_year: number | null;
  fiscal_quarter: number | null;
  accounting_basis: string | null;
  period_type: string;
  _ytdMonths?: number;
}

/**
 * Companies that file annual reports (10-K) report Q4 implicitly:
 *   Q4 = Annual − Q1 − Q2 − Q3
 * The SEC does not require a standalone Q4 10-Q, so XBRL data never
 * contains an explicit Q4 fact.  This function injects synthetic Q4
 * data points so charts show a complete quarterly history.
 */
function deriveQ4Points(
  quarterlyRows: RawMetricRow[],
  annualRows: RawMetricRow[],
  metricType: MetricType,
): RawMetricRow[] {
  if (!Q4_DERIVABLE_METRICS.has(metricType)) return [];

  // Index annual metrics by fiscal_year
  const annualByFY = new Map<number, RawMetricRow>();
  for (const a of annualRows) {
    if (a.fiscal_year != null) annualByFY.set(a.fiscal_year, a);
  }
  if (annualByFY.size === 0) return [];

  // Index quarterly metrics by fiscal_year → quarter number
  const quartersByFY = new Map<number, Map<number, RawMetricRow>>();
  for (const q of quarterlyRows) {
    if (q.fiscal_year == null || q.fiscal_quarter == null) continue;
    if (!quartersByFY.has(q.fiscal_year)) quartersByFY.set(q.fiscal_year, new Map());
    quartersByFY.get(q.fiscal_year)!.set(q.fiscal_quarter, q);
  }

  const derived: RawMetricRow[] = [];

  for (const [fy, annual] of annualByFY) {
    const quarters = quartersByFY.get(fy);
    if (!quarters) continue;

    const q1 = quarters.get(1);
    const q2 = quarters.get(2);
    const q3 = quarters.get(3);
    const q4Exists = quarters.has(4);

    // Only derive if we have exactly Q1, Q2, Q3 and Q4 is absent
    if (!q1 || !q2 || !q3 || q4Exists) continue;

    const annualVal = typeof annual.value === 'number' ? annual.value : parseFloat(String(annual.value));
    const sumQ123 =
      (typeof q1.value === 'number' ? q1.value : parseFloat(String(q1.value))) +
      (typeof q2.value === 'number' ? q2.value : parseFloat(String(q2.value))) +
      (typeof q3.value === 'number' ? q3.value : parseFloat(String(q3.value)));

    const q4Value = parseFloat((annualVal - sumQ123).toFixed(4));

    derived.push({
      period_end_date: annual.period_end_date,
      value: q4Value,
      unit: q3.unit,
      filing_id: 'q4-computed',
      fiscal_year: fy,
      fiscal_quarter: 4,
      accounting_basis: q3.accounting_basis,
      period_type: 'quarterly',
    });
  }

  return derived;
}

/**
 * Gets time-series metrics for a company, filtered by period type.
 * - Annual: ONLY 10-K/20-F data for completed years; current fiscal year YTD (9/6mo) if no 10-K yet.
 * - Quarterly: quarterly metrics only.
 */
export async function getMetricsTimeSeries(
  companyId: string,
  metricType: MetricType,
  periodType: PeriodType
): Promise<MetricTimeSeries | null> {
  const supabase = createServerClient();

  try {
    // Phase 1: Gate charts behind re-ingested data only
    const baseFilter = (q: ReturnType<typeof supabase.from>) =>
      q
        .eq('company_id', companyId)
        .eq('metric_type', metricType)
        .gte('ingested_at', FISCAL_REFACTOR_RELEASE_DATE.toISOString());

  let data: RawMetricRow[];
  let unit = 'USD';

    if (periodType === 'quarterly') {
      // CRITICAL: Quarterly = only period_type='quarterly' from any filing
      let query = baseFilter(
        supabase
          .from('financial_metrics')
          .select('period_end_date, value, unit, filing_id, fiscal_year, fiscal_quarter, accounting_basis, period_type')
          .eq('period_type', 'quarterly')
      );
      if (metricType === 'eps_basic' || metricType === 'eps_diluted') {
        query = query.eq('split_adjusted', true);
      }
      const { data: qData, error } = await query.order('period_end_date', { ascending: true });
      if (error) {
        console.error('Error fetching quarterly metrics:', error);
        return null;
      }
      if (!qData || qData.length === 0) return null;
      data = qData as RawMetricRow[];
      unit = data[0].unit;

      // Derive missing Q4 data points (Annual − Q1 − Q2 − Q3)
      // Q4 is never filed as a standalone 10-Q; it must be inferred from the 10-K annual figure.
      if (Q4_DERIVABLE_METRICS.has(metricType)) {
        let annualQuery = baseFilter(
          supabase
            .from('financial_metrics')
            .select('period_end_date, value, unit, filing_id, fiscal_year, fiscal_quarter, accounting_basis, period_type')
            .eq('period_type', 'annual')
        );
        if (metricType === 'eps_basic' || metricType === 'eps_diluted') {
          annualQuery = annualQuery.eq('split_adjusted', true);
        }
        const { data: aData } = await annualQuery.order('period_end_date', { ascending: true });
        if (aData && aData.length > 0) {
          const q4Points = deriveQ4Points(data, aData as RawMetricRow[], metricType);
          if (q4Points.length > 0) {
            data = [...data, ...q4Points];
          }
        }
      }
    } else if (periodType === 'annual') {
      // Annual: ONLY 10-K/20-F filings for completed years
      const { data: annualFilings } = await supabase
        .from('filings')
        .select('id')
        .eq('company_id', companyId)
        .in('filing_type', ['10-K', '20-F']);

      const filingIds = annualFilings?.map((f) => f.id) ?? [];
      if (filingIds.length === 0) {
        // No 10-K/20-F at all - try YTD for current year only
        data = [];
      } else {
        const query = baseFilter(
          supabase
            .from('financial_metrics')
            .select('period_end_date, value, unit, filing_id, fiscal_year, fiscal_quarter, accounting_basis, period_type')
            .eq('period_type', 'annual')
            .in('filing_id', filingIds)
        );
        const { data: aData, error } = await query.order('period_end_date', { ascending: true });
        if (error) {
          console.error('Error fetching annual metrics:', error);
          return null;
        }
        data = (aData ?? []) as RawMetricRow[];
        unit = data[0]?.unit ?? 'USD';
      }

      // Current fiscal year YTD: if no 10-K for latest FY, add 9mo or 6mo from quarters
      const canSumYTD = YTD_SUMMABLE_METRICS.includes(metricType);
      if (canSumYTD && data) {
        const annualFiscalYears = new Set((data || []).map((d) => d.fiscal_year).filter(Boolean) as number[]);
        const { data: qData } = await supabase
          .from('financial_metrics')
          .select('period_end_date, value, unit, fiscal_year, fiscal_quarter')
          .eq('company_id', companyId)
          .eq('metric_type', metricType)
          .eq('period_type', 'quarterly')
          .gte('ingested_at', FISCAL_REFACTOR_RELEASE_DATE.toISOString())
          .order('period_end_date', { ascending: true });
        const quarters = qData ?? [];
        if (quarters.length > 0) {
          const maxQtr = quarters[quarters.length - 1];
          const currentFY = maxQtr.fiscal_year ?? new Date(maxQtr.period_end_date).getFullYear();
          if (!annualFiscalYears.has(currentFY)) {
            const fyQuarters = quarters.filter((q) => (q.fiscal_year ?? new Date(q.period_end_date).getFullYear()) === currentFY);
            if (fyQuarters.length > 0) {
              const sum = fyQuarters.reduce((s, q) => s + (typeof q.value === 'number' ? q.value : parseFloat(String(q.value)) || 0), 0);
              const lastQ = fyQuarters[fyQuarters.length - 1];
              const monthsMap: Record<number, number> = { 1: 3, 2: 6, 3: 9, 4: 12 };
              const ytdMonths = monthsMap[lastQ.fiscal_quarter ?? 3] ?? 9;
              const ytdPoint = {
                period_end_date: lastQ.period_end_date,
                value: sum,
                unit: lastQ.unit ?? unit,
                filing_id: 'ytd-computed',
                fiscal_year: currentFY,
                fiscal_quarter: null,
                accounting_basis: null,
                period_type: 'annual',
                _ytdMonths: ytdMonths,
              };
              data = [...data, ytdPoint];
            }
          }
        }
      }
    } else {
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const invalidPeriodTypes = data.filter((d) => d.period_type !== periodType);
    let validData = data;
    if (invalidPeriodTypes.length > 0) {
      validData = data.filter((d) => d.period_type === periodType);
      if (validData.length === 0) return null;
    }

    // Sort by period_end_date; YTD point may be out of order
    validData = [...validData].sort((a, b) => new Date(a.period_end_date).getTime() - new Date(b.period_end_date).getTime());

    return {
      metricType,
      periodType,
      unit: validData[0].unit ?? unit,
      data: validData.map((d) => {
        const pt: MetricDataPoint = {
          periodEndDate: d.period_end_date,
          value: typeof d.value === 'number' ? d.value : parseFloat(String(d.value)),
          unit: d.unit ?? unit,
          filingId: d.filing_id,
          fiscalYear: d.fiscal_year,
          fiscalQuarter: d.fiscal_quarter,
          accountingBasis: d.accounting_basis,
        };
        const ytd = (d as { _ytdMonths?: number })._ytdMonths;
        if (ytd != null) pt.ytdMonths = ytd;
        return pt;
      }),
    };
  } catch (error) {
    console.error('Error in getMetricsTimeSeries:', error);
    return null;
  }
}

/**
 * Calculates QoQ (quarter-over-quarter) change for quarterly data
 */
export function calculateQoQChange(data: MetricDataPoint[]): DeltaCard | null {
  if (data.length < 2 || data.length < 2) {
    return null;
  }

  // Get last two quarters
  const current = data[data.length - 1];
  const previous = data[data.length - 2];

  if (!current || !previous) {
    return null;
  }

  const change = current.value - previous.value;
  const percentage = previous.value !== 0 
    ? ((change / previous.value) * 100) 
    : 0;

  return {
    label: 'QoQ Change',
    value: change,
    valueFormatted: formatValue(change, current.unit),
    percentage: Math.abs(percentage),
    isPositive: change >= 0,
  };
}

/**
 * Calculates YoY (year-over-year) change
 * For annual: compares last two annual periods
 * For quarterly: compares same quarter from previous year
 */
export function calculateYoYChange(
  data: MetricDataPoint[],
  periodType: PeriodType
): DeltaCard | null {
  if (data.length < 2) {
    return null;
  }

  let current: MetricDataPoint | undefined;
  let previous: MetricDataPoint | undefined;

  if (periodType === 'annual') {
    // Annual: compare last two years
    current = data[data.length - 1];
    previous = data[data.length - 2];
  } else {
    // Quarterly: find same quarter from previous year
    current = data[data.length - 1];
    if (!current) return null;

    const currentDate = new Date(current.periodEndDate);
    const targetYear = currentDate.getFullYear() - 1;
    const targetMonth = currentDate.getMonth();
    const targetDay = currentDate.getDate();

    // Find matching quarter from previous year
    previous = data.find(d => {
      const dDate = new Date(d.periodEndDate);
      return (
        dDate.getFullYear() === targetYear &&
        Math.abs(dDate.getMonth() - targetMonth) <= 1 &&
        Math.abs(dDate.getDate() - targetDay) <= 15
      );
    });
  }

  if (!current || !previous) {
    return null;
  }

  const change = current.value - previous.value;
  const percentage = previous.value !== 0 
    ? ((change / previous.value) * 100) 
    : 0;

  return {
    label: periodType === 'annual' ? 'YoY Change' : 'YoY Change (Same Quarter)',
    value: change,
    valueFormatted: formatValue(change, current.unit),
    percentage: Math.abs(percentage),
    isPositive: change >= 0,
  };
}

/**
 * Formats a value based on unit type
 */
function formatValue(value: number, unit: string): string {
  if (unit.includes('shares')) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
  }

  // For USD values, format in billions or millions
  const absValue = Math.abs(value);
  
  if (absValue >= 1_000_000_000) {
    const billions = value / 1_000_000_000;
    return `${billions >= 0 ? '+' : ''}${billions.toFixed(2)}B`;
  } else if (absValue >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions >= 0 ? '+' : ''}${millions.toFixed(2)}M`;
  } else {
    return `${value >= 0 ? '+' : ''}${value.toLocaleString()}`;
  }
}

/**
 * Formats a metric value for display
 */
export function formatMetricValue(value: number, unit: string): string {
  if (unit.includes('shares')) {
    return value.toFixed(2);
  }

  const absValue = Math.abs(value);
  
  if (absValue >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (absValue >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else {
    return `$${value.toLocaleString()}`;
  }
}

/**
 * Gets company info by ticker for UI
 */
export async function getCompanyByTicker(ticker: string): Promise<{ id: string; name: string; ticker: string } | null> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, ticker')
      .eq('ticker', ticker.toUpperCase())
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      ticker: data.ticker,
    };
  } catch (error) {
    console.error('Error fetching company:', error);
    return null;
  }
}
