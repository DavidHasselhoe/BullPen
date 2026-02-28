// SEC XBRL Data Fetcher
// Fetches structured financial data from SEC XBRL JSON endpoints

import { detectPeriodScope, scopeToPeriodType, calculatePeriodLengthMonths } from './period-classification';
import type { FiscalYearEnd } from './fiscal-calendar';

/**
 * SEC XBRL concept to BullPen metric mapping
 * Maps SEC standard concept names to our metric types
 */
export const XBRL_CONCEPT_MAP: Record<string, {
  metricType: string;
  priority: number; // Lower = higher priority if multiple concepts match
}> = {
  // Revenue (prioritized order per requirements)
  'RevenueFromContractWithCustomerExcludingAssessedTax': { metricType: 'revenue', priority: 1 },
  'Revenues': { metricType: 'revenue', priority: 2 },
  'SalesRevenueNet': { metricType: 'revenue', priority: 3 },
  
  // Net Income
  'NetIncomeLoss': { metricType: 'net_income', priority: 1 },
  'ProfitLoss': { metricType: 'net_income', priority: 2 },
  'IncomeLossFromContinuingOperationsAfterTax': { metricType: 'net_income', priority: 3 },
  
  // Operating Income
  'OperatingIncomeLoss': { metricType: 'operating_income', priority: 1 },
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest': { metricType: 'operating_income', priority: 2 },
  
  // EPS Basic
  'EarningsPerShareBasic': { metricType: 'eps_basic', priority: 1 },
  'IncomeLossFromContinuingOperationsPerBasicShare': { metricType: 'eps_basic', priority: 2 },
  
  // EPS Diluted
  'EarningsPerShareDiluted': { metricType: 'eps_diluted', priority: 1 },
  'IncomeLossFromContinuingOperationsPerDilutedShare': { metricType: 'eps_diluted', priority: 2 },
  
  // Operating Cash Flow
  'NetCashProvidedByUsedInOperatingActivities': { metricType: 'operating_cash_flow', priority: 1 },
  
  // Capital Expenditures
  'PaymentsToAcquirePropertyPlantAndEquipment': { metricType: 'capital_expenditures', priority: 1 },
  'CapitalExpenditures': { metricType: 'capital_expenditures', priority: 2 },
  'PaymentsForPropertyPlantAndEquipment': { metricType: 'capital_expenditures', priority: 3 },
  
  // Free Cash Flow
  'FreeCashFlow': { metricType: 'free_cash_flow', priority: 1 },
};

/**
 * Reverse mapping: BullPen metric type to SEC concepts (in priority order)
 * Updated per requirements: RevenueFromContractWithCustomerExcludingAssessedTax first
 */
export const METRIC_TO_CONCEPTS: Record<string, string[]> = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  net_income: ['NetIncomeLoss', 'ProfitLoss'],
  operating_income: ['OperatingIncomeLoss'],
  eps_basic: ['EarningsPerShareBasic'],
  eps_diluted: ['EarningsPerShareDiluted'],
  operating_cash_flow: ['NetCashProvidedByUsedInOperatingActivities'],
  capital_expenditures: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'CapitalExpenditures',
    'PaymentsForPropertyPlantAndEquipment',
    'PurchasesOfPropertyPlantAndEquipment',
    'PaymentsToAcquireAssets',
  ],
  free_cash_flow: ['FreeCashFlow'], // Will be calculated if not available
};

/**
 * SEC Company Concept API response structure
 */
export interface SECConceptData {
  cik: string;
  taxonomy: string;
  tag: string;
  label: string;
  description: string;
  units: Record<string, Array<{
    val: number | string;
    end?: string;
    instant?: string;
    accn?: string;
    fy?: string;
    fp?: string;
    form?: string;
    filed?: string;
    frame?: string;
  }>>;
}

/**
 * Explicit period classification for financial metrics
 * Q = Single fiscal quarter (3 months)
 * YTD = Year-to-date (cumulative)
 * TTM = Trailing twelve months
 * FY = Full fiscal year
 */
export type PeriodScope = 'Q' | 'YTD' | 'TTM' | 'FY';

/**
 * Extracted metric value with period information
 */
export interface ExtractedMetric {
  value: number;
  unit: string;
  periodEnd: string;
  periodStart?: string; // Period start date (for range periods)
  periodType: 'annual' | 'quarterly' | 'ttm' | 'ytd'; // Database period_type
  periodScope: PeriodScope; // Explicit period scope (Q/YTD/TTM/FY)
  fiscalYear?: number;
  fiscalQuarter?: number | null;
  periodLengthMonths?: number; // Period length in months (3, 9, 12, etc.)
  filingForm: string;
  accessionNumber?: string;
}

