// Fiscal Calendar Utilities
// Handles fiscal year end extraction and fiscal quarter calculation
// Eliminates all calendar-based inference

/**
 * Fiscal year end information
 */
export interface FiscalYearEnd {
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * Fiscal period information
 */
export interface FiscalPeriod {
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4 | null; // null for annual/TTM
}

/**
 * Extracts fiscal year end from SEC filing content
 * Looks in cover page, filing header, and metadata
 * 
 * Priority:
 * 1. Cover page "Fiscal Year End" field
 * 2. Filing header metadata
 * 3. XBRL taxonomy fiscal year end
 */
export function extractFiscalYearEndFromFiling(
  filingContent: string
): FiscalYearEnd | null {
  // Pattern 1: Cover page "Fiscal Year End" field
  // Format: "FISCAL YEAR END: 1231" or "FISCAL YEAR END: 12-31"
  const coverPagePattern = /FISCAL\s+YEAR\s+END[:\s]+(\d{1,2})[-\s]?(\d{1,2})/i;
  const coverPageMatch = filingContent.match(coverPagePattern);
  if (coverPageMatch) {
    const month = parseInt(coverPageMatch[1], 10);
    const day = parseInt(coverPageMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day };
    }
  }

  // Pattern 2: "Fiscal Year End" in header metadata
  // Format: "FISCAL YEAR END DATE: 12/31" or "FYE: 12-31"
  const headerPatterns = [
    /FISCAL\s+YEAR\s+END\s+DATE[:\s]+(\d{1,2})[\/\-](\d{1,2})/i,
    /FYE[:\s]+(\d{1,2})[\/\-](\d{1,2})/i,
    /FISCAL\s+PERIOD\s+END[:\s]+(\d{1,2})[\/\-](\d{1,2})/i,
  ];

  for (const pattern of headerPatterns) {
    const match = filingContent.match(pattern);
    if (match) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { month, day };
      }
    }
  }

  // Pattern 3: XBRL context fiscal year end
  // Look for fiscal year end in XBRL contexts
  const xbrlPattern = /<xbrli:periodEndDate[^>]*>(\d{4})-(\d{2})-(\d{2})/i;
  const xbrlMatch = filingContent.match(xbrlPattern);
  if (xbrlMatch) {
    // This is a period end date, not fiscal year end, but we can infer
    // if we see consistent patterns
    // For now, return null and let company-level fiscal year end be used
  }

  return null;
}

/**
 * Calculates fiscal quarter from period_end_date and fiscal year end
 * 
 * Formula:
 * fiscal_quarter = floor(months_between(period_end_date, fiscal_year_end_date) / 3) + 1
 * 
 * Never uses calendar months or calendar quarters
 */
export function calculateFiscalQuarter(
  periodEndDate: Date,
  fiscalYearEnd: FiscalYearEnd
): 1 | 2 | 3 | 4 {
  const periodYear = periodEndDate.getFullYear();
  const periodMonth = periodEndDate.getMonth() + 1; // 1-12
  const periodDay = periodEndDate.getDate();

  // Calculate fiscal year for this period
  // If period_end_date is before fiscal year end, it belongs to previous fiscal year
  const fiscalYear = (periodMonth < fiscalYearEnd.month || 
    (periodMonth === fiscalYearEnd.month && periodDay <= fiscalYearEnd.day))
    ? periodYear - 1
    : periodYear;

  // Calculate fiscal year end date for this fiscal year
  const fiscalYearEndDate = new Date(fiscalYear, fiscalYearEnd.month - 1, fiscalYearEnd.day);

  // Calculate months between period_end_date and fiscal_year_end_date
  // Fiscal year starts the day after fiscal year end
  const fiscalYearStart = new Date(fiscalYear, fiscalYearEnd.month - 1, fiscalYearEnd.day);
  fiscalYearStart.setDate(fiscalYearStart.getDate() + 1); // Start of fiscal year
  
  // Calculate months from fiscal year start
  let monthsDiff: number;
  
  if (periodEndDate < fiscalYearStart) {
    // Period is before this fiscal year start, use previous fiscal year
    const prevFiscalYear = fiscalYear - 1;
    const prevFiscalYearStart = new Date(prevFiscalYear, fiscalYearEnd.month - 1, fiscalYearEnd.day);
    prevFiscalYearStart.setDate(prevFiscalYearStart.getDate() + 1);
    
    monthsDiff = (periodEndDate.getFullYear() - prevFiscalYearStart.getFullYear()) * 12 +
      (periodEndDate.getMonth() - prevFiscalYearStart.getMonth());
  } else {
    // Period is in this fiscal year
    monthsDiff = (periodEndDate.getFullYear() - fiscalYearStart.getFullYear()) * 12 +
      (periodEndDate.getMonth() - fiscalYearStart.getMonth());
  }

  // Calculate quarter: floor(months / 3) + 1
  // Quarters: 0-2 months = Q1, 3-5 months = Q2, 6-8 months = Q3, 9-11 months = Q4
  const quarter = Math.floor(monthsDiff / 3) + 1;

  // Ensure quarter is 1-4
  if (quarter < 1) return 1;
  if (quarter > 4) return 4;
  
  return quarter as 1 | 2 | 3 | 4;
}

