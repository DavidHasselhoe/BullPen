// Client-safe formatting utilities for metrics
// These functions don't require server-side dependencies

/**
 * Formats a metric value for display
 * Safe to use in client components
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
 * Formats a date string for chart display using fiscal periods
 * For quarterly: "Q{fiscal_quarter} FY{fiscal_year}" (e.g., "Q1 FY2025")
 * For annual: "FY{fiscal_year}" (e.g., "FY2025") or "FY2025 (9mo)" when YTD
 * 
 * NEVER uses calendar months or calendar quarters
 */
export function formatChartDate(
  dateString: string,
  periodType?: 'annual' | 'quarterly',
  fiscalYear?: number | null,
  fiscalQuarter?: number | null,
  ytdMonths?: number
): string {
  // If fiscal period is provided, use it (authoritative)
  if (fiscalYear !== null && fiscalYear !== undefined) {
    if (periodType === 'quarterly' && fiscalQuarter !== null && fiscalQuarter !== undefined) {
      return `Q${fiscalQuarter} FY${fiscalYear}`;
    }
    if (ytdMonths != null) {
      return `FY${fiscalYear} (${ytdMonths}mo)`;
    }
    return `FY${fiscalYear}`;
  }

  // Fallback: use date (for existing data that hasn't been backfilled yet)
  const date = new Date(dateString);
  const year = date.getFullYear();
  
  if (periodType === 'quarterly') {
    // For quarterly data without fiscal quarter, show just the year
    // This happens for existing data that hasn't been backfilled yet
    return `FY${year}`;
  } else if (periodType === 'annual') {
    return `FY${year}`;
  }
  
  // Default: show month and year (only for non-period data)
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${month} ${year}`;
}

/**
 * Formats a period label for tooltips and detailed display
 * Uses fiscal periods: "Q{fiscal_quarter} FY{fiscal_year}" or "FY{fiscal_year}" or "FY2025 (9mo)" for YTD
 * 
 * NEVER shows calendar months unless explicitly requested
 */
export function formatPeriodLabel(
  dateString: string,
  periodType: 'annual' | 'quarterly',
  fiscalYear?: number | null,
  fiscalQuarter?: number | null,
  ytdMonths?: number
): string {
  // If fiscal period is provided, use it (authoritative)
  if (fiscalYear !== null && fiscalYear !== undefined) {
    if (periodType === 'quarterly' && fiscalQuarter !== null && fiscalQuarter !== undefined) {
      return `Q${fiscalQuarter} FY${fiscalYear}`;
    }
    if (ytdMonths != null) {
      return `FY${fiscalYear} (${ytdMonths} months YTD)`;
    }
    return `FY${fiscalYear}`;
  }

  // Fallback: use date (for existing data that hasn't been backfilled yet)
  const date = new Date(dateString);
  const year = date.getFullYear();
  
  if (periodType === 'quarterly') {
    // For quarterly data without fiscal quarter, show just the year
    // This happens for existing data that hasn't been backfilled yet
    return `FY${year}`;
  } else {
    return `FY${year}`;
  }
}

/**
 * Gets human-readable label for metric type
 */
export function getMetricLabel(metricType: string): string {
  const labels: Record<string, string> = {
    revenue: 'Revenue',
    cost_of_revenue: 'Cost of Revenue',
    gross_profit: 'Gross Profit',
    net_income: 'Net Income',
    operating_income: 'Operating Income',
    eps_basic: 'EPS (Basic)',
    eps_diluted: 'EPS (Diluted)',
    operating_cash_flow: 'Operating Cash Flow',
    free_cash_flow: 'Free Cash Flow',
  };
  return labels[metricType] || metricType;
}
