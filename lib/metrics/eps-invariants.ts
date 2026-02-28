// EPS Invariants
// Phase 3: EPS-specific validation rules

import type { MetricType } from '../types/database';
import { EPS_MAX_QUARTERLY_VALUE, EPS_MAX_QUARTERLY_VALUE_OVERRIDE_THRESHOLD } from './ingestion-constants';

/**
 * EPS validation result
 */
export interface EPSValidationResult {
  valid: boolean;
  error?: string;
  requiresOverride?: boolean;
}

/**
 * Validates quarterly EPS value
 * Phase 3: Upper bound sanity check (default: value <= 10.0)
 * 
 * Note: XBRL data from the SEC is already split-adjusted for EPS.
 * The splitAdjusted parameter indicates whether we applied splits ourselves,
 * not whether the data is split-adjusted. If no splits were applied, we trust
 * the XBRL data is already correct.
 */
export function validateQuarterlyEPS(
  metricType: MetricType,
  value: number,
  periodType: string,
  splitAdjusted: boolean,
  overrideThreshold: number = EPS_MAX_QUARTERLY_VALUE_OVERRIDE_THRESHOLD,
  hasStockSplits: boolean = false
): EPSValidationResult {
  // Only validate EPS metrics
  if (metricType !== 'eps_basic' && metricType !== 'eps_diluted') {
    return { valid: true };
  }

  // Only validate quarterly metrics
  if (periodType !== 'quarterly') {
    return { valid: true };
  }

  // If there are stock splits that should be applied but weren't, reject
  // Otherwise, XBRL data is already split-adjusted and valid
  if (!splitAdjusted && hasStockSplits) {
    return {
      valid: false,
      error: 'Quarterly EPS must be split-adjusted before validation when stock splits exist',
    };
  }

  // Upper bound check
  if (value > EPS_MAX_QUARTERLY_VALUE) {
    // Check if value exceeds override threshold (should never happen)
    if (value > overrideThreshold) {
      return {
        valid: false,
        error: `Quarterly ${metricType} value ${value} exceeds maximum threshold ${overrideThreshold}. This indicates a data quality issue.`,
      };
    }

    // Value is above default threshold but below override threshold
    // Requires documented override and review
    return {
      valid: false,
      requiresOverride: true,
      error: `Quarterly ${metricType} value ${value} exceeds default threshold ${EPS_MAX_QUARTERLY_VALUE}. Requires documented share count anomaly and review.`,
    };
  }

  // Negative EPS is allowed (losses)
  if (value < 0) {
    return { valid: true };
  }

  // Value is within acceptable range
  return { valid: true };
}

/**
 * Validates that EPS is split-adjusted
 * Phase 3: Split enforcement
 * 
 * Note: XBRL data from the SEC is typically already split-adjusted for EPS.
 * If no splits were applied (splitAdjusted: false), we assume the XBRL data
 * is already split-adjusted and allow it. This is safe because:
 * 1. SEC XBRL EPS is always split-adjusted
 * 2. If there were splits that needed applying, applyAllSplits would have applied them
 * 
 * The splitAdjusted flag indicates whether we applied splits ourselves, not
 * whether the data is split-adjusted.
 */
export function validateEPSSplitAdjusted(
  metricType: MetricType,
  splitAdjusted: boolean,
  hasStockSplits: boolean = false
): EPSValidationResult {
  if (metricType !== 'eps_basic' && metricType !== 'eps_diluted') {
    return { valid: true };
  }

  // If there are stock splits that should be applied, but they weren't,
  // that's a problem. But if there are no splits, XBRL data is already split-adjusted.
  if (!splitAdjusted && hasStockSplits) {
    return {
      valid: false,
      error: `EPS metric ${metricType} must be split-adjusted when stock splits exist`,
    };
  }

  // XBRL data is already split-adjusted, or no splits to apply - this is valid
  return { valid: true };
}
