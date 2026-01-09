// SEC XBRL Data Fetcher
// Fetches structured financial data from SEC XBRL JSON endpoints

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
  capital_expenditures: ['PaymentsToAcquirePropertyPlantAndEquipment', 'CapitalExpenditures'],
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
 * Extracted metric value with period information
 */
export interface ExtractedMetric {
  value: number;
  unit: string;
  periodEnd: string;
  periodType: 'annual' | 'quarterly';
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
  filingType: '10-K' | '10-Q',
  requireExactPeriod: boolean = true
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
  const filtered = units.filter((u: any) => {
    const form = u.form || '';
    const matchesType = filingType === '10-K' ? form === '10-K' : form === '10-Q';
    const isConsolidated = isConsolidatedEntry(u);
    return matchesType && isConsolidated;
  });

  if (filtered.length === 0) {
    return null;
  }

  // Require exact period match (no fallback for hardened extraction)
  const exactMatch = filtered.find((u: any) => {
    const periodEnd = u.end || u.instant || '';
    return periodEnd === periodEndDate;
  });

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
        const periodType = mostRecent.fp === 'FY' || filingType === '10-K' 
          ? 'annual' as const 
          : 'quarterly' as const;

        return {
          value,
          unit: unitKey,
          periodEnd,
          periodType,
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
  const periodType = exactMatch.fp === 'FY' || filingType === '10-K' 
    ? 'annual' as const 
    : 'quarterly' as const;

  return {
    value,
    unit: unitKey,
    periodEnd,
    periodType,
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
  filingType: '10-K' | '10-Q',
  accessionNumber?: string,
  requireExactPeriod: boolean = true
): Promise<ExtractedMetric | null> {
  const concepts = METRIC_TO_CONCEPTS[metricType];
  
  if (!concepts) {
    return null;
  }

  // Strategy 1: Try filing-specific XBRL data (most accurate, has latest data)
  if (accessionNumber) {
    try {
      const filingXBRL = await fetchFilingXBRLData(accessionNumber, cik);
      
      if (filingXBRL && filingXBRL.facts && filingXBRL.facts['us-gaap']) {
        // Extract concept from filing-specific data
        for (const concept of concepts) {
          const conceptData = extractConceptFromFacts(filingXBRL, concept);
          
          if (conceptData) {
            const metric = extractMetricForPeriod(
              conceptData, 
              periodEndDate, 
              filingType, 
              requireExactPeriod
            );
            if (metric) {
              return metric;
            }
          }
        }
      }
    } catch (error) {
      // Filing-specific fetch failed, continue to fallback
      console.warn(`Filing-specific XBRL fetch failed: ${error}`);
    }
  }

  // Strategy 2: Fallback to Company Facts API (aggregated, may be stale)
  for (const concept of concepts) {
    const conceptData = await fetchConceptFromSEC(cik, concept);
    
    if (conceptData) {
      const metric = extractMetricForPeriod(
        conceptData, 
        periodEndDate, 
        filingType, 
        requireExactPeriod
      );
      if (metric) {
        return metric;
      }
    }
  }

  return null;
}
