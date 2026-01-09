// Server actions for Metrics UI
// Read-only queries for frontend display

import { createServerClient } from '../supabase/client';
import type { MetricType, PeriodType } from '../types/database';

export interface MetricDataPoint {
  periodEndDate: string;
  value: number;
  unit: string;
  filingId: string;
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

/**
 * Gets time-series metrics for a company, filtered by period type
 */
export async function getMetricsTimeSeries(
  companyId: string,
  metricType: MetricType,
  periodType: PeriodType
): Promise<MetricTimeSeries | null> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('financial_metrics')
      .select('period_end_date, value, unit, filing_id')
      .eq('company_id', companyId)
      .eq('metric_type', metricType)
      .eq('period_type', periodType)
      .order('period_end_date', { ascending: true });

    if (error) {
      console.error('Error fetching metrics:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    // Use the unit from the first record (should be consistent)
    const unit = data[0].unit;

    return {
      metricType,
      periodType,
      unit,
      data: data.map(d => ({
        periodEndDate: d.period_end_date,
        value: typeof d.value === 'number' ? d.value : parseFloat(String(d.value)),
        unit: d.unit,
        filingId: d.filing_id,
      })),
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
