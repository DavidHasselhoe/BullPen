// Company Profile Extractor
// Extracts company profile data from SEC sources

import { fetchCompanyFacts } from '../metrics/xbrl-fetcher';
import { createServerClient } from '../supabase/client';
import { mapSICToSectorIndustry } from './sic-mapping';
import { formatCIK } from '../ingestion/sec-edgar';

/**
 * Company profile data structure
 */
export interface CompanyProfileData {
  sic_code: string | null;
  sector: string | null;
  industry: string | null;
  incorporation_location: string | null;
  fiscal_year_end: string | null; // Format: "12-31" (MM-DD)
  employee_count: number | null;
  employee_count_is_estimated: boolean;
  shares_outstanding: number | null;
}

/**
 * SEC Submissions API response structure
 */
interface SECSubmissionsResponse {
  name: string;
  cik: string;
  tickers: string[];
  exchanges: string[];
  sic?: string;
  sicDescription?: string;
  stateOfIncorporation?: string;
  stateOfIncorporationDescription?: string;
  fiscalYearEnd?: string;
  category?: string;
  calendarYear?: string;
  [key: string]: any;
}

/**
 * Fetches company profile data from SEC submissions API
 */
async function fetchCompanySubmissions(cik: string): Promise<SECSubmissionsResponse | null> {
  const formattedCik = formatCIK(cik);
  const url = `https://data.sec.gov/submissions/CIK${formattedCik}.json`;

  try {
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
      throw new Error(`SEC API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching SEC submissions for CIK ${cik}:`, error);
    return null;
  }
}

/**
 * Extracts SIC code from SEC submissions data
 */
function extractSICCode(submissions: SECSubmissionsResponse | null): string | null {
  if (!submissions || !submissions.sic) {
    return null;
  }

  // SIC code is typically a 4-digit string
  const sicCode = submissions.sic.toString().padStart(4, '0');
  return sicCode;
}

/**
 * Extracts incorporation location from SEC submissions data
 */
function extractIncorporationLocation(submissions: SECSubmissionsResponse | null): string | null {
  if (!submissions) {
    return null;
  }

  // Try state of incorporation first
  if (submissions.stateOfIncorporationDescription) {
    return submissions.stateOfIncorporationDescription;
  }

  if (submissions.stateOfIncorporation) {
    return submissions.stateOfIncorporation;
  }

  // Try other fields that might contain location
  if (submissions.address && submissions.address.state) {
    return submissions.address.state;
  }

  return null;
}

/**
 * Extracts fiscal year end from SEC submissions data
 * Returns in MM-DD format
 */
function extractFiscalYearEnd(submissions: SECSubmissionsResponse | null): string | null {
  if (!submissions || !submissions.fiscalYearEnd) {
    return null;
  }

  // Fiscal year end is typically in format "1231" (MMDD) or "12-31"
  const fye = submissions.fiscalYearEnd.toString().replace(/[^\d]/g, '');
  
  if (fye.length === 4) {
    // Format as MM-DD
    return `${fye.substring(0, 2)}-${fye.substring(2, 4)}`;
  }

  return null;
}

/**
 * Extracts shares outstanding from XBRL company facts
 * Tries CommonStockSharesOutstanding first, then EntityCommonStockSharesOutstanding
 */