/**
 * Calculates fiscal year from period_end_date and fiscal year end
 */
export function calculateFiscalYear(
  periodEndDate: Date,
  fiscalYearEnd: FiscalYearEnd
): number {
  const periodYear = periodEndDate.getFullYear();
  const periodMonth = periodEndDate.getMonth() + 1; // 1-12
  const periodDay = periodEndDate.getDate();

  // If period_end_date is before fiscal year end, it belongs to previous fiscal year
  if (periodMonth < fiscalYearEnd.month || 
    (periodMonth === fiscalYearEnd.month && periodDay <= fiscalYearEnd.day)) {
    return periodYear - 1;
  }
  
  return periodYear;
}

/**
 * Gets fiscal period (year and quarter) from period_end_date and fiscal year end
 */
export function getFiscalPeriod(
  periodEndDate: Date | string,
  fiscalYearEnd: FiscalYearEnd | null,
  periodType: 'annual' | 'quarterly' | 'ttm' | 'ytd'
): FiscalPeriod | null {
  if (!fiscalYearEnd) {
    return null; // Cannot calculate without fiscal year end
  }

  const date = typeof periodEndDate === 'string' 
    ? new Date(periodEndDate) 
    : periodEndDate;

  if (isNaN(date.getTime())) {
    return null; // Invalid date
  }

  const fiscalYear = calculateFiscalYear(date, fiscalYearEnd);
  const fiscalQuarter = (periodType === 'quarterly') 
    ? calculateFiscalQuarter(date, fiscalYearEnd)
    : null;

  return {
    fiscalYear,
    fiscalQuarter,
  };
}

/**
 * Formats fiscal period for display
 * Format: "Q{fiscal_quarter} FY{fiscal_year}" for quarterly
 * Format: "FY{fiscal_year}" for annual
 */
export function formatFiscalPeriod(
  fiscalPeriod: FiscalPeriod
): string {
  if (fiscalPeriod.fiscalQuarter !== null) {
    return `Q${fiscalPeriod.fiscalQuarter} FY${fiscalPeriod.fiscalYear}`;
  }
  return `FY${fiscalPeriod.fiscalYear}`;
}

/**
 * Parses fiscal year end from MM-DD string format
 */
export function parseFiscalYearEnd(fye: string | null): FiscalYearEnd | null {
  if (!fye) return null;

  // Format: "12-31" or "1231"
  const cleaned = fye.replace(/[^\d]/g, '');
  if (cleaned.length === 4) {
    const month = parseInt(cleaned.substring(0, 2), 10);
    const day = parseInt(cleaned.substring(2, 4), 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day };
    }
  }

  return null;
}

/**
 * Formats fiscal year end to MM-DD string
 */
export function formatFiscalYearEnd(fye: FiscalYearEnd | null): string | null {
  if (!fye) return null;
  return `${fye.month.toString().padStart(2, '0')}-${fye.day.toString().padStart(2, '0')}`;
}
