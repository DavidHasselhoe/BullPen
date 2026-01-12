// Missing Reports Detection and Ingestion
// Detects when companies are missing expected SEC filings and triggers targeted ingestion

import { createServerClient } from '../supabase/client';
import { getRecentFilings } from './sec-edgar';
import { ingestFiling } from './filing-ingestion';
import type { SECFilingMetadata } from './sec-edgar';

export interface MissingReportsResult {
  success: boolean;
  missing10Ks?: number;
  missing10Qs?: number;
  ingested10Ks?: number;
  ingested10Qs?: number;
  error?: string;
}

/**
 * Calculates expected years and quarters a company should have
 * For a mature public company:
 * - 10-K: Last 3 years (e.g., 2023, 2024, 2025)
 * - 10-Q: Last 3 years, all quarters (Q1, Q2, Q3, Q4) for each year
 * 
 * Exported so it can be used by other modules
 */
export function calculateExpectedReports(): { 
  expected10KYears: Set<number>;
  expected10QPeriods: Set<string>;
  expected10K: number;
  expected10Q: number;
} {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12
  const currentQuarter = Math.floor((currentMonth - 1) / 3) + 1; // 1-4

  // Expected 10-Ks: Last 3 completed years (not including current year)
  // Annual reports for year X are filed in year X+1 (early in the year, Jan-Apr)
  // So for 2025, we expect 2024's 10-K (filed in early 2025), 2023's (filed in 2024), etc.
  const expected10KYears = new Set<number>();
  for (let i = 1; i <= 3; i++) {
    const year = currentYear - i;
    if (year > 0) { // Don't include future or invalid years
      expected10KYears.add(year);
    }
  }
  
  // Expected 10-Qs: Last 3 years, all quarters (Q1-Q4) for each year
  // But exclude Q4 of current year if we're still in Q4 or haven't filed yet
  const expected10QPeriods = new Set<string>();
  for (let yearOffset = 0; yearOffset < 3; yearOffset++) {
    const year = currentYear - yearOffset;
    // For current year, only include quarters that have passed
    // If we're in Q1, we might not have filed Q1 yet, so don't include it
    // If we're in Q2, include Q1 (which should be filed by now)
    let quartersToInclude = 4;
    if (year === currentYear) {
      // Only include quarters that should have been filed by now
      // Q1 typically filed in May, Q2 in August, Q3 in November
      if (currentMonth < 5) {
        // Before May - no quarters should be filed yet for current year
        quartersToInclude = 0;
      } else if (currentMonth < 8) {
        // May-July - Q1 should be filed
        quartersToInclude = 1;
      } else if (currentMonth < 11) {
        // August-October - Q1 and Q2 should be filed
        quartersToInclude = 2;
      } else {
        // November-December - Q1, Q2, Q3 should be filed (Q4 is annual)
        quartersToInclude = 3;
      }
    }
    
    for (let quarter = 1; quarter <= quartersToInclude; quarter++) {
      // Include all quarters for historical completeness
      expected10QPeriods.add(`${year}-Q${quarter}`);
    }
  }
  
  return {
    expected10KYears,
    expected10QPeriods,
    expected10K: expected10KYears.size,
    expected10Q: expected10QPeriods.size,
  };
}

/**
 * Detects if a company is a foreign private issuer
 * Checks SEC submissions for 20-F or 6-K filings
 */
async function detectForeignIssuer(cik: string): Promise<boolean> {
  try {
    const { getRecentFilings } = await import('./sec-edgar');
    // Check for 20-F or 6-K filings (foreign issuer forms)
    const foreignFilings20F = await getRecentFilings(cik, '20-F', 1);
    const foreignFilings6K = await getRecentFilings(cik, '6-K', 1);
    
    return foreignFilings20F.length > 0 || foreignFilings6K.length > 0;
  } catch (error) {
    console.warn(`Failed to detect issuer type for CIK ${cik}:`, error);
    return false; // Default to US issuer if detection fails
  }
}

/**
 * Checks how many reports a company currently has in the database
 * Returns both count and list of years/quarters covered
 * Supports both US issuers (10-K/10-Q) and foreign issuers (20-F/6-K)
 */
