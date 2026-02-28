// Metrics Validation Utilities
// Validates financial metrics according to fiscal calendar refactor requirements

import type { MetricType, PeriodType } from '../types/database';
import type { FiscalPeriod } from './fiscal-calendar';
import { EPS_MAX_QUARTERLY_VALUE } from './ingestion-constants';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that quarterly metrics have fiscal_quarter
 */
export function validateFiscalQuarter(
  periodType: PeriodType,
  fiscalQuarter: number | null
): ValidationResult {
  if (periodType === 'quarterly' && fiscalQuarter === null) {
    return {
      valid: false,
      error: 'Quarterly metrics must have fiscal_quarter',
    };
  }

  if (periodType !== 'quarterly' && fiscalQuarter !== null) {
    return {
      valid: false,
      error: 'Non-quarterly metrics must have fiscal_quarter = NULL',
    };
  }

  if (fiscalQuarter !== null && (fiscalQuarter < 1 || fiscalQuarter > 4)) {
    return {
      valid: false,
      error: `fiscal_quarter must be 1-4, got ${fiscalQuarter}`,
    };
  }

  return { valid: true };
}

/**
 * Validates EPS values
 * Rejects quarterly EPS > threshold (default 10.0 from EPS_MAX_QUARTERLY_VALUE) post-split
 * Note: This validation is now handled by validateQuarterlyEPS in eps-invariants.ts
 * This function is kept for backwards compatibility but should be phased out
 */
export function validateEPSValue(
  metricType: MetricType,
  value: number,
  periodType: PeriodType,
  splitAdjusted: boolean,
  threshold: number = EPS_MAX_QUARTERLY_VALUE // Use constant instead of hardcoded 2.0
): ValidationResult {
  if (metricType !== 'eps_basic' && metricType !== 'eps_diluted') {
    return { valid: true }; // Not an EPS metric
  }

  // Only validate quarterly EPS - this is a legacy check
  // The real validation is in validateQuarterlyEPS in eps-invariants.ts
  // This check is now more permissive to allow high quarterly EPS values (e.g., NVIDIA 3.16)
  if (periodType === 'quarterly' && splitAdjusted && value > threshold) {
    return {
      valid: false,
      error: `Quarterly ${metricType} value ${value} exceeds threshold ${threshold} (post-split adjusted). This may indicate a data quality issue.`,
    };
  }

  return { valid: true };
}

/**
 * Validates that fiscal_year is present
 */
export function validateFiscalYear(fiscalYear: number | null): ValidationResult {
  if (fiscalYear === null) {
    return {
      valid: false,
      error: 'fiscal_year is required for all metrics',
    };
  }

  if (fiscalYear < 1900 || fiscalYear > 2100) {
    return {
      valid: false,
      error: `fiscal_year ${fiscalYear} is outside valid range (1900-2100)`,
    };
  }

  return { valid: true };
}

/**
 * Validates that period_end_date is present
 */
export function validatePeriodEndDate(periodEndDate: string | null): ValidationResult {
  if (!periodEndDate) {
    return {
      valid: false,
      error: 'period_end_date is required for all metrics',
    };
  }

  const date = new Date(periodEndDate);
  if (isNaN(date.getTime())) {
    return {
      valid: false,
      error: `Invalid period_end_date: ${periodEndDate}`,
    };
  }

  return { valid: true };
}

/**
 * Validates that metric_type is explicit
 */
export function validateMetricType(metricType: MetricType): ValidationResult {
  if (!metricType || metricType === 'other') {
    return {
      valid: false,
      error: 'metric_type must be explicit (cannot be "other" or empty)',
    };
  }

  return { valid: true };
}

/**
 * Validates accounting basis consistency
 * Charts must not mix different accounting_basis values
 */
export function validateAccountingBasisConsistency(
  accountingBasis: string,
  existingBasis: string | null
): ValidationResult {
  if (existingBasis !== null && accountingBasis !== existingBasis) {
    return {
      valid: false,
      error: `Cannot mix accounting_basis: existing ${existingBasis}, new ${accountingBasis}`,
    };
  }

  const validBasis = ['gaap', 'non-gaap', 'ifrs'];
  if (!validBasis.includes(accountingBasis)) {
    return {
      valid: false,
      error: `Invalid accounting_basis: ${accountingBasis}. Must be one of: ${validBasis.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validates that period_type is explicit
 */
export function validatePeriodType(periodType: PeriodType): ValidationResult {
  const validTypes: PeriodType[] = ['annual', 'quarterly', 'ttm', 'ytd'];
  if (!validTypes.includes(periodType)) {
    return {
      valid: false,
      error: `Invalid period_type: ${periodType}. Must be one of: ${validTypes.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Comprehensive validation for a financial metric
 */
export function validateFinancialMetric(params: {
  metricType: MetricType;
  value: number;
  periodType: PeriodType;
  periodEndDate: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  splitAdjusted: boolean;
  accountingBasis: string;
}): ValidationResult {
  // Validate required fields
  const periodEndDateResult = validatePeriodEndDate(params.periodEndDate);
  if (!periodEndDateResult.valid) return periodEndDateResult;

  const fiscalYearResult = validateFiscalYear(params.fiscalYear);
  if (!fiscalYearResult.valid) return fiscalYearResult;

  const fiscalQuarterResult = validateFiscalQuarter(params.periodType, params.fiscalQuarter);
  if (!fiscalQuarterResult.valid) return fiscalQuarterResult;

  const metricTypeResult = validateMetricType(params.metricType);
  if (!metricTypeResult.valid) return metricTypeResult;

  const periodTypeResult = validatePeriodType(params.periodType);
  if (!periodTypeResult.valid) return periodTypeResult;

  const accountingBasisResult = validateAccountingBasisConsistency(params.accountingBasis, null);
  if (!accountingBasisResult.valid) return accountingBasisResult;

  // Validate EPS values
  const epsResult = validateEPSValue(
    params.metricType,
    params.value,
    params.periodType,
    params.splitAdjusted
  );
  if (!epsResult.valid) return epsResult;

  return { valid: true };
}
