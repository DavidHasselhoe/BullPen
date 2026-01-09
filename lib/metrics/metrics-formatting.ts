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
 * Gets the quarter number (1-4) from a date
 */
function getQuarterFromDate(date: Date): number {
  const month = date.getMonth(); // 0-11
  return Math.floor(month / 3) + 1;
}

/**
 * Formats a date string for chart display based on period type
 * For quarterly: "Q1 2022", "Q2 2022", etc.
 * For annual: "FY 2022" or "2022"
 */
export function formatChartDate(dateString: string, periodType?: 'annual' | 'quarterly'): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  
  if (periodType === 'quarterly') {
    const quarter = getQuarterFromDate(date);
    return `Q${quarter} ${year}`;
  } else if (periodType === 'annual') {
    return `FY ${year}`;
  }
  
  // Default: show month and year
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${month} ${year}`;
}

/**
 * Formats a period label for tooltips and detailed display
 * Shows both the date and period info (e.g., "Sep 2022 (Q3 2022)")
 */
export function formatPeriodLabel(dateString: string, periodType: 'annual' | 'quarterly'): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  
  if (periodType === 'quarterly') {
    const quarter = getQuarterFromDate(date);
    return `${month} ${year} (Q${quarter} ${year})`;
  } else {
    return `${month} ${year} (FY ${year})`;
  }
}

/**
 * Gets human-readable label for metric type
 */
export function getMetricLabel(metricType: string): string {
  const labels: Record<string, string> = {
    revenue: 'Revenue',
    net_income: 'Net Income',
    operating_income: 'Operating Income',
    eps_basic: 'EPS (Basic)',
    eps_diluted: 'EPS (Diluted)',
    operating_cash_flow: 'Operating Cash Flow',
    free_cash_flow: 'Free Cash Flow',
  };
  return labels[metricType] || metricType;
}
