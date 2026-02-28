// Period Classification Utilities
// Explicitly classifies financial periods as Q/YTD/TTM/FY
// This prevents misclassification of YTD/TTM values as quarterly

import { spansMultipleFiscalQuarters, type FiscalYearEnd } from './ytd-validation';
import type { PeriodScope } from './xbrl-fetcher';

/**
 * Detects period scope from XBRL fp field and frame context
 * 
 * Rules:
 * - fp = 'Q1' | 'Q2' | 'Q3' | 'Q4' → Q (single quarter)
 * - fp = 'FY' → FY (full fiscal year)
 * - frame includes "NineMonths" | "Nine Months" | "YTD" → YTD
 * - frame includes "TwelveMonths" | "TTM" | "Trailing" → TTM
 * - periodLengthMonths = 3 → Q
 * - periodLengthMonths = 9 → YTD
 * - periodLengthMonths = 12 → FY or TTM (check fp)
 * 
 * If periodStart exists, check if it spans multiple fiscal quarters
 */
export function detectPeriodScope(
  fp: string | undefined,
  frame: string | undefined,
  periodStart: string | undefined,
  periodEnd: string,
  fiscalYearEnd: FiscalYearEnd | null
): PeriodScope {
  const fpUpper = (fp || '').toUpperCase().trim();
  const frameUpper = (frame || '').toUpperCase();

  // Priority 1: XBRL fp field is authoritative
  if (fpUpper === 'FY') {
    return 'FY'; // Full fiscal year
  }
  
  if (fpUpper === 'Q1' || fpUpper === 'Q2' || fpUpper === 'Q3' || fpUpper === 'Q4') {
    // Check if frame indicates YTD/Nine Months
    if (frameUpper.includes('NINEMONTHS') || 
        frameUpper.includes('NINE MONTHS') ||
        frameUpper.includes('YTD') ||
        frameUpper.includes('YEAR-TO-DATE')) {
      return 'YTD'; // Nine months ended (YTD)
    }
    
    // If periodStart exists, verify it's actually a single quarter
    if (periodStart && fiscalYearEnd) {
      const spansMultiple = spansMultipleFiscalQuarters(periodStart, periodEnd, fiscalYearEnd);
      if (spansMultiple === true) {
        // fp says Q but spans multiple quarters → YTD
        return 'YTD';
      }
    }
    
    return 'Q'; // Single fiscal quarter
  }

  // Priority 2: Frame context detection
  if (frameUpper.includes('NINEMONTHS') || 
      frameUpper.includes('NINE MONTHS') ||
      frameUpper.includes('YTD') ||
      frameUpper.includes('YEAR-TO-DATE')) {
    return 'YTD'; // Year-to-date / Nine months
  }

  if (frameUpper.includes('TWELVEMONTHS') || 
      frameUpper.includes('TWELVE MONTHS') ||
      frameUpper.includes('TTM') ||
      frameUpper.includes('TRAILING')) {
    return 'TTM'; // Trailing twelve months
  }

  // Priority 3: Calculate period length from dates
  if (periodStart && periodEnd) {
    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);
    
    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      const diffTime = endDate.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffMonths = diffDays / 30.44; // Average days per month

      // Check if spans multiple fiscal quarters
      if (fiscalYearEnd) {
        const spansMultiple = spansMultipleFiscalQuarters(periodStart, periodEnd, fiscalYearEnd);
        if (spansMultiple === true) {
          // Spans multiple quarters
          if (diffMonths >= 11 && diffMonths <= 13) {
            return fpUpper === 'FY' ? 'FY' : 'TTM'; // Full year or TTM
          } else if (diffMonths >= 8 && diffMonths <= 10) {
            return 'YTD'; // Nine months (YTD)
          }
          // Otherwise, treat as YTD if spans multiple quarters
          return 'YTD';
        } else if (spansMultiple === false) {
          // Single quarter confirmed
          return 'Q';
        }
      }

      // Fallback: approximate by month count
      if (diffMonths >= 11 && diffMonths <= 13) {
        return fpUpper === 'FY' ? 'FY' : 'TTM';
      } else if (diffMonths >= 8 && diffMonths <= 10) {
        return 'YTD';
      } else if (diffMonths >= 2.5 && diffMonths <= 3.5) {
        return 'Q';
      }
    }
  }

  // Default: If no start date, assume single quarter (Q)
  if (!periodStart) {
    return 'Q';
  }

  // Fallback: unknown, default to Q (most conservative)
  return 'Q';
}

/**
 * Maps period scope to database period_type
 * Q → quarterly
 * YTD → ytd
 * TTM → ttm
 * FY → annual
 */
export function scopeToPeriodType(scope: PeriodScope): 'annual' | 'quarterly' | 'ttm' | 'ytd' {
  switch (scope) {
    case 'Q':
      return 'quarterly';
    case 'YTD':
      return 'ytd';
    case 'TTM':
      return 'ttm';
    case 'FY':
      return 'annual';
    default:
      return 'quarterly'; // Fallback to quarterly (most conservative)
  }
}

/**
 * Calculates period length in months from start and end dates
 */
export function calculatePeriodLengthMonths(
  periodStart: string | undefined,
  periodEnd: string
): number | undefined {
  if (!periodStart) {
    return undefined;
  }

  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return undefined;
  }

  const diffTime = endDate.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffMonths = diffDays / 30.44; // Average days per month

  return Math.round(diffMonths * 10) / 10; // Round to 1 decimal place
}
