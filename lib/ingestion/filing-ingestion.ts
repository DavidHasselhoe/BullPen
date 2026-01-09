// Filing Ingestion Orchestrator
// Coordinates the complete pipeline: fetch → parse → store

import {
  getCompanyInfo,
  getRecentFilings,
  getFilingContent,
  getFilingDocumentUrl,
  getFilingViewerUrl,
  isValidFilingContent,
} from './sec-edgar';
import { parseFiling, validateParsedSections, getSectionStats } from './filing-parser';
import {
  getOrCreateCompany,
  filingExists,
  createFiling,
  createFilingSections,
  updateFilingStatus,
  getCompanyByCIK,
} from './database';
import type { FilingType } from '../types/database';

/**
 * Ingestion progress callback
 */
export type IngestionProgressCallback = (step: string, details?: any) => void;

/**
 * Result of filing ingestion
 */
export interface IngestionResult {
  success: boolean;
  filingId?: string;
  companyId?: string;
  sectionsCreated?: number;
  error?: string;
  details?: {
    ticker: string;
    companyName: string;
    filingType: string;
    accessionNumber: string;
    sectionStats?: any;
  };
}

/**
 * Ingests a single filing by company CIK and accession number
 * This is the main orchestrator function that coordinates the entire pipeline
 */