/**
 * Rate limiting delay for SEC API
 */
async function rateLimitDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms = 10 req/sec
}

/**
 * Fetches XBRL data directly from filing submission
 * SEC provides XBRL JSON in the filing's submission directory
 */
export async function fetchFilingXBRLData(accessionNumber: string, cik: string): Promise<any> {
  await rateLimitDelay();
  
  const numericCik = parseInt(cik, 10).toString();
  const accessionPath = accessionNumber.replace(/-/g, '');
  
  // SEC provides XBRL data in the submission directory
  // Try the companyfacts.json file first (filing-specific)
  const url = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accessionPath}/${accessionNumber}/companyfacts.json`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'BullPen Analytics contact@bullpen.example.com',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    // Try alternative: companyconcept.json
    const altUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accessionPath}/${accessionNumber}/companyconcept.json`;
    const altResponse = await fetch(altUrl, {
      headers: {
        'User-Agent': 'BullPen Analytics contact@bullpen.example.com',
        'Accept': 'application/json',
      },
    });
    
    if (altResponse.ok) {
      return await altResponse.json();
    }
    
    return null;
  }

  return await response.json();
}

/**
 * Fetches company facts data from SEC (aggregated, may be stale)
 * Company Facts API has all concepts in one response
 */
export async function fetchCompanyFacts(cik: string): Promise<any> {
  await rateLimitDelay();
  
  const numericCik = parseInt(cik, 10).toString().padStart(10, '0');
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${numericCik}.json`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'BullPen Analytics contact@bullpen.example.com',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const errorText = await response.text().catch(() => '');
    throw new Error(`SEC API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
  }

  return await response.json();
}

/**
 * Extracts a specific concept from Company Facts data
 */
export function extractConceptFromFacts(
  companyFacts: any,
  concept: string
): SECConceptData | null {
  if (!companyFacts || !companyFacts.facts || !companyFacts.facts['us-gaap']) {
    return null;
  }

  const gaapFacts = companyFacts.facts['us-gaap'];
  const conceptData = gaapFacts[concept];

  if (!conceptData) {
    return null;
  }

  // Convert Company Facts format to our SECConceptData format
  return {
    cik: companyFacts.cik,
    taxonomy: 'us-gaap',
    tag: concept,
    label: conceptData.label || concept,
    description: conceptData.description || '',
    units: conceptData.units || {},
  };
}

/**
 * Fetches a specific concept from SEC (uses Company Facts API)
 */
export async function fetchConceptFromSEC(
  cik: string,
  concept: string
): Promise<SECConceptData | null> {
  const companyFacts = await fetchCompanyFacts(cik);
  
  if (!companyFacts) {
    return null;
  }

  return extractConceptFromFacts(companyFacts, concept);
}

/**
 * Checks if a unit entry is consolidated (not segmented)
 * Rejects entries with segment dimensions or comparative periods
 */
function isConsolidatedEntry(entry: any): boolean {
  // Reject if has segment dimensions (indicates segmented reporting)
  if (entry.dimensions && Object.keys(entry.dimensions).length > 0) {
    return false;
  }

  // Reject if frame indicates segment (e.g., "CY2024Q1[Member]")
  if (entry.frame && (
    entry.frame.includes('[Member]') ||
    entry.frame.includes('Segment') ||
    entry.frame.includes('Product')
  )) {
    return false;
  }

  // Accept consolidated entries (no dimensions, or only entity dimension)
  return true;
}

/**
 * Extracts metric value for a specific period from concept data
 * 
 * Requirements:
 * - Exact period_end_date matching
 * - Consolidated contexts only (exclude segments)
 * - Reject legacy or comparative contexts
 */