async function extractSharesOutstanding(cik: string): Promise<number | null> {
  try {
    const companyFacts = await fetchCompanyFacts(cik);
    
    if (!companyFacts || !companyFacts.facts || !companyFacts.facts['us-gaap']) {
      return null;
    }

    // Try preferred concepts in order
    const concepts = [
      'CommonStockSharesOutstanding',
      'EntityCommonStockSharesOutstanding',
    ];

    for (const concept of concepts) {
      const gaapFacts = companyFacts.facts['us-gaap'];
      const conceptData = gaapFacts[concept];
      
      if (!conceptData || !conceptData.units) {
        continue;
      }

      // Find shares unit
      const sharesUnits = conceptData.units['shares'] || conceptData.units['Shares'];
      
      if (!sharesUnits || sharesUnits.length === 0) {
        continue;
      }

      // Get the most recent value (instant or end period)
      const sortedUnits = sharesUnits
        .filter((u: any) => {
          // Prefer instant periods, or most recent end periods
          return u.instant || u.end;
        })
        .sort((a: any, b: any) => {
          const dateA = a.instant || a.end || '';
          const dateB = b.instant || b.end || '';
          return dateB.localeCompare(dateA); // Most recent first
        });

      if (sortedUnits.length > 0) {
        const value = sortedUnits[0].val;
        if (typeof value === 'number' && value > 0) {
          return Math.round(value); // Shares are whole numbers
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Error extracting shares outstanding for CIK ${cik}:`, error);
    return null;
  }
}

/**
 * Extracts employee count from 10-K Business section using regex patterns
 * Returns count and whether it's estimated
 */
async function extractEmployeeCount(companyId: string): Promise<{ count: number | null; isEstimated: boolean }> {
  const supabase = createServerClient();

  try {
    // Get the latest completed 10-K filing
    const { data: filing, error: filingError } = await supabase
      .from('filings')
      .select('id')
      .eq('company_id', companyId)
      .eq('filing_type', '10-K')
      .eq('processing_status', 'completed')
      .order('filing_date', { ascending: false })
      .limit(1)
      .single();

    if (filingError || !filing) {
      return { count: null, isEstimated: false };
    }

    // Get the business_overview section from this filing
    const { data: section, error: sectionError } = await supabase
      .from('filing_sections')
      .select('content')
      .eq('filing_id', filing.id)
      .eq('section_type', 'business_overview')
      .order('section_order', { ascending: true })
      .limit(1)
      .single();

    if (sectionError || !section || !section.content) {
      return { count: null, isEstimated: false };
    }

    const content = section.content.toLowerCase();

    // Regex patterns for employee count extraction
    // Order matters - more specific patterns first
    const patterns = [
      // Exact counts: "we have X employees", "we employ X people"
      { pattern: /we\s+have\s+approximately\s+(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s+employees?/i, isEstimated: true },
      { pattern: /we\s+employ\s+approximately\s+(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s+(?:people|employees?)/i, isEstimated: true },
      { pattern: /we\s+have\s+(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s+employees?/i, isEstimated: false },
      { pattern: /we\s+employ\s+(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s+(?:people|employees?)/i, isEstimated: false },
      { pattern: /approximately\s+(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s+employees?/i, isEstimated: true },
      { pattern: /approximately\s+(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s+(?:people|employees?)/i, isEstimated: true },
      // With context: "as of [date], we had X employees"
      { pattern: /as\s+of[^,]+,?\s+we\s+(?:had|have)\s+(?:approximately\s+)?(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s+employees?/i, isEstimated: false },
      // Standalone: "X employees", "X people employed"
      { pattern: /\b(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s+employees?\s+(?:worldwide|globally|total|as\s+of)/i, isEstimated: false },
      { pattern: /\b(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s+people\s+employed/i, isEstimated: false },
    ];

    for (const { pattern, isEstimated } of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        // Parse number, removing commas but preserving decimal separator
        // For employee counts, we round to nearest integer
        const countStr = match[1].replace(/,/g, ''); // Remove thousands separators
        const countFloat = parseFloat(countStr);
        
        if (isNaN(countFloat)) {
          continue;
        }
        
        const count = Math.round(countFloat); // Round to nearest integer
        
        // Sanity check: employee count should be reasonable (100 - 10 million)
        if (count >= 100 && count <= 10000000) {
          return { count, isEstimated };
        }
      }
    }

    return { count: null, isEstimated: false };
  } catch (error) {
    console.error(`Error extracting employee count for company ${companyId}:`, error);
    return { count: null, isEstimated: false };
  }
}

/**
 * Extracts and returns company profile data from SEC sources
 */
export async function extractCompanyProfile(cik: string, companyId: string): Promise<CompanyProfileData> {
  // Fetch SEC submissions data
  const submissions = await fetchCompanySubmissions(cik);

  // Extract basic fields from submissions
  const sicCode = extractSICCode(submissions);
  const incorporationLocation = extractIncorporationLocation(submissions);
  const fiscalYearEnd = extractFiscalYearEnd(submissions);

  // Map SIC to sector/industry
  const sicMapping = mapSICToSectorIndustry(sicCode);
  const sector = sicMapping?.sector || null;
  const industry = sicMapping?.industry || null;

  // Extract shares outstanding from XBRL
  const sharesOutstanding = await extractSharesOutstanding(cik);

  // Extract employee count from 10-K Business section
  const employeeData = await extractEmployeeCount(companyId);

  return {
    sic_code: sicCode,
    sector,
    industry,
    incorporation_location: incorporationLocation,
    fiscal_year_end: fiscalYearEnd,
    employee_count: employeeData.count,
    employee_count_is_estimated: employeeData.isEstimated,
    shares_outstanding: sharesOutstanding,
  };
}

/**
 * Updates company profile data in database
 */
export async function updateCompanyProfile(
  companyId: string,
  profileData: CompanyProfileData
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase
      .from('companies')
      .update({
        sic_code: profileData.sic_code,
        sector: profileData.sector,
        industry: profileData.industry,
        incorporation_location: profileData.incorporation_location,
        fiscal_year_end: profileData.fiscal_year_end,
        employee_count: profileData.employee_count,
        employee_count_is_estimated: profileData.employee_count_is_estimated,
        shares_outstanding: profileData.shares_outstanding,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets company profile data from database
 */
export async function getCompanyProfile(companyId: string): Promise<{
  success: boolean;
  profile?: CompanyProfileData;
  error?: string;
}> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('companies')
      .select(`
        sic_code,
        sector,
        industry,
        incorporation_location,
        fiscal_year_end,
        employee_count,
        employee_count_is_estimated,
        shares_outstanding
      `)
      .eq('id', companyId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Company not found' };
    }

    return {
      success: true,
      profile: {
        sic_code: data.sic_code,
        sector: data.sector,
        industry: data.industry,
        incorporation_location: data.incorporation_location,
        fiscal_year_end: data.fiscal_year_end,
        employee_count: data.employee_count,
        employee_count_is_estimated: data.employee_count_is_estimated || false,
        shares_outstanding: data.shares_outstanding ? Number(data.shares_outstanding) : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