export async function ingestFiling(
  cik: string,
  accessionNumber: string,
  onProgress?: IngestionProgressCallback
): Promise<IngestionResult> {
  try {
    // Step 1: Fetch company information
    onProgress?.('Fetching company information', { cik });
    const companyInfo = await getCompanyInfo(cik);
    onProgress?.('Company info retrieved', { name: companyInfo.name });

    // Step 2: Get or create company in database
    onProgress?.('Creating/updating company in database');
    const companyResult = await getOrCreateCompany({
      ticker: companyInfo.ticker || 'UNKNOWN',
      name: companyInfo.name,
      cik: companyInfo.cik,
    });

    if (!companyResult.success || !companyResult.data) {
      return {
        success: false,
        error: `Failed to create company: ${companyResult.error}`,
      };
    }

    const company = companyResult.data;
    onProgress?.('Company ready', { companyId: company.id });

    // Step 3: Check if filing already exists
    onProgress?.('Checking if filing already exists');
    const exists = await filingExists(accessionNumber);
    if (exists) {
      return {
        success: false,
        error: 'Filing already exists in database',
        details: {
          ticker: company.ticker,
          companyName: company.name,
          filingType: 'unknown',
          accessionNumber,
        },
      };
    }

    // Step 4: Fetch filing content from SEC
    onProgress?.('Fetching filing content from SEC EDGAR');
    const rawContent = await getFilingContent(accessionNumber, cik);
    onProgress?.('Filing content retrieved', {
      contentLength: rawContent.length,
    });

    // Step 5: Validate content
    if (!isValidFilingContent(rawContent)) {
      return {
        success: false,
        error: 'Invalid filing content received from SEC',
      };
    }

    // Step 6: Determine filing type from content
    // Look for form type in SEC header
    const filingTypeMatch = rawContent.match(/CONFORMED SUBMISSION TYPE:\s+([^\n]+)/i);
    const filingType = (filingTypeMatch?.[1]?.trim() || '10-K') as FilingType;
    onProgress?.('Filing type identified', { filingType });

    // Step 7: Extract filing date and period
    const filingDateMatch = rawContent.match(/FILED AS OF DATE:\s+(\d{8})/i);
    const periodMatch = rawContent.match(/CONFORMED PERIOD OF REPORT:\s+(\d{8})/i);
    
    const filingDate = filingDateMatch
      ? formatSECDate(filingDateMatch[1])
      : new Date().toISOString().split('T')[0];
    const periodEndDate = periodMatch ? formatSECDate(periodMatch[1]) : undefined;

    // Step 8: Create filing record
    onProgress?.('Creating filing record in database');
    const filingResult = await createFiling({
      companyId: company.id,
      filingType,
      accessionNumber,
      filingDate,
      periodEndDate,
      sourceUrl: getFilingViewerUrl(accessionNumber, cik),
      documentUrl: getFilingDocumentUrl(accessionNumber, cik),
    });

    if (!filingResult.success || !filingResult.data) {
      return {
        success: false,
        error: `Failed to create filing: ${filingResult.error}`,
      };
    }

    const filing = filingResult.data;
    onProgress?.('Filing record created', { filingId: filing.id });

    // Step 9: Parse filing into sections
    onProgress?.('Parsing filing into sections');
    const parsed = parseFiling(rawContent, filingType);
    const validation = validateParsedSections(parsed);

    if (!validation.isValid) {
      // Update filing status to failed
      await updateFilingStatus(
        filing.id,
        'failed',
        `Parsing validation failed: ${validation.errors.join(', ')}`
      );
      return {
        success: false,
        error: `Parsing validation failed: ${validation.errors.join(', ')}`,
        filingId: filing.id,
      };
    }

    const stats = getSectionStats(parsed);
    onProgress?.('Filing parsed successfully', stats);

    // Step 10: Create filing sections
    onProgress?.('Storing filing sections in database');
    const sectionsResult = await createFilingSections(filing.id, parsed.sections);

    if (!sectionsResult.success || !sectionsResult.data) {
      // Update filing status to failed
      await updateFilingStatus(
        filing.id,
        'failed',
        `Failed to create sections: ${sectionsResult.error}`
      );
      return {
        success: false,
        error: `Failed to create sections: ${sectionsResult.error}`,
        filingId: filing.id,
      };
    }

    // Step 11: Update filing status to completed
    onProgress?.('Marking filing as completed');
    await updateFilingStatus(filing.id, 'completed');

    // Success!
    onProgress?.('Ingestion completed successfully');
    return {
      success: true,
      filingId: filing.id,
      companyId: company.id,
      sectionsCreated: sectionsResult.data.length,
      details: {
        ticker: company.ticker,
        companyName: company.name,
        filingType,
        accessionNumber,
        sectionStats: stats,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Ingests the most recent filing of a specific type for a company
 */
export async function ingestLatestFiling(
  cik: string,
  filingType: string = '10-K',
  onProgress?: IngestionProgressCallback
): Promise<IngestionResult> {
  try {
    onProgress?.('Fetching recent filings list', { cik, filingType });
    
    const recentFilings = await getRecentFilings(cik, filingType, 1);
    
    if (recentFilings.length === 0) {
      return {
        success: false,
        error: `No ${filingType} filings found for CIK ${cik}`,
      };
    }

    const latestFiling = recentFilings[0];
    onProgress?.('Latest filing identified', {
      accessionNumber: latestFiling.accessionNumber,
      filingDate: latestFiling.filingDate,
    });

    return await ingestFiling(cik, latestFiling.accessionNumber, onProgress);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Ingests multiple recent filings for a company
 */
export async function ingestRecentFilings(
  cik: string,
  filingType: string = '10-K',
  count: number = 3,
  onProgress?: IngestionProgressCallback
): Promise<IngestionResult[]> {
  try {
    onProgress?.('Fetching recent filings list', { cik, filingType, count });
    
    const recentFilings = await getRecentFilings(cik, filingType, count);
    
    if (recentFilings.length === 0) {
      return [
        {
          success: false,
          error: `No ${filingType} filings found for CIK ${cik}`,
        },
      ];
    }

    onProgress?.(`Found ${recentFilings.length} filings to ingest`);

    const results: IngestionResult[] = [];

    // Process filings sequentially to respect rate limits
    for (let i = 0; i < recentFilings.length; i++) {
      const filing = recentFilings[i];
      onProgress?.(`Processing filing ${i + 1}/${recentFilings.length}`, {
        accessionNumber: filing.accessionNumber,
      });

      const result = await ingestFiling(cik, filing.accessionNumber, onProgress);
      results.push(result);

      // Small delay between filings
      if (i < recentFilings.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return results;
  } catch (error) {
    return [
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    ];
  }
}

/**
 * Formats SEC date (YYYYMMDD) to ISO date (YYYY-MM-DD)
 */
function formatSECDate(secDate: string): string {
  const year = secDate.slice(0, 4);
  const month = secDate.slice(4, 6);
  const day = secDate.slice(6, 8);
  return `${year}-${month}-${day}`;
}

/**
 * Validates CIK format
 */
export function isValidCIK(cik: string): boolean {
  return /^\d{1,10}$/.test(cik);
}

/**
 * Validates accession number format
 */
export function isValidAccessionNumber(accessionNumber: string): boolean {
  return /^\d{10}-\d{2}-\d{6}$/.test(accessionNumber);
}