export async function checkCompanyReports(
  companyId: string,
  cik: string
): Promise<{
  existing10K: number;
  existing10Q: number;
  existing10KYears: Set<number>;
  existing10QPeriods: Set<string>; // Format: "YYYY-Q" e.g., "2024-Q1"
  success: boolean;
  error?: string;
  isForeignIssuer?: boolean;
}> {
  try {
    const supabase = createServerClient();
    
    // Detect if company is a foreign private issuer
    const isForeignIssuer = await detectForeignIssuer(cik);
    
    // Determine filing types based on issuer type
    const annualFormType = isForeignIssuer ? '20-F' : '10-K';
    const quarterlyFormType = isForeignIssuer ? '6-K' : '10-Q';
    
    // Get existing annual filings with period_end_date
    const { data: filingsAnnual, error: errorAnnual } = await supabase
      .from('filings')
      .select('id, period_end_date, fiscal_year, period_type')
      .eq('company_id', companyId)
      .in('filing_type', [annualFormType, isForeignIssuer ? '10-K' : '20-F']) // Include both in case of mixed filings
      .eq('processing_status', 'completed')
      .or(`period_type.eq.annual,period_type.is.null`);
    
    // Get existing quarterly filings with period_end_date
    const { data: filingsQuarterly, error: errorQuarterly } = await supabase
      .from('filings')
      .select('id, period_end_date, fiscal_year, fiscal_quarter, period_type')
      .eq('company_id', companyId)
      .in('filing_type', [quarterlyFormType, isForeignIssuer ? '10-Q' : '6-K']) // Include both in case of mixed filings
      .eq('processing_status', 'completed')
      .or(`period_type.eq.quarterly,period_type.is.null`);
    
    if (errorAnnual || errorQuarterly) {
      return {
        existing10K: 0,
        existing10Q: 0,
        existing10KYears: new Set(),
        existing10QPeriods: new Set(),
        success: false,
        error: errorAnnual?.message || errorQuarterly?.message || 'Failed to check existing reports',
        isForeignIssuer,
      };
    }
    
    // Extract years from annual filings (10-K or 20-F)
    const existing10KYears = new Set<number>();
    filingsAnnual?.forEach((filing) => {
      if (filing.period_end_date) {
        const year = new Date(filing.period_end_date).getFullYear();
        existing10KYears.add(year);
      } else if (filing.fiscal_year) {
        existing10KYears.add(filing.fiscal_year);
      }
    });
    
    // Extract quarter periods from quarterly filings (10-Q or 6-K)
    const existing10QPeriods = new Set<string>();
    filingsQuarterly?.forEach((filing) => {
      // Only count quarterly period types (filter out non-earnings 6-Ks)
      if (filing.period_type === 'quarterly' || !filing.period_type) {
        if (filing.period_end_date) {
          const date = new Date(filing.period_end_date);
          const year = date.getFullYear();
          const month = date.getMonth() + 1; // 1-12
          const quarter = Math.floor((month - 1) / 3) + 1; // 1-4
          existing10QPeriods.add(`${year}-Q${quarter}`);
        } else if (filing.fiscal_year && filing.fiscal_quarter) {
          existing10QPeriods.add(`${filing.fiscal_year}-Q${filing.fiscal_quarter}`);
        }
      }
    });
    
    return {
      existing10K: filingsAnnual?.length || 0,
      existing10Q: filingsQuarterly?.length || 0,
      existing10KYears,
      existing10QPeriods,
      success: true,
      isForeignIssuer,
    };
  } catch (error) {
    return {
      existing10K: 0,
      existing10Q: 0,
      existing10KYears: new Set(),
      existing10QPeriods: new Set(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Detects missing reports and fetches them from SEC
 */
export async function detectAndIngestMissingReports(
  companyId: string,
  cik: string,
  ticker: string,
  onProgress?: (step: string, details?: any) => void
): Promise<MissingReportsResult> {
  try {
    onProgress?.('Checking for missing reports', { companyId, ticker });
    
    // Step 1: Check existing reports
    const existingReports = await checkCompanyReports(companyId, cik);
    
    if (!existingReports.success) {
      return {
        success: false,
        error: existingReports.error || 'Failed to check existing reports',
      };
    }
    
    const { expected10KYears, expected10QPeriods, expected10K, expected10Q } = calculateExpectedReports();
    const { existing10K, existing10Q, existing10KYears, existing10QPeriods, isForeignIssuer } = existingReports;
    
    // Determine filing types based on issuer type
    const annualFormType = isForeignIssuer ? '20-F' : '10-K';
    const quarterlyFormType = isForeignIssuer ? '6-K' : '10-Q';
    
    // Find missing years for annual reports (10-K or 20-F)
    const missing10KYears = new Set<number>();
    expected10KYears.forEach((year) => {
      if (!existing10KYears.has(year)) {
        missing10KYears.add(year);
      }
    });
    
    // Find missing quarters for quarterly reports (10-Q or 6-K)
    const missing10QPeriods = new Set<string>();
    expected10QPeriods.forEach((period) => {
      if (!existing10QPeriods.has(period)) {
        missing10QPeriods.add(period);
      }
    });
    
    const missing10K = missing10KYears.size;
    const missing10Q = missing10QPeriods.size;
    
    onProgress?.('Report analysis complete', {
      existing10K,
      existing10Q,
      expected10K,
      expected10Q,
      missing10K,
      missing10Q,
      missing10KYears: Array.from(missing10KYears),
      missing10QPeriods: Array.from(missing10QPeriods),
    });
    
    // Step 2: If no missing reports, return early
    if (missing10K === 0 && missing10Q === 0) {
      onProgress?.('No missing reports found');
      return {
        success: true,
        missing10Ks: 0,
        missing10Qs: 0,
        ingested10Ks: 0,
        ingested10Qs: 0,
      };
    }
    
    // Step 3: Fetch missing annual reports if needed (10-K or 20-F)
    let ingested10Ks = 0;
    if (missing10K > 0) {
      onProgress?.(`Fetching missing ${annualFormType} reports`, { 
        formType: annualFormType,
        count: missing10K, 
        missingYears: Array.from(missing10KYears)
      });
      
      // Fetch more than needed to ensure we get all missing years
      // SEC returns filings by filing date, so we need to fetch more to find specific years
      const available10Ks = await getRecentFilings(cik, annualFormType, 10); // Fetch more to find specific years
      
      // Filter out ones we already have
      const supabase = createServerClient();
      const { data: existing10Ks } = await supabase
        .from('filings')
        .select('accession_number')
        .eq('company_id', companyId)
        .eq('filing_type', annualFormType)
        .in(
          'accession_number',
          available10Ks.map((f) => f.accessionNumber)
        );
      
      const existingAccessions = new Set(
        existing10Ks?.map((f) => f.accession_number) || []
      );
      
      // Filter to only new filings that match missing years
      // Extract year from report date or filing date
      const new10Ks = available10Ks.filter((filing) => {
        // Skip if already exists
        if (existingAccessions.has(filing.accessionNumber)) {
          return false;
        }
        
        let reportYear: number | null = null;
        
        // First try to get report year from reportDate (most accurate)
        if (filing.reportDate && filing.reportDate.length >= 4) {
          reportYear = parseInt(filing.reportDate.substring(0, 4));
        }
        
        // Fallback to filing date year (filed early next year for previous year's report)
        if (!reportYear && filing.filingDate && filing.filingDate.length >= 4) {
          const filingYear = parseInt(filing.filingDate.substring(0, 4));
          const filingMonth = filing.filingDate.length >= 6 ? parseInt(filing.filingDate.substring(4, 6)) : null;
          
        // Annual reports (10-K or 20-F) for year X are typically filed in year X+1 (early in the year, Jan-Apr)
        // So if filed in 2025 before May, it's likely for 2024
        // If filed in 2025 after April, check both years
        if (filingMonth && filingMonth <= 4) {
          // Filed in Jan-Apr, definitely for previous year
          reportYear = filingYear - 1;
        } else if (filingMonth && filingMonth <= 6) {
          // Filed in May-June, could be either - check if missing year matches
          if (missing10KYears.has(filingYear - 1)) {
            reportYear = filingYear - 1;
          } else if (missing10KYears.has(filingYear)) {
            reportYear = filingYear;
          }
        } else {
          // Filed later in year, check both possibilities
          if (missing10KYears.has(filingYear - 1)) {
            reportYear = filingYear - 1;
          } else if (missing10KYears.has(filingYear)) {
            reportYear = filingYear;
          }
        }
        }
        
        // Check if this filing's report year matches any missing year
        if (reportYear && missing10KYears.has(reportYear)) {
          return true;
        }
        
        // If we can't determine the year but we have missing reports, include it anyway
        // We'll let ingestion determine if it's a match based on the actual filing content
        // This is safer than missing potential reports
        if (!reportYear && missing10K > 0 && new10Ks.length < missing10K) {
          return true; // Include unknown years if we still need more reports
        }
        
        return false;
      });
      
      onProgress?.(`Ingesting missing ${annualFormType} reports`, { 
        formType: annualFormType,
        count: new10Ks.length,
        totalAvailable: available10Ks.length,
        years: new10Ks.map(f => {
          const year = f.reportDate ? parseInt(f.reportDate.substring(0, 4)) : 'unknown';
          return year;
        }),
        missingYears: Array.from(missing10KYears),
        accessionNumbers: new10Ks.map(f => f.accessionNumber)
      });
      
      // Ingest all new annual reports (don't limit - we want to catch all missing years)
      for (const filing of new10Ks) {
        try {
          onProgress?.(`Ingesting ${annualFormType}: ${filing.accessionNumber}`, {
            reportDate: filing.reportDate,
            filingDate: filing.filingDate
          });
          
          const result = await ingestFiling(cik, filing.accessionNumber, (step) => {
            if (step.includes('Filing saved') || step.includes('completed') || step.includes('failed') || step.includes('classified')) {
              onProgress?.(`Ingesting ${annualFormType} ${filing.accessionNumber}: ${step}`);
            }
          });
          
          if (result.success) {
            ingested10Ks++;
            onProgress?.(`Successfully ingested ${annualFormType}: ${filing.accessionNumber}`, {
              filingId: result.filingId
            });
          } else {
            console.error(`Failed to ingest ${annualFormType} ${filing.accessionNumber}:`, result.error);
            onProgress?.(`Failed to ingest ${annualFormType} ${filing.accessionNumber}`, {
              error: result.error
            });
          }
        } catch (error) {
          console.error(`Error ingesting ${annualFormType} ${filing.accessionNumber}:`, error);
          onProgress?.(`Error ingesting ${annualFormType} ${filing.accessionNumber}`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      if (new10Ks.length === 0 && missing10K > 0) {
        onProgress?.(`No new ${annualFormType} filings found from SEC`, {
          formType: annualFormType,
          availableFromSEC: available10Ks.length,
          existingCount: existingAccessions.size,
          missingYears: Array.from(missing10KYears)
        });
      }
    }
    
    // Step 4: Fetch missing quarterly reports if needed (10-Q or 6-K)
    let ingested10Qs = 0;
    if (missing10Q > 0) {
      onProgress?.(`Fetching missing ${quarterlyFormType} reports`, { 
        formType: quarterlyFormType,
        count: missing10Q 
      });
      
      // Fetch more than needed to account for ones we might already have
      // For 6-K, fetch more to account for non-earnings filings that will be filtered out
      const fetchLimit = isForeignIssuer ? missing10Q + 5 : missing10Q + 3;
      const available10Qs = await getRecentFilings(cik, quarterlyFormType, fetchLimit);
      
      // Filter out ones we already have
      const supabase = createServerClient();
      const { data: existing10Qs } = await supabase
        .from('filings')
        .select('accession_number')
        .eq('company_id', companyId)
        .eq('filing_type', quarterlyFormType)
        .in(
          'accession_number',
          available10Qs.map((f) => f.accessionNumber)
        );
      
      const existingAccessions = new Set(
        existing10Qs?.map((f) => f.accession_number) || []
      );
      
      const new10Qs = available10Qs.filter(
        (f) => !existingAccessions.has(f.accessionNumber)
      );
      
      onProgress?.(`Ingesting missing ${quarterlyFormType} reports`, { 
        formType: quarterlyFormType,
        count: new10Qs.length 
      });
      
      // Ingest new quarterly reports
      // For 6-K, the classifier will filter out non-earnings filings during ingestion
      for (const filing of new10Qs) {
        try {
          const result = await ingestFiling(cik, filing.accessionNumber, (step) => {
            if (step.includes('Filing saved') || step.includes('completed') || step.includes('classified')) {
              onProgress?.(`Ingesting ${quarterlyFormType}: ${step}`);
            }
          });
          
          // For 6-K, only count if classification succeeded (earnings-related)
          if (result.success) {
            ingested10Qs++;
          } else if (result.error?.includes('Skipping ingestion') || result.error?.includes('low confidence')) {
            // 6-K filing was classified as non-earnings - skip it (not an error)
            // This is expected for 6-K filings
          }
        } catch (error) {
          console.error(`Error ingesting ${quarterlyFormType} ${filing.accessionNumber}:`, error);
        }
      }
    }
    
    onProgress?.('Missing reports ingestion complete', {
      ingested10Ks,
      ingested10Qs,
    });
    
    return {
      success: true,
      missing10Ks: missing10K,
      missing10Qs: missing10Q,
      ingested10Ks,
      ingested10Qs,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
