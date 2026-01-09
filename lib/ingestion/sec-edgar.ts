// SEC EDGAR API Client
// Fetches filing metadata and content from SEC's public EDGAR system

/**
 * SEC Filing Metadata from Company Facts API
 */
export interface SECFilingMetadata {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  fileNumber: string;
  filmNumber: string;
}

/**
 * SEC Company Information
 */
export interface SECCompanyInfo {
  cik: string;
  name: string;
  ticker?: string;
  exchanges?: string[];
}

/**
 * Configuration for SEC EDGAR API
 * SEC requires a User-Agent header with contact information
 */
const SEC_CONFIG = {
  baseUrl: 'https://data.sec.gov',
  userAgent: 'BullPen Analytics contact@bullpen.example.com', // Update with real contact
  rateLimit: 10, // SEC allows 10 requests per second
};

/**
 * Delays execution to respect SEC rate limits
 */
async function rateLimitDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms = 10 req/sec
}

/**
 * Fetches data from SEC EDGAR with proper headers
 */
async function fetchFromSEC(url: string, acceptType: string = 'application/json'): Promise<Response> {
  await rateLimitDelay();
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': SEC_CONFIG.userAgent,
      'Accept': acceptType,
    },
  });

  if (!response.ok) {
    throw new Error(`SEC API error: ${response.status} ${response.statusText} for ${url}`);
  }

  return response;
}

/**
 * Formats CIK to 10-digit padded format required by SEC
 * Example: "320193" -> "0000320193"
 */
export function formatCIK(cik: string): string {
  return cik.padStart(10, '0');
}

/**
 * Fetches company information from SEC
 */
export async function getCompanyInfo(cik: string): Promise<SECCompanyInfo> {
  const formattedCik = formatCIK(cik);
  const url = `${SEC_CONFIG.baseUrl}/submissions/CIK${formattedCik}.json`;
  
  const response = await fetchFromSEC(url);
  const data = await response.json();

  return {
    cik: formattedCik,
    name: data.name,
    ticker: data.tickers?.[0],
    exchanges: data.exchanges || [],
  };
}

/**
 * Fetches recent filings for a company
 */
export async function getRecentFilings(
  cik: string,
  filingType: string = '10-K',
  limit: number = 10
): Promise<SECFilingMetadata[]> {
  const formattedCik = formatCIK(cik);
  const url = `${SEC_CONFIG.baseUrl}/submissions/CIK${formattedCik}.json`;
  
  const response = await fetchFromSEC(url);
  const data = await response.json();

  const filings: SECFilingMetadata[] = [];
  const recentFilings = data.filings?.recent;

  if (!recentFilings) {
    return filings;
  }

  // SEC returns parallel arrays for filing data
  for (let i = 0; i < recentFilings.form.length && filings.length < limit; i++) {
    if (recentFilings.form[i] === filingType) {
      filings.push({
        accessionNumber: recentFilings.accessionNumber[i],
        filingDate: recentFilings.filingDate[i],
        reportDate: recentFilings.reportDate[i],
        form: recentFilings.form[i],
        fileNumber: recentFilings.fileNumber[i],
        filmNumber: recentFilings.filmNumber[i],
      });
    }
  }

  return filings;
}

/**
 * Constructs the primary document URL for a filing
 * The primary document is typically the main filing HTML/XML file
 */
export function getFilingDocumentUrl(accessionNumber: string, cik: string): string {
  // Remove leading zeros from CIK for URL path (SEC uses numeric CIK in paths)
  const numericCik = parseInt(cik, 10).toString();
  // Remove dashes from accession number for URL path
  const accessionPath = accessionNumber.replace(/-/g, '');
  
  // Full submission text file (includes all documents in the filing)
  return `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accessionPath}/${accessionNumber}.txt`;
}

/**
 * Fetches the full text content of a filing
 */
export async function getFilingContent(
  accessionNumber: string,
  cik: string
): Promise<string> {
  const url = getFilingDocumentUrl(accessionNumber, cik);
  
  const response = await fetchFromSEC(url, 'text/plain');
  const content = await response.text();

  return content;
}

/**
 * Parses accession number to extract date components
 * Format: XXXXXXXXXX-YY-XXXXXX (CIK-YY-Sequence)
 */
export function parseAccessionNumber(accessionNumber: string): {
  cik: string;
  year: string;
  sequence: string;
} {
  const parts = accessionNumber.split('-');
  return {
    cik: parts[0],
    year: parts[1],
    sequence: parts[2],
  };
}

/**
 * Validates that a filing is the expected type
 */
export function validateFilingType(
  filing: SECFilingMetadata,
  expectedType: string
): boolean {
  return filing.form === expectedType;
}

/**
 * Gets the viewer URL for a filing (human-readable version)
 */
export function getFilingViewerUrl(accessionNumber: string, cik: string): string {
  const formattedCik = formatCIK(cik);
  const accessionPath = accessionNumber.replace(/-/g, '');
  
  return `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${formattedCik}&accession_number=${accessionNumber}&xbrl_type=v`;
}

/**
 * Type guard to check if content is valid
 */
export function isValidFilingContent(content: string): boolean {
  return content.length > 1000 && content.includes('SECURITIES AND EXCHANGE COMMISSION');
}