export function extractMetricForPeriod(
  conceptData: SECConceptData,
  periodEndDate: string,
  filingType: '10-K' | '10-Q' | '20-F' | '6-K',
  requireExactPeriod: boolean = true,
  fiscalYearEnd?: FiscalYearEnd | null
): ExtractedMetric | null {
  if (!conceptData || !conceptData.units) {
    return null;
  }

  // Find the appropriate unit (usually USD or shares)
  const unitKey = Object.keys(conceptData.units).find(key => 
    key === 'USD' || key === 'shares' || key === 'pure'
  ) || Object.keys(conceptData.units)[0];
  
  const units = conceptData.units[unitKey];
  
  if (!units || units.length === 0) {
    return null;
  }

  // Filter by filing type and consolidated only
  // XBRL data from SEC Company Facts API uses 10-K/10-Q for both US and foreign issuers
  // For foreign issuers, 20-F filings are often stored as 10-K in XBRL
  // 6-K filings typically don't have XBRL data at all (they're text-based)
  const filtered = units.filter((u: any) => {
    const form = (u.form || '').toUpperCase().trim();
    let matchesType = false;
    
    // Match form type:
    // - 10-K: matches only 10-K
    // - 20-F (annual): matches 10-K, 20-F, 20F, or 20-F* (SEC often uses 10-K for 20-F in XBRL)
    // - 10-Q: matches only 10-Q
    // - 6-K (quarterly): matches 10-Q or 6-K (SEC may use 10-Q for 6-K in XBRL, but 6-K usually has no XBRL)
    if (filingType === '10-K') {
      matchesType = form === '10-K';
    } else if (filingType === '20-F') {
      // 20-F filings are often stored as 10-K in XBRL, so match both
      matchesType = form === '10-K' || form === '20-F' || form === '20F' || form.startsWith('20-F');
    } else if (filingType === '10-Q') {
      matchesType = form === '10-Q';
    } else if (filingType === '6-K') {
      // 6-K filings rarely have XBRL, but if they do, they might be stored as 10-Q
      matchesType = form === '10-Q' || form === '6-K' || form === '6K' || form.startsWith('6-K');
    }
    
    const isConsolidated = isConsolidatedEntry(u);
    return matchesType && isConsolidated;
  });

  if (filtered.length === 0) {
    return null;
  }

  // For 10-Q filings, prioritize quarterly (Q) entries over YTD entries
  // Multiple entries may exist for the same periodEndDate (one Q, one YTD)
  const exactMatches = filtered.filter((u: any) => {
    const periodEnd = u.end || u.instant || '';
    return periodEnd === periodEndDate;
  });

  // If multiple matches, prefer quarterly (Q) over YTD/TTM
  let exactMatch = exactMatches.find((u: any) => {
    const fp = (u.fp || '').toUpperCase().trim();
    const frame = (u.frame || '').toUpperCase();
    // Prioritize explicit Q1-Q4 entries
    if (fp === 'Q1' || fp === 'Q2' || fp === 'Q3' || fp === 'Q4') {
      // But exclude if frame indicates YTD/Nine Months
      if (!frame.includes('NINEMONTHS') && 
          !frame.includes('NINE MONTHS') && 
          !frame.includes('YTD') && 
          !frame.includes('YEAR-TO-DATE')) {
        return true;
      }
    }
    return false;
  });

  // Fallback to first exact match if no quarterly found
  if (!exactMatch && exactMatches.length > 0) {
    exactMatch = exactMatches[0];
  }

  if (!exactMatch) {
    // If requireExactPeriod is false, use most recent consolidated entry
    if (!requireExactPeriod) {
      const sorted = filtered.sort((a: any, b: any) => {
        const dateA = a.end || a.instant || '';
        const dateB = b.end || b.instant || '';
        return dateB.localeCompare(dateA);
      });
      
      if (sorted.length > 0) {
        const mostRecent = sorted[0];
        const value = typeof mostRecent.val === 'string' 
          ? parseFloat(mostRecent.val) 
          : mostRecent.val;
          
        const periodEnd = mostRecent.end || mostRecent.instant || periodEndDate;
        const periodStart = mostRecent.start || undefined;
        
        // Detect period scope (Q/YTD/TTM/FY) from XBRL data
        const periodScope = detectPeriodScope(
          mostRecent.fp,
          mostRecent.frame,
          periodStart,
          periodEnd,
          fiscalYearEnd ?? null
        );
        
        // Map scope to database period_type
        const periodType = scopeToPeriodType(periodScope);
        
        // Calculate period length
        const periodLengthMonths = calculatePeriodLengthMonths(periodStart, periodEnd);

        return {
          value,
          unit: unitKey,
          periodEnd,
          periodStart,
          periodType,
          periodScope,
          periodLengthMonths,
          filingForm: mostRecent.form || filingType,
          accessionNumber: mostRecent.accn,
        };
      }
    }
    return null;
  }

  const value = typeof exactMatch.val === 'string' 
    ? parseFloat(exactMatch.val) 
    : exactMatch.val;
    
  const periodEnd = exactMatch.end || exactMatch.instant || periodEndDate;
  const periodStart = exactMatch.start || undefined; // Period start date (for range periods)
  
  // Detect period scope (Q/YTD/TTM/FY) from XBRL data
  // This is the authoritative classification - never infer from filing type alone
  const periodScope = detectPeriodScope(
    exactMatch.fp,
    exactMatch.frame,
    periodStart,
    periodEnd,
    fiscalYearEnd ?? null
  );
  
  // Map scope to database period_type
  const periodType = scopeToPeriodType(periodScope);
  
  // Calculate period length
  const periodLengthMonths = calculatePeriodLengthMonths(periodStart, periodEnd);
  
  // Extract fiscal year and quarter if available
  let fiscalYear: number | undefined;
  let fiscalQuarter: number | null = null;
  
  if (exactMatch.fy) {
    fiscalYear = parseInt(exactMatch.fy, 10);
  }
  
  if (exactMatch.fp && (exactMatch.fp === 'Q1' || exactMatch.fp === 'Q2' || exactMatch.fp === 'Q3' || exactMatch.fp === 'Q4')) {
    fiscalQuarter = parseInt(exactMatch.fp.slice(1), 10);
  }

  return {
    value,
    unit: unitKey,
    periodEnd,
    periodStart,
    periodType,
    periodScope,
    fiscalYear,
    fiscalQuarter,
    periodLengthMonths,
    filingForm: exactMatch.form || filingType,
    accessionNumber: exactMatch.accn,
  };
}

