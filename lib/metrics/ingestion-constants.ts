// Ingestion Constants
// Constants for gating charts and validating re-ingested data

/**
 * Fiscal refactor release date
 * Metrics ingested before this date are considered legacy and excluded from charts
 */
export const FISCAL_REFACTOR_RELEASE_DATE = new Date('2025-01-15T00:00:00Z');

/**
 * EPS validation constants
 * 
 * Note: Quarterly EPS can legitimately be higher than 1.25 for companies with high profitability.
 * Examples: NVIDIA (3.16), Apple (2.73). These values are already post-split adjusted.
 * The threshold is set to catch data quality issues (e.g., missing split adjustment), not to limit valid EPS values.
 */
export const EPS_MAX_QUARTERLY_VALUE = 10.0; // Upper bound for quarterly EPS (post-split) - increased to accommodate high-valuation tech companies
export const EPS_MAX_QUARTERLY_VALUE_OVERRIDE_THRESHOLD = 20.0; // Maximum allowed even with override - should catch data quality issues

/**
 * Checks if a metric was ingested after the fiscal refactor release
 */
export function isReIngestedMetric(ingestedAt: Date | string | null): boolean {
  if (!ingestedAt) return false;
  
  const date = typeof ingestedAt === 'string' ? new Date(ingestedAt) : ingestedAt;
  return date >= FISCAL_REFACTOR_RELEASE_DATE;
}
