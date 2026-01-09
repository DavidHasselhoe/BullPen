// Trends Database Operations
// CRUD operations for trend analysis results

import { createServerClient } from '../supabase/client';
import type { Trend, InsertTrend } from '../types/database';
import type { TrendResult } from './trend-detector';

export interface TrendDBResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Creates or updates a trend record in the database
 * Uses ON CONFLICT to update existing trends
 */
export async function upsertTrend(trend: TrendResult): Promise<TrendDBResult<Trend>> {
  const supabase = createServerClient();

  try {
    const trendData: InsertTrend = {
      company_id: trend.company_id,
      metric_type: trend.metric_type,
      period_type: trend.period_type,
      trend_type: trend.trend_type,
      direction: trend.direction,
      strength: trend.strength,
      explanation: trend.explanation,
      periods_analyzed: trend.periods_analyzed,
      metadata: trend.metadata,
    };

    const { data, error } = await supabase
      .from('trends')
      .upsert(trendData, {
        onConflict: 'company_id,metric_type,trend_type,period_type',
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Trend };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Creates multiple trends in bulk
 */
export async function upsertTrends(trends: TrendResult[]): Promise<TrendDBResult<Trend[]>> {
  const supabase = createServerClient();

  try {
    const trendsData: InsertTrend[] = trends.map((trend) => ({
      company_id: trend.company_id,
      metric_type: trend.metric_type,
      period_type: trend.period_type,
      trend_type: trend.trend_type,
      direction: trend.direction,
      strength: trend.strength,
      explanation: trend.explanation,
      periods_analyzed: trend.periods_analyzed,
      metadata: trend.metadata,
    }));

    // Deduplicate trends array to avoid "cannot affect row a second time" error
    const uniqueTrends = new Map<string, InsertTrend>();
    trendsData.forEach((trend) => {
      const key = `${trend.company_id}_${trend.metric_type}_${trend.trend_type}_${trend.period_type}`;
      // Keep the last occurrence if duplicates exist
      uniqueTrends.set(key, trend);
    });

    const { data, error } = await supabase
      .from('trends')
      .upsert(Array.from(uniqueTrends.values()), {
        onConflict: 'company_id,metric_type,trend_type,period_type',
      })
      .select();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []) as Trend[] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets all trends for a company
 */
export async function getCompanyTrends(companyId: string): Promise<TrendDBResult<Trend[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('trends')
      .select('*')
      .eq('company_id', companyId)
      .order('strength', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []) as Trend[] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets trends for a specific company and metric
 */
export async function getCompanyMetricTrends(
  companyId: string,
  metricType: string
): Promise<TrendDBResult<Trend[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('trends')
      .select('*')
      .eq('company_id', companyId)
      .eq('metric_type', metricType)
      .order('strength', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []) as Trend[] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Deletes all trends for a company
 */
export async function deleteCompanyTrends(companyId: string): Promise<TrendDBResult<void>> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase.from('trends').delete().eq('company_id', companyId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
