// YTD (Year-to-Date) validation utilities
// Detects if a period spans multiple fiscal quarters

import { calculateFiscalQuarter, calculateFiscalYear, type FiscalYearEnd } from './fiscal-calendar';

/**
 * Checks if a period (start date to end date) spans multiple fiscal quarters
 * 
 * Returns true if the period spans more than one fiscal quarter, false if it's a single quarter
 * Returns null if dates are invalid or fiscal year end is not provided
 */
export function spansMultipleFiscalQuarters(
  periodStartDate: string | Date | undefined,
  periodEndDate: string | Date,
  fiscalYearEnd: FiscalYearEnd | null
): boolean | null {
  if (!fiscalYearEnd) {
    return null; // Cannot determine without fiscal year end
  }

  // If no period start date, assume it's an instant period (single quarter)
  if (!periodStartDate) {
    return false;
  }

  const startDate = typeof periodStartDate === 'string' 
    ? new Date(periodStartDate) 
    : periodStartDate;
  const endDate = typeof periodEndDate === 'string' 
    ? new Date(periodEndDate) 
    : periodEndDate;

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return null; // Invalid dates
  }

  // Calculate fiscal quarters for start and end dates
  const startFiscalYear = calculateFiscalYear(startDate, fiscalYearEnd);
  const startFiscalQuarter = calculateFiscalQuarter(startDate, fiscalYearEnd);
  
  const endFiscalYear = calculateFiscalYear(endDate, fiscalYearEnd);
  const endFiscalQuarter = calculateFiscalQuarter(endDate, fiscalYearEnd);

  // If different fiscal years or different quarters, it spans multiple quarters
  if (startFiscalYear !== endFiscalYear || startFiscalQuarter !== endFiscalQuarter) {
    return true;
  }

  return false; // Same fiscal year and quarter = single quarter period
}
