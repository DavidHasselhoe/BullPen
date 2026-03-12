// Database Operations for Financial Metrics
// Stores XBRL-extracted financial metrics

import { createServerClient } from '../supabase/client';
import type { FinancialMetric, InsertFinancialMetric, MetricType, PeriodType } from '../types/database';

/**
 * Result of metric database operations
 */
export interface MetricDBResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Creates a financial metric record
 */
export async function createFinancialMetric(params: {
  filingId: string;
  companyId: string;
  metricType: MetricType;
  value: number;
  unit: string;
  periodType: PeriodType;
  periodStartDate?: string;
  periodEndDate: string;
  fiscalYear: number;
  fiscalQuarter: number | null;
  accountingBasis?: string;
  currency?: string;
  splitAdjusted?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<MetricDBResult<FinancialMetric>> {
  const supabase = createServerClient();

  try {
    // Check if metric already exists (idempotent)
    const { data: existing, error: existingError } = await supabase
      .from('financial_metrics')
      .select('id')
      .eq('filing_id', params.filingId)
      .eq('metric_type', params.metricType)
      .eq('period_end_date', params.periodEndDate)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      return { success: false, error: existingError.message };
    }

    if (existing) {
      
      // Update existing metric
      const { data, error } = await supabase
        .from('financial_metrics')
        .update({
          value: params.value,
          unit: params.unit,
          period_type: params.periodType,
          period_start_date: params.periodStartDate || null,
          fiscal_year: params.fiscalYear,
          fiscal_quarter: params.fiscalQuarter,
          accounting_basis: params.accountingBasis || 'gaap',
          currency: params.currency || 'USD',
          split_adjusted: params.splitAdjusted || false,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    }

    // Create new metric
    const metricData: InsertFinancialMetric = {
      filing_id: params.filingId,
      company_id: params.companyId,
      metric_type: params.metricType,
      value: params.value,
      unit: params.unit,
      period_type: params.periodType,
      period_start_date: params.periodStartDate || null,
      period_end_date: params.periodEndDate,
      fiscal_year: params.fiscalYear,
      fiscal_quarter: params.fiscalQuarter,
      accounting_basis: params.accountingBasis || 'gaap',
      currency: params.currency || 'USD',
      split_adjusted: params.splitAdjusted || false,
      is_restated: false,
      metadata: params.metadata || {},
    };

    const { data, error } = await supabase
      .from('financial_metrics')
      .insert(metricData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Creates multiple financial metrics in bulk
 */
export async function createFinancialMetrics(
  metrics: Array<{
    filingId: string;
    companyId: string;
    metricType: MetricType;
    value: number;
    unit: string;
    periodType: PeriodType;
    periodStartDate?: string;
    periodEndDate: string;
    fiscalYear: number;
    fiscalQuarter: number | null;
    accountingBasis?: string;
    currency?: string;
    splitAdjusted?: boolean;
    metadata?: Record<string, unknown>;
  }>
): Promise<MetricDBResult<FinancialMetric[]>> {
  const results: FinancialMetric[] = [];
  const errors: string[] = [];

  // Process one at a time to handle idempotency
  for (const metric of metrics) {
    const result = await createFinancialMetric(metric);
    if (result.success && result.data) {
      results.push(result.data);
    } else {
      errors.push(`${metric.metricType}: ${result.error}`);
    }
  }

  if (errors.length > 0 && results.length === 0) {
    return { success: false, error: errors.join('; ') };
  }

  return { success: true, data: results };
}

/**
 * Gets metrics for a filing
 */
export async function getFilingMetrics(
  filingId: string
): Promise<MetricDBResult<FinancialMetric[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('financial_metrics')
      .select('*')
      .eq('filing_id', filingId)
      .order('metric_type', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets time-series metrics for a company
 */
export async function getCompanyMetrics(
  companyId: string,
  metricType: MetricType,
  limit: number = 20
): Promise<MetricDBResult<FinancialMetric[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('financial_metrics')
      .select('*')
      .eq('company_id', companyId)
      .eq('metric_type', metricType)
      .order('period_end_date', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Enforces history policy: keeps last N filings of each type
 */
export async function enforceHistoryPolicy(
  companyId: string,
  filingType: '10-K' | '10-Q'
): Promise<MetricDBResult<void>> {
  const supabase = createServerClient();

  try {
    const limit = filingType === '10-K' ? 5 : 12;

    // Get filings of this type with metrics, ordered by date
    const { data: filings, error: filingsError } = await supabase
      .from('filings')
      .select('id, filing_date')
      .eq('company_id', companyId)
      .eq('filing_type', filingType)
      .order('filing_date', { ascending: false });

    if (filingsError) {
      return { success: false, error: filingsError.message };
    }

    if (!filings || filings.length <= limit) {
      return { success: true }; // No cleanup needed
    }

    // Get filing IDs to keep (most recent N)
    const keepIds = filings.slice(0, limit).map(f => f.id);
    const deleteIds = filings.slice(limit).map(f => f.id);

    if (deleteIds.length === 0) {
      return { success: true }; // Nothing to delete
    }

    // Delete metrics for filings beyond the limit
    const { error: deleteError } = await supabase
      .from('financial_metrics')
      .delete()
      .eq('company_id', companyId)
      .in('filing_id', deleteIds);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