/**
 * Gets metric value for a specific filing
 * First tries filing-specific XBRL, then falls back to Company Facts API
 * 
 * For revenue: Requires exact period match, consolidated contexts only
 */
export async function getMetricForFiling(
  cik: string,
  metricType: string,
  periodEndDate: string,
  filingType: '10-K' | '10-Q' | '20-F' | '6-K',
  accessionNumber?: string,
  requireExactPeriod: boolean = true,
  fiscalYearEnd?: FiscalYearEnd | null,
  onProgress?: (message: string, details?: any) => void
): Promise<ExtractedMetric | null> {
  const concepts = METRIC_TO_CONCEPTS[metricType];
  
  if (!concepts) {
    onProgress?.(`No concepts mapped for ${metricType}`);
    return null;
  }

  // Strategy 1: Try filing-specific XBRL data (most accurate, has latest data)
  if (accessionNumber) {
    try {
      onProgress?.(`Trying filing-specific XBRL for ${metricType}`, { accessionNumber });
      const filingXBRL = await fetchFilingXBRLData(accessionNumber, cik);
      
      if (filingXBRL && filingXBRL.facts && filingXBRL.facts['us-gaap']) {
        onProgress?.(`Filing-specific XBRL data found for ${metricType}`);
        // Extract concept from filing-specific data
        for (const concept of concepts) {
          const conceptData = extractConceptFromFacts(filingXBRL, concept);
          
          if (conceptData) {
            onProgress?.(`Found concept ${concept} in filing XBRL for ${metricType}`);
            const metric = extractMetricForPeriod(
              conceptData, 
              periodEndDate, 
              filingType, 
              requireExactPeriod,
              fiscalYearEnd
            );
            if (metric) {
              onProgress?.(`Extracted ${metricType} from filing XBRL`, { value: metric.value, periodEnd: metric.periodEnd, periodScope: metric.periodScope });
              return metric;
            } else {
              onProgress?.(`Concept ${concept} found but no matching period`, { periodEndDate, requireExactPeriod });
            }
          } else {
            onProgress?.(`Concept ${concept} not found in filing XBRL`);
          }
        }
      } else {
        onProgress?.(`Filing-specific XBRL data not available or missing us-gaap facts`);
      }
    } catch (error) {
      // Filing-specific fetch failed, continue to fallback
      onProgress?.(`Filing-specific XBRL fetch failed for ${metricType}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Strategy 2: Fallback to Company Facts API (aggregated, may be stale)
  onProgress?.(`Falling back to Company Facts API for ${metricType}`);
  for (const concept of concepts) {
    try {
      const conceptData = await fetchConceptFromSEC(cik, concept);
      
      if (conceptData) {
        onProgress?.(`Found concept ${concept} in Company Facts for ${metricType}`);
        const metric = extractMetricForPeriod(
          conceptData, 
          periodEndDate, 
          filingType, 
          requireExactPeriod,
          fiscalYearEnd
        );
        if (metric) {
          onProgress?.(`Extracted ${metricType} from Company Facts`, { value: metric.value, periodEnd: metric.periodEnd, periodScope: metric.periodScope });
          return metric;
        } else {
          onProgress?.(`Concept ${concept} found in Company Facts but no matching period`, { periodEndDate, requireExactPeriod });
        }
      } else {
        onProgress?.(`Concept ${concept} not found in Company Facts`);
      }
    } catch (error) {
      onProgress?.(`Error fetching concept ${concept} from Company Facts`, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  onProgress?.(`Failed to extract ${metricType} - tried all concepts and strategies`);
  return null;
}
