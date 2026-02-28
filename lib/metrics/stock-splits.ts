// Stock Split Normalization
// Applies stock splits at ingest time to financial metrics
// All split adjustments happen before persistence

import { getStockSplits, type StockSplitRecord } from './splits-db';

/**
 * Stock split information
 */
export interface StockSplit {
  date: Date; // Split effective date
  ratio: number; // e.g., 2.0 for 2-for-1 split, 0.5 for 1-for-2 reverse split
  description?: string; // Human-readable description
}

/**
 * Applies stock split to a metric value
 * For EPS: divide by split ratio (2-for-1 split halves EPS)
 * For shares: multiply by split ratio (2-for-1 split doubles shares)
 * For other metrics: no adjustment needed
 */
export function applyStockSplit(
  value: number,
  metricType: string,
  split: StockSplit
): number {
  // EPS metrics: divide by split ratio
  if (metricType === 'eps_basic' || metricType === 'eps_diluted') {
    return value / split.ratio;
  }

  // Shares metrics: multiply by split ratio
  if (metricType === 'shares_outstanding') {
    return value * split.ratio;
  }

  // Other metrics (revenue, income, etc.): no adjustment
  return value;
}

/**
 * Checks if a period_end_date is after a stock split date
 */
export function isAfterSplit(
  periodEndDate: Date | string,
  split: StockSplit
): boolean {
  const date = typeof periodEndDate === 'string' 
    ? new Date(periodEndDate) 
    : periodEndDate;
  
  if (isNaN(date.getTime())) {
    return false;
  }

  return date >= split.date;
}

/**
 * Gets applicable stock splits for a period
 * Returns all splits that occurred before or on the period_end_date
 */
export function getApplicableSplits(
  periodEndDate: Date | string,
  splits: StockSplit[]
): StockSplit[] {
  const date = typeof periodEndDate === 'string' 
    ? new Date(periodEndDate) 
    : periodEndDate;
  
  if (isNaN(date.getTime())) {
    return [];
  }

  return splits.filter(split => split.date <= date);
}

/**
 * Applies all applicable stock splits to a metric value
 * Splits are applied in chronological order
 */
export function applyAllSplits(
  value: number,
  metricType: string,
  periodEndDate: Date | string,
  splits: StockSplit[]
): { adjustedValue: number; splitAdjusted: boolean } {
  const applicableSplits = getApplicableSplits(periodEndDate, splits);
  
  if (applicableSplits.length === 0) {
    return { adjustedValue: value, splitAdjusted: false };
  }

  // Sort splits by date (oldest first)
  const sortedSplits = [...applicableSplits].sort((a, b) => 
    a.date.getTime() - b.date.getTime()
  );

  // Apply splits sequentially
  let adjustedValue = value;
  for (const split of sortedSplits) {
    adjustedValue = applyStockSplit(adjustedValue, metricType, split);
  }

  return { adjustedValue, splitAdjusted: true };
}

/**
 * Fetches stock splits from the database
 * Phase 4: Query stock_splits table for company splits
 * 
 * Note: Split ingestion from SEC filings (8-K/6-K) is not yet implemented.
 * For now, returns splits that have been manually inserted or ingested via external APIs.
 */
export async function fetchStockSplits(
  companyId: string,
  ticker?: string
): Promise<StockSplit[]> {
  try {
    const result = await getStockSplits(companyId);
    
    if (!result.success || !result.data) {
      return [];
    }

    // Convert database records to StockSplit format
    return result.data.map((record: StockSplitRecord) => ({
      date: new Date(record.effective_date),
      ratio: typeof record.split_ratio === 'number' 
        ? record.split_ratio 
        : parseFloat(String(record.split_ratio)),
      description: record.description || undefined,
    }));
  } catch (error) {
    console.error('Error fetching stock splits:', error);
    return [];
  }
}
