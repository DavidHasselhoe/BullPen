// Canonical Filing-First Ingestion Pipeline
// Single source of truth: Filings → Tables → AI Reader → Validated Metrics
//
// NON-NEGOTIABLE PRINCIPLES:
// - If filing does not explicitly state a value, BullPen does not store it
// - AI is a reader, never an analyst
// - Wrong data is worse than missing data
// - Every stored metric must be traceable to a filing and a table
// - Failures must be logged, not hidden

import { createServerClient } from '../supabase/client';
import { createFinancialMetric } from './metrics-db';

/**
 * STEP 1: Supported Filing Types
 * Explicit allowlist - reject everything else
 */
const SUPPORTED_FILINGS = ['10-Q', '20-F', '6-K', '10-K'] as const;
export type SupportedFilingType = typeof SUPPORTED_FILINGS[number];

/**
 * Filing-type-aware extraction intent
 */
interface FilingExtractionIntent {
  expectsQuarterly: boolean;
  expectsAnnual: boolean;
  acceptsQuarterlyFromTables: boolean;
  acceptsAnnualFromTables: boolean;
  description: string;
}

/**
 * STEP 2: Filing-Type-Aware Extraction Strategy
 */
const FILING_EXTRACTION_INTENT: Record<SupportedFilingType, FilingExtractionIntent> = {
  '10-Q': {
    expectsQuarterly: true,
    expectsAnnual: false,
    acceptsQuarterlyFromTables: true,
    acceptsAnnualFromTables: false,
    description: 'Primary source for quarterly metrics (US issuers)',
  },
  '20-F': {
    expectsQuarterly: false,
    expectsAnnual: true,
    acceptsQuarterlyFromTables: false,
    acceptsAnnualFromTables: true,
    description: 'Annual filing for foreign issuers (FY only)',
  },
  '6-K': {
    expectsQuarterly: false, // Conditional - only if explicitly present
    expectsAnnual: false,
    acceptsQuarterlyFromTables: true, // Only if "Three Months Ended" explicitly stated
    acceptsAnnualFromTables: false,
    description: 'Interim updates for foreign issuers (may contain quarterly data)',
  },
  '10-K': {
    expectsQuarterly: false,
    expectsAnnual: true,
    acceptsQuarterlyFromTables: false,
    acceptsAnnualFromTables: true,
    description: 'Annual filing for US issuers (FY only)',
  },
};
import { getFilingDocumentUrl } from '../ingestion/sec-edgar';
import { createHash } from 'crypto';
import {
  extractIncomeStatementTables,
  tableToStructuredText,
  extractMetricsFromTable,
  parseExtractionResponse,
  TABLE_EXTRACTION_PROMPT,
  type TableExtractedMetric,
} from './table-extractor';
import type { PeriodScope } from './period-classification';
import type { MetricType, PeriodType } from '../types/database';
import { TableDetectionLogger } from './table-detection-logger';

/**
 * Structured logging for pipeline observability
 */
export interface PipelineLog {
  symbol: string;
  filing_id: string;
  step: string;
  metric?: string;
  reason?: string;
  details?: any;
  timestamp: string;
  success: boolean;
}

/**
 * Result of table extraction attempt
 */
export interface TableExtractionAttempt {
  tableFingerprint: string;
  tableHtml: string;
  structuredText: string;
  aiOutput?: string;
  extractedMetrics: TableExtractedMetric[];
  error?: string;
  success: boolean;
}

/**
 * Result of canonical pipeline execution
 */
export interface CanonicalPipelineResult {
  success: boolean;
  filingId: string;
  metricsExtracted: number;
  metricsStored: number;
  tablesProcessed: number;
  errors: string[];
  logs: PipelineLog[];
  details?: {
    companyName: string;
    ticker: string;
    filingType: string;
    accessionNumber: string;
  };
}

/**
 * Progress callback for pipeline steps
 */
export type CanonicalPipelineCallback = (
  step: string,
  details?: any
) => void;

/**
 * STEP 2: Secure Filing Fetch & Storage
 * Requirements:
 * - Fetch only from sec.gov
 * - Enforce SEC rate limits
 * - Validate accession number format
 * - Strip scripts, inline JS, and external references
 * - Store raw HTML immutably
 * - Reject filings larger than safe threshold (15MB)
 */
async function fetchAndStoreFiling(
  accessionNumber: string,
  cik: string,
  filingId: string,
  onProgress?: CanonicalPipelineCallback
): Promise<{ success: boolean; rawHtml?: string; error?: string }> {
  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
  
  try {
    onProgress?.('Fetching filing from SEC', { accessionNumber, cik });
    
    // Validate accession number format
    const accessionPattern = /^\d{10}-\d{2}-\d{6}$/;
    if (!accessionPattern.test(accessionNumber)) {
      return {
        success: false,
        error: `Invalid accession number format: ${accessionNumber}`,
      };
    }
    
    // Validate URL is from sec.gov
    const url = getFilingDocumentUrl(accessionNumber, cik);
    if (!url.startsWith('https://www.sec.gov/')) {
      return {
        success: false,
        error: `Invalid URL domain (must be sec.gov): ${url}`,
      };
    }
    
    // Fetch filing content with rate limiting
    // Add rate limit delay
    await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms = 10 req/sec
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BullPen Analytics contact@bullpen.example.com',
        'Accept': 'text/plain',
      },
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `SEC API error: ${response.status} ${response.statusText}`,
      };
    }
    
    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `Filing exceeds maximum size (${Math.round(parseInt(contentLength, 10) / 1024 / 1024)}MB > 15MB)`,
      };
    }
    
    const rawContent = await response.text();
    
    // Check actual size after fetching
    if (rawContent.length > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `Filing content exceeds maximum size (${Math.round(rawContent.length / 1024 / 1024)}MB > 15MB)`,
      };
    }
    
    // Extract main filing document for 10-K/10-Q (full .txt contains multiple docs; main doc has tables)
    let contentForTables = rawContent;
    const docMatch = rawContent.match(/<DOCUMENT>[\s\S]*?<TYPE>(10-K|10-Q)(?:\/[A-Z])?[\s\S]*?<TEXT>([\s\S]*?)<\/TEXT>[\s\S]*?<\/DOCUMENT>/i);
    if (docMatch && docMatch[2] && docMatch[2].length > 50000) {
      contentForTables = docMatch[2]; // Use main 10-K/10-Q document for cleaner table structure
    } else {
    }

    // Sanitize HTML: Remove scripts, inline JS, and external references
    const sanitized = sanitizeFilingHtml(contentForTables);
    
    // Store raw HTML in filing metadata (immutable)
    const supabase = createServerClient();
    const { error: updateError } = await supabase
      .from('filings')
      .update({
        metadata: {
          ...((await supabase.from('filings').select('metadata').eq('id', filingId).single()).data?.metadata || {}),
          raw_html: sanitized,
          raw_html_size: sanitized.length,
          raw_html_sha256: createHash('sha256').update(sanitized).digest('hex'),
          stored_at: new Date().toISOString(),
        },
      })
      .eq('id', filingId);
    
    if (updateError) {
      return {
        success: false,
        error: `Failed to store raw HTML: ${updateError.message}`,
      };
    }
    
    onProgress?.('Filing fetched and stored', {
      size: sanitized.length,
      sha256: createHash('sha256').update(sanitized).digest('hex').substring(0, 16),
    });
    
    return { success: true, rawHtml: sanitized };
  } catch (error) {
    return {
      success: false,
      error: `Filing fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Sanitize HTML: Remove scripts, inline JS, and external references
 */
function sanitizeFilingHtml(html: string): string {
  // Remove <script> tags and content
  let sanitized = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  
  // Remove inline event handlers (onclick, onload, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove external references in metadata
  sanitized = sanitized.replace(/<meta[^>]*http-equiv[^>]*>/gi, '');
  
  // Keep the rest as-is for table structure preservation
  return sanitized;
}

/**
 * STEP 3: Deterministic Table Detection (Filing-Type-Aware)
 * Requirements:
 * - Match known GAAP row labels (EPS, net income, revenue)
 * - Require column headers (dates + period labels)
 * - Reject tables without clear period context
 * - Filing-type-aware: 10-Q expects quarterly, 20-F/10-K expects annual, 6-K is conditional
 */
function detectFinancialTables(
  html: string,
  filingType: SupportedFilingType,
  extractionIntent: FilingExtractionIntent,
  onProgress?: CanonicalPipelineCallback
): string[] {
  const logger = new TableDetectionLogger(onProgress);
  
  onProgress?.('Detecting financial tables', {
    filingType,
    expectsQuarterly: extractionIntent.expectsQuarterly,
    expectsAnnual: extractionIntent.expectsAnnual,
  });
  
  const validTables: Array<{ tableHtml: string; score: number }> = [];
  const tablePattern = /<table[^>]*>[\s\S]*?<\/table>/gi;
  
  let match;
  while ((match = tablePattern.exec(html)) !== null) {
    const tableHtml = match[0];
    
    // Check for income statement indicators
    const hasEPS = /(?:earnings\s*per\s*share|eps\s*(?:basic|diluted)|net\s*income\s*per\s*share)/i.test(tableHtml);
    const hasRevenue = /(?:revenue|revenues|net\s*sales|total\s*revenue|total\s*net\s*revenue)/i.test(tableHtml);
    const hasIncome = /(?:net\s*income|operating\s*income|gross\s*profit|income\s*from\s*operations)/i.test(tableHtml);
    const hasCostOfRevenue = /(?:cost\s*of\s*revenue|cost\s*of\s*goods\s*sold|cost\s*of\s*sales|cost\s*of\s*products)/i.test(tableHtml);
    // Cash flow statement indicators
    const hasOperatingCashFlow = /(?:net\s*cash\s*(?:provided|used)\s*(?:by|in)\s*operating|operating\s*activities|cash\s*flows?\s*from\s*operating)/i.test(tableHtml);
    const hasCapEx = /(?:capital\s*expenditure|payments?\s*for\s*property|purchase\s*of\s*property|additions?\s*to\s*property)/i.test(tableHtml);
    
    const isDisclosureTable = /(?:stock[- ]based\s*compensation|significant\s*accounting\s*policies|segment\s*information|subsequent\s*events)/i.test(tableHtml);
    
    const isIncomeStatement = hasEPS || (hasRevenue && hasIncome) || hasRevenue || hasCostOfRevenue;
    const isCashFlowStatement = hasOperatingCashFlow || hasCapEx;
    
    if (isDisclosureTable || (!isIncomeStatement && !isCashFlowStatement)) {
      continue;
    }
    
    // Match "Three Months Ended", "3 Months Ended", "3-Month Period Ended", "Quarter Ended"
    const hasThreeMonths = /(?:three|3)[\s-]*months?\s*(?:ended|period)|quarter\s*ended/i.test(tableHtml);
    const hasNineMonths = /nine\s*months\s*ended|year.*date|ytd/i.test(tableHtml);
    const hasFiscalYear = /fiscal\s*year|fiscal\s*\d{4}|twelve\s*months\s*ended|year[s]?\s*ended|for\s+the\s+(?:fiscal\s+)?year\s+ended/i.test(tableHtml);
    // Check for dates anywhere in table (headers often span multiple rows/cells)
    const hasDateContext = /(?:20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(tableHtml);
    
    if (!hasDateContext) {
      logger.recordTable(false, 'Missing date context in headers');
      continue;
    }
    
    let isValid = false;
    let rejectionReason: string | undefined;
    
    if (extractionIntent.expectsQuarterly || extractionIntent.acceptsQuarterlyFromTables) {
      if (hasThreeMonths) {
        isValid = true;
        logger.recordTable(true);
        onProgress?.('Quarterly table found', {
          type: hasRevenue ? 'consolidated_income_statement' : (hasEPS ? 'income_statement_eps' : 'income_statement'),
          hasYtdColumns: hasNineMonths,
        });
      } else if (hasNineMonths && !hasThreeMonths) {
        rejectionReason = 'Contains only YTD data (no quarterly columns)';
      } else {
        rejectionReason = 'Missing "Three Months Ended" label';
      }
    }
    
    if (extractionIntent.expectsAnnual || extractionIntent.acceptsAnnualFromTables) {
      // Accept if table has annual columns - may also have quarterly/YTD (we filter to annual)
      if (hasFiscalYear) {
        isValid = true;
        logger.recordTable(true);
        onProgress?.('Annual table found', {
          type: hasRevenue ? 'consolidated_income_statement' : (hasEPS ? 'income_statement_eps' : 'income_statement'),
        });
      } else {
        rejectionReason = 'Missing "Fiscal Year" or "Year Ended" label';
      }
    }
    
    if (isValid) {
      // Score: income statement tables first, then cash flow
      const score = isIncomeStatement
        ? (hasRevenue ? 4 : 0) + (hasCostOfRevenue ? 2 : 0) + (hasIncome ? 2 : 0) + (hasEPS ? 1 : 0)
        : (hasOperatingCashFlow ? 3 : 0) + (hasCapEx ? 2 : 0);
      validTables.push({ tableHtml, score });
    } else if (rejectionReason) {
      logger.recordTable(false, rejectionReason);
    }
  }
  
  logger.logSummary();
  
  // Sort by score descending - process main income statement (revenue, costs) before EPS-only tables
  validTables.sort((a, b) => b.score - a.score);
  return validTables.map(t => t.tableHtml);
}

/**
 * Column period classification
 */
type ColumnPeriodType = 'quarterly' | 'ytd' | 'annual' | 'unknown';

interface ColumnInfo {
  index: number;
  periodType: ColumnPeriodType;
  headerText: string;
}

/**
 * Classify table columns by period type (deterministic, pre-AI)
 */
function classifyTableColumns(tableHtml: string): {
  columns: ColumnInfo[];
  quarterlyCount: number;
  ytdCount: number;
  annualCount: number;
} {
  const columns: ColumnInfo[] = [];

  // 10-K tables often have multi-row headers: "Year Ended" in one row, date-only cells (e.g. "January 28, 2024") in the next.
  // Date-only cells would otherwise match the quarterly pattern. When the table has annual context, treat them as annual.
  const tableHasAnnualContext = /fiscal\s*year|fiscal\s*\d{4}|twelve\s*months\s*ended|year[s]?\s*ended|for\s+the\s+(?:fiscal\s+)?year[s]?\s+ended/i.test(tableHtml);
  const tableHasQuarterlyContext = /(?:three|3)[\s-]*months?\s*(?:ended|period)|quarter\s*ended/i.test(tableHtml);
  
  // Extract header row(s) - look for <thead> or first <tr> with <th> elements
  // Try multiple patterns to handle different table structures
  let headerHtml: string | null = null;
  
  // Pattern 1: <thead> with nested rows
  const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  if (theadMatch) {
    // Get all rows within thead, look for one with <th> elements
    const theadRows = theadMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (theadRows) {
      // Find the row with the most <th> elements (likely the header)
      let maxThCount = 0;
      let bestRow = '';
      for (const row of theadRows) {
        const thCount = (row.match(/<th[^>]*>/gi) || []).length;
        if (thCount > maxThCount) {
          maxThCount = thCount;
          bestRow = row;
        }
      }
      if (bestRow) {
        headerHtml = bestRow;
      }
    }
  }
  
  // Pattern 2: First <tr> with <th> elements (if no thead found)
  if (!headerHtml) {
    const trMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (trMatches) {
      for (const row of trMatches) {
        if (row.match(/<th[^>]*>/i)) {
          headerHtml = row;
          break;
        }
      }
    }
  }

  // Pattern 3: iXBRL tables use <td> only (no <th>) - find row with period labels (dates, "Three Months", "Year Ended")
  if (!headerHtml) {
    const trMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (trMatches) {
      const periodPatterns = [
        /(?:three|3)[\s-]*months|quarter\s*ended|year[s]?\s*ended|fiscal\s*year/i,
        /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\s+\d{1,2},?\s*\d{4}/i,
        /^20\d{2}$|^fy\s*20\d{2}$/i,
      ];
      let bestScore = 0;
      for (let i = 0; i < Math.min(trMatches.length, 8); i++) {
        const row = trMatches[i];
        const cellPattern = /<(?:th|td)(?:\s[^>]*)?>([\s\S]*?)<\/(?:th|td)>/gi;
        let cell; let score = 0;
        while ((cell = cellPattern.exec(row)) !== null) {
          const text = cell[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ').trim();
          if (text.length >= 3) {
            if (periodPatterns.some(p => p.test(text))) score++;
          }
        }
        if (score > bestScore) { bestScore = score; headerHtml = row; }
      }
    }
  }

  // Pattern 4: Multi-row headers - when "Three Months" and "Nine Months" are in a PARENT row, use it for classification
  // Income statements often have: Row1: [empty]|Three Months Ended (colspan 2)|Nine Months Ended (colspan 2)
  //                               Row2: [empty]|Oct 26, 2025|Oct 27, 2024|Oct 26, 2025|Oct 27, 2024
  // We must classify cols 1-2 as quarterly and 3-4 as YTD. Pattern 3 picks the date row and marks all as quarterly.
  let multiRowPeriodTypes: Array<ColumnPeriodType> | undefined;
  if (headerHtml && tableHasQuarterlyContext && /nine\s*months|six\s*months/i.test(tableHtml)) {
    const trMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    const periodTypeRow = trMatches?.find((row) => {
      const hasThreeMonths = /(?:three|3)[\s-]*months?\s*(?:ended|period)/i.test(row);
      const hasNineMonths = /(?:nine|9)[\s-]*months?\s*(?:ended|period)/i.test(row);
      const hasSixMonths = /(?:six|6)[\s-]*months?\s*(?:ended|period)/i.test(row);
      return (hasThreeMonths && (hasNineMonths || hasSixMonths)) || hasNineMonths || hasSixMonths;
    });
    if (periodTypeRow) {
      const cellTagPattern = /<(?:th|td)(\s[^>]*)?>([\s\S]*?)<\/(?:th|td)>/gi;
      let cellMatch;
      let colIndex = 0;
      const colToPeriod: Array<ColumnPeriodType> = [];
      while ((cellMatch = cellTagPattern.exec(periodTypeRow)) !== null) {
        const attrs = cellMatch[1] || '';
        const text = (cellMatch[2] || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ').trim();
        const colspan = parseInt(attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1] || '1', 10) || 1;
        let periodType: ColumnPeriodType = 'unknown';
        if (/(?:nine|9)[\s-]*months|year\s*to\s*date|\bytd\b/i.test(text)) periodType = 'ytd';
        else if (/(?:six|6)[\s-]*months/i.test(text)) periodType = 'ytd';
        else if (/(?:three|3)[\s-]*months|quarter\s*ended/i.test(text)) periodType = 'quarterly';
        for (let c = 0; c < colspan; c++) {
          colToPeriod[colIndex++] = periodType;
        }
      }
      if (colToPeriod.length > 0 && colToPeriod.some((p) => p === 'quarterly' || p === 'ytd')) {
        multiRowPeriodTypes = colToPeriod;
      }
    }
  }
  
  if (!headerHtml) {
    return { columns: [], quarterlyCount: 0, ytdCount: 0, annualCount: 0 };
  }

  // Pattern 4 result: use pre-computed column->period map (handles colspan in Three Months / Nine Months rows)
  if (multiRowPeriodTypes && multiRowPeriodTypes.length > 0) {
    const columns: ColumnInfo[] = multiRowPeriodTypes
      .map((periodType, index) => ({ index, periodType, headerText: '' }))
      .filter((c) => c.periodType !== 'unknown');
    const quarterlyCount = columns.filter((c) => c.periodType === 'quarterly').length;
    const ytdCount = columns.filter((c) => c.periodType === 'ytd').length;
    const annualCount = columns.filter((c) => c.periodType === 'annual').length;
    return { columns, quarterlyCount, ytdCount, annualCount };
  }
  
  // Extract all <th> or <td> elements from header
  const cellPattern = /<(?:th|td)(?:\s[^>]*)?>([\s\S]*?)<\/(?:th|td)>/gi;
  let match;
  let index = 0;
  
  while ((match = cellPattern.exec(headerHtml)) !== null) {
    const cellText = match[1]
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&#160;/g, ' ')
      .trim();
    
    if (!cellText || cellText.length < 3) {
      index++;
      continue; // Skip empty cells
    }
    
    // Classify column based on header text
    let periodType: ColumnPeriodType = 'unknown';
    
    const normalizedText = cellText.toLowerCase();
    
    // Annual tables (10-K): "Year Ended" is often in a parent row; child row cells are date-only ("January 28, 2024") or year-only ("2024").
    // Treat date-only and year-only cells as annual when the table has annual context and no explicit quarterly label in the cell.
    const trimmedCell = cellText.trim();
    const isDateOnlyCell = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\s+\d{1,2},?\s*\d{4}$/i.test(trimmedCell);
    const isYearOnlyCell = /^(?:fy\s*)?20\d{2}$/i.test(trimmedCell); // "2024", "2023", "FY 2024"
    if (periodType === 'unknown' && tableHasAnnualContext && !tableHasQuarterlyContext && (isDateOnlyCell || isYearOnlyCell)) {
      periodType = 'annual';
    }

    // Quarterly indicators - handle many variations
    // Pattern variations: "Three Months Ended", "3 Months Ended", "3-Month Period Ended", "Quarter Ended"
    if (periodType === 'unknown' && (
      /(?:three|3)[\s-]*months?\s*(?:ended|period)/i.test(cellText) ||
      /quarter\s*ended/i.test(cellText) ||
      /quarterly\s*(?:results?|period)/i.test(cellText) ||
      /^q[1-4]\s/i.test(cellText) ||
      /^q[1-4]$/i.test(cellText) ||  // Just "Q1", "Q2", etc.
      (/\bq[1-4]\b/i.test(cellText) && !/ytd|year.*to.*date|nine\s*months|six\s*months/i.test(cellText)) ||
      // Handle dates like "Oct 27, 2024" in context of quarterly headers (only when NOT annual-only table)
      (!tableHasAnnualContext || tableHasQuarterlyContext) &&
      /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{1,2},?\s*\d{4}/i.test(cellText)
    )) {
      // Extra check: make sure it's not actually YTD or annual disguised
      if (!/(?:six|6|nine|9|twelve|12)\s*months/i.test(cellText) && 
          !/year\s*(?:ended|to\s*date)/i.test(cellText) &&
          !/\bytd\b/i.test(cellText)) {
        periodType = 'quarterly';
      }
    }
    // YTD indicators - handle both numeric and text forms
    if (periodType === 'unknown' && (
      /(?:six|6)[\s-]*months?\s*(?:ended|period)/i.test(cellText) ||
      /(?:nine|9)[\s-]*months?\s*(?:ended|period)/i.test(cellText) ||
      /year\s*to\s*date/i.test(cellText) ||
      /\bytd\b/i.test(cellText)
    )) {
      periodType = 'ytd';
    }
    // Annual indicators
    if (periodType === 'unknown' && (
      /(?:twelve|12)[\s-]*months?\s*(?:ended|period)/i.test(cellText) ||
      /fiscal\s*year|fiscal\s*\d{4}/i.test(cellText) ||
      /year\s*ended/i.test(cellText) ||
      /^fy\s*\d{4}/i.test(cellText) ||
      /full\s*year/i.test(cellText) ||
      /annual/i.test(cellText)
    )) {
      periodType = 'annual';
    }
    
    columns.push({
      index,
      periodType,
      headerText: cellText,
    });
    
    index++;
  }
  
  const quarterlyCount = columns.filter(c => c.periodType === 'quarterly').length;
  const ytdCount = columns.filter(c => c.periodType === 'ytd').length;
  const annualCount = columns.filter(c => c.periodType === 'annual').length;
  
  if (columns.length === 0) {
    // No columns extracted - header structure may be non-standard
  }
  
  return { columns, quarterlyCount, ytdCount, annualCount };
}

/**
 * Filter table HTML to only include columns of specified period type
 * Physically removes unwanted columns from DOM
 */
function filterTableColumns(
  tableHtml: string,
  allowedPeriodTypes: ColumnPeriodType[],
  onProgress?: CanonicalPipelineCallback
): { filteredHtml: string; removedCount: number } {
  const classification = classifyTableColumns(tableHtml);
  
  // Find column indices to keep - ALWAYS include column 0 (row labels) for income statement tables
  const periodColumns = classification.columns
    .filter(col => allowedPeriodTypes.includes(col.periodType))
    .map(col => col.index);
  // Always keep column 0 - it contains row labels (Revenue, EPS, etc.); classification may skip it if header was empty
  const columnsToKeep = [...new Set([0, ...periodColumns])].sort((a, b) => a - b);
  
  if (periodColumns.length === 0) {
    // No columns match - return empty table
    return { filteredHtml: '', removedCount: classification.columns.length };
  }
  
  // Parse table and remove unwanted columns
  // Strategy: Use regex to match table structure and remove columns by index
  
  // For simplicity, we'll use a DOM-like approach with regex
  // This is a simplified parser - for production, consider using a proper HTML parser
  
  // Split table into rows
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: string[] = [];
  let rowMatch;
  
  while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
    rows.push(rowMatch[0]);
  }
  
  if (rows.length === 0) {
    return { filteredHtml: tableHtml, removedCount: 0 };
  }

  // Get total column count from first row (for removedCount)
  const firstRowCells = (rows[0].match(/<(?:th|td)[\s>]/gi) || []).length;
  
  // Process each row to remove unwanted columns
  const filteredRows = rows.map((row, rowIndex) => {
    const cellPattern = /<(?:th|td)([^>]*)>([\s\S]*?)<\/(?:th|td)>/gi;
    const cells: Array<{ fullMatch: string; index: number }> = [];
    let cellMatch;
    let cellIndex = 0;
    
    while ((cellMatch = cellPattern.exec(row)) !== null) {
      cells.push({
        fullMatch: cellMatch[0],
        index: cellIndex++,
      });
    }
    
    // Filter cells to keep only allowed columns
    const filteredCells = cells
      .filter((_, idx) => columnsToKeep.includes(idx))
      .map(c => c.fullMatch);
    
    // Reconstruct row
    const rowStart = row.match(/<tr[^>]*>/)?.[0] || '<tr>';
    const rowEnd = '</tr>';
    
    return rowStart + filteredCells.join('') + rowEnd;
  });
  
  // Reconstruct table
  const tableStart = tableHtml.match(/<table[^>]*>/)?.[0] || '<table>';
  const tableEnd = '</table>';
  const filteredHtml = tableStart + filteredRows.join('') + tableEnd;
  
  const removedCount = Math.max(0, firstRowCells - columnsToKeep.length);
  
  onProgress?.('Table columns filtered', {
    total: classification.columns.length,
    kept: columnsToKeep.length,
    removed: removedCount,
    quarterly: classification.quarterlyCount,
    ytd: classification.ytdCount,
    annual: classification.annualCount,
  });
  
  return { filteredHtml, removedCount };
}

/**
 * STEP 4: Table Normalization with Column Filtering
 * Convert HTML tables to structured plain text with fingerprinting
 * Filters to only quarterly columns for quarterly extraction
 */
function normalizeTable(
  tableHtml: string,
  extractionIntent: FilingExtractionIntent,
  onProgress?: CanonicalPipelineCallback
): { structuredText: string; fingerprint: string; columnStats: { quarterly: number; ytd: number; annual: number } } {
  onProgress?.('Normalizing table', {});
  const debugExtraction = process.env.DEBUG_EXTRACTION === '1';

  // Classify columns first
  const classification = classifyTableColumns(tableHtml);
  if (debugExtraction) {
    console.log('[Pipeline] classifyTableColumns:', {
      columnCount: classification.columns.length,
      quarterly: classification.quarterlyCount,
      annual: classification.annualCount,
      ytd: classification.ytdCount,
      sampleHeaders: classification.columns.slice(0, 5).map(c => ({ idx: c.index, type: c.periodType, text: c.headerText?.slice(0, 40) })),
    });
  }
  
  
  // Filter table based on extraction intent
  let filteredHtml = tableHtml;
  let removedCount = 0;
  
  if (extractionIntent.expectsQuarterly || extractionIntent.acceptsQuarterlyFromTables) {
    // For quarterly extraction, remove YTD and annual columns
    const filterResult = filterTableColumns(tableHtml, ['quarterly'], onProgress);
    filteredHtml = filterResult.filteredHtml;
    removedCount = filterResult.removedCount;
    if (debugExtraction) {
      console.log('[Pipeline:Filter] Quarterly', { removedCount, filteredLength: filteredHtml?.length ?? 0 });
    }
    if (!filteredHtml || filteredHtml.trim().length < 100) {
      // No quarterly columns were identified by classifier
      // FALLBACK: Try with original table and let AI filter
      // This handles cases where headers don't match our patterns exactly
      if (classification.columns.length > 0) {
        onProgress?.('Column classification fallback - trying original table', {
          originalColumns: classification.columns.length,
          quarterlyColumns: classification.quarterlyCount,
          reason: 'No columns matched quarterly patterns, but table has "Three Months Ended" label',
        });
        // Use original table - AI has strict instructions to only extract quarterly
        filteredHtml = tableHtml;
        removedCount = 0;
      } else {
        // No columns at all - truly empty table
        onProgress?.('No columns found in table', {
          originalColumns: classification.columns.length,
        });
        return {
          structuredText: '',
          fingerprint: '',
          columnStats: {
            quarterly: classification.quarterlyCount,
            ytd: classification.ytdCount,
            annual: classification.annualCount,
          },
        };
      }
    }
  } else if (extractionIntent.expectsAnnual || extractionIntent.acceptsAnnualFromTables) {
    // For annual extraction, remove quarterly and YTD columns
    const filterResult = filterTableColumns(tableHtml, ['annual'], onProgress);
    filteredHtml = filterResult.filteredHtml;
    removedCount = filterResult.removedCount;
    if (debugExtraction) {
      console.log('[Pipeline:Filter] Annual', { removedCount, filteredLength: filteredHtml?.length ?? 0 });
    }

    // FALLBACK: When no annual columns identified but table has "Year Ended", use original table
    // Handles non-standard header layout (e.g. merged cells, iXBRL structure)
    if ((!filteredHtml || filteredHtml.trim().length < 100) && classification.columns.length > 0) {
      const hasYearEndedInTable = /fiscal\s*year|fiscal\s*\d{4}|twelve\s*months\s*ended|year\s*ended/i.test(tableHtml);
      if (hasYearEndedInTable) {
        onProgress?.('Column classification fallback - trying original table', {
          originalColumns: classification.columns.length,
          annualColumns: classification.annualCount,
          reason: 'No columns matched annual patterns, but table has "Year Ended" label',
        });
        filteredHtml = tableHtml;
        removedCount = 0;
      }
    }
  }
  
  const structuredText = tableToStructuredText(filteredHtml);
  if (debugExtraction) {
    console.log('[Pipeline:TableToStructuredText]', {
      filteredHtmlLength: filteredHtml?.length ?? 0,
      structuredTextLength: structuredText?.length ?? 0,
      preview: structuredText?.slice(0, 600),
    });
  }
  // Include extraction version in fingerprint to invalidate cache when prompt/metrics change
  const fingerprint = createHash('sha256')
    .update(structuredText + '|extraction_v3')
    .digest('hex');
  
  onProgress?.('Table normalized', {
    fingerprint: fingerprint.substring(0, 16),
    structuredLength: structuredText.length,
    columnsRemoved: removedCount,
  });
  
  return {
    structuredText,
    fingerprint,
    columnStats: {
      quarterly: classification.quarterlyCount,
      ytd: classification.ytdCount,
      annual: classification.annualCount,
    },
  };
}

/**
 * STEP 5 & 6: AI Table Reader Invocation & Validation
 * Call LLM with strict contract and validate output
 */
async function extractMetricsFromTableWithAI(
  tableHtml: string,
  structuredText: string,
  tableFingerprint: string,
  filingId: string,
  extractionIntent: FilingExtractionIntent,
  onProgress?: CanonicalPipelineCallback
): Promise<TableExtractionAttempt> {
  onProgress?.('Invoking AI table reader', {
    tableFingerprint: tableFingerprint.substring(0, 16),
  });
  
  try {
    // Check cache first (by fingerprint)
    // Wrap in try-catch in case table doesn't exist yet
    let cached: any = null;
    try {
      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('ai_extraction_cache')
        .select('ai_output, extracted_metrics')
        .eq('table_fingerprint', tableFingerprint)
        .maybeSingle(); // Use maybeSingle() to avoid error when no row exists
      
      // Only use cached if no error and data exists
      if (!error && data) {
        cached = data;
      }
    } catch (cacheError) {
      // Cache table might not exist - continue without cache
      onProgress?.('Cache check failed, proceeding without cache', {
        error: cacheError instanceof Error ? cacheError.message : 'Unknown error',
      });
    }
    
    if (cached) {
      onProgress?.('Using cached AI extraction', {
        tableFingerprint: tableFingerprint.substring(0, 16),
      });
      
      const parsed = parseExtractionResponse(cached.ai_output || '{}');
      return {
        tableFingerprint,
        tableHtml,
        structuredText,
        aiOutput: cached.ai_output || undefined,
        extractedMetrics: parsed.metrics,
        success: true,
      };
    }
    
    // Call AI with strict prompt - pass period scope for quarterly vs annual extraction
    const periodScope = (extractionIntent.expectsAnnual || extractionIntent.acceptsAnnualFromTables) ? 'FY' as const : 'Q' as const;
    const result = await extractMetricsFromTable(tableHtml, 'openai', structuredText, periodScope);
    
    if (result.metrics && result.metrics.length === 0 && !result.error) {
      const dbg = process.env.DEBUG_EXTRACTION === '1';
      console.warn('[Extraction] AI returned 0 metrics - table may lack row labels', {
        structuredTextLength: structuredText?.length,
        structuredTextPreview: structuredText?.slice(0, 400),
        rawOutputPreview: result.rawOutput?.slice(0, 250),
      });
      if (dbg && structuredText) {
        try {
          const { writeFileSync, mkdirSync } = await import('fs');
          const debugDir = './debug-extraction';
          mkdirSync(debugDir, { recursive: true });
          writeFileSync(
            `${debugDir}/structured-text-${tableFingerprint.slice(0, 8)}.txt`,
            `=== STRUCTURED TEXT (${structuredText.length} chars) ===\n${structuredText}\n\n=== RAW AI OUTPUT ===\n${result.rawOutput || 'none'}`,
            'utf8'
          );
          console.log('[Extraction] Debug dump written to debug-extraction/');
        } catch (_) { /* ignore */ }
      }
    }
    
    if (result.error) {
      const errorMessage = result.error.includes('timeout') 
        ? 'AI request timed out (30s limit)'
        : result.error.includes('API error')
        ? 'AI API error - check API key and rate limits'
        : result.error;
      
      console.error('[Extraction] AI error:', result.error);
      
      onProgress?.('AI extraction failed', {
        error: errorMessage,
        tableSize: tableHtml.length,
        details: result.error,
      });
      
      return {
        tableFingerprint,
        tableHtml,
        structuredText,
        error: errorMessage,
        extractedMetrics: [],
        success: false,
      };
    }
    
    // Get filing type for validation
    const supabase = createServerClient();
    const { data: filingData } = await supabase
      .from('filings')
      .select('filing_type')
      .eq('id', filingId)
      .single();
    
    const filingTypeForValidation = (filingData?.filing_type || '10-Q') as SupportedFilingType;
    const extractionIntentForValidation = FILING_EXTRACTION_INTENT[filingTypeForValidation];
    
    // Validate AI output (STEP 6: Zero Trust Validation - Filing-Type-Aware)
    const validation = validateAIOutput(
      result.metrics,
      filingId,
      filingTypeForValidation,
      extractionIntentForValidation
    );
    if (!validation.valid) {
      console.error('[Extraction] Validation failed:', validation.error);
      
      onProgress?.('AI output validation failed', {
        reason: validation.error,
        metricsCount: result.metrics.length,
        metrics: result.metrics.map(m => ({
          metric: m.metric,
          period_scope: m.period_scope,
          period_label: m.period_label,
          value: m.value,
        })),
      });
      
      return {
        tableFingerprint,
        tableHtml,
        structuredText,
        aiOutput: result.rawOutput || undefined,
        error: validation.error,
        extractedMetrics: [],
        success: false,
      };
    }
    
    // Cache successful extraction (non-critical, ignore errors)
    try {
      const supabase = createServerClient();
      await supabase
        .from('ai_extraction_cache')
        .insert({
          table_fingerprint: tableFingerprint,
          ai_output: result.rawOutput || '',
          extracted_metrics: result.metrics,
          created_at: new Date().toISOString(),
        });
    } catch (cacheError) {
      // Cache insert failed - non-critical, continue
      onProgress?.('Cache insert failed (non-critical)', {
        error: cacheError instanceof Error ? cacheError.message : 'Unknown error',
      });
    }
    
    // Log what metrics were extracted
    const extractedMetricTypes = result.metrics.map(m => m.metric);
    onProgress?.('AI extraction successful', {
      metricsExtracted: result.metrics.length,
      metricTypes: extractedMetricTypes,
    });
    
    
    return {
      tableFingerprint,
      tableHtml,
      structuredText,
      aiOutput: result.rawOutput || undefined,
      extractedMetrics: result.metrics,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? (error.message.includes('timeout') 
          ? 'AI request timed out'
          : error.message.includes('AbortError')
          ? 'AI request cancelled'
          : error.message)
      : 'Unknown error';
    
      console.error('[Extraction] Error:', errorMessage);
      
      onProgress?.('AI extraction failed', { error: errorMessage });
    
    return {
      tableFingerprint,
      tableHtml,
      structuredText,
      error: `AI extraction failed: ${errorMessage}`,
      extractedMetrics: [],
      success: false,
    };
  }
}

/**
 * STEP 6: Zero Trust AI Output Validation (Filing-Type-Aware)
 */
function validateAIOutput(
  metrics: TableExtractedMetric[],
  filingId: string,
  filingType: SupportedFilingType,
  extractionIntent: FilingExtractionIntent
): { valid: boolean; error?: string } {
  if (!Array.isArray(metrics)) {
    return { valid: false, error: 'Metrics must be an array' };
  }
  if (metrics.length === 0) {
    return { valid: false, error: 'AI returned 0 metrics - table may lack row labels or period columns' };
  }
  
  // Allowed metrics from filing tables (income statement + cash flow)
  const ALLOWED_METRICS = [
    'eps_diluted', 'eps_basic', 'revenue', 'cost_of_revenue', 'gross_profit',
    'operating_income', 'net_income', 'operating_cash_flow', 'capital_expenditures',
  ] as const;
  
  for (const metric of metrics) {
    // Validate metric type
    if (!ALLOWED_METRICS.includes(metric.metric as any)) {
      return {
        valid: false,
        error: `Invalid metric type: ${metric.metric}. Allowed: ${ALLOWED_METRICS.join(', ')}`,
      };
    }
    
    // Filing-type-aware period scope validation
    if (metric.period_scope === 'Q') {
      // Quarterly metrics
      if (!extractionIntent.acceptsQuarterlyFromTables) {
        return {
          valid: false,
          error: `Filing type ${filingType} does not accept quarterly metrics. Period scope: ${metric.period_scope}`,
        };
      }
      
      // Validate period label indicates a quarterly period
      // Accept multiple variations:
      // - "Three Months Ended"
      // - "3 Months Ended"
      // - "Quarter Ended"
      // - "3-Month Period Ended"
      // - Date formats like "October 27, 2024" (when period_scope is Q)
      const isQuarterlyLabel = 
        /(?:three|3)[\s-]*months?\s*(?:ended|period)/i.test(metric.period_label) ||
        /quarter\s*ended/i.test(metric.period_label) ||
        /quarterly/i.test(metric.period_label) ||
        /^q[1-4]\b/i.test(metric.period_label) ||
        // Accept date-only labels when period_scope is explicitly Q
        /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{1,2},?\s*\d{4}/i.test(metric.period_label);
      
      // Make sure it's NOT a YTD or annual label
      const isNotQuarterly = 
        /(?:six|6|nine|9|twelve|12)\s*months/i.test(metric.period_label) ||
        /year\s*(?:ended|to\s*date)/i.test(metric.period_label) ||
        /fiscal\s*year/i.test(metric.period_label) ||
        /\bytd\b/i.test(metric.period_label);
      
      if (isNotQuarterly) {
        return {
          valid: false,
          error: `Period label appears to be YTD/annual, not quarterly: ${metric.period_label}`,
        };
      }
      
      // For 6-K specifically, be stricter
      if (filingType === '6-K' && !isQuarterlyLabel) {
        return {
          valid: false,
          error: `6-K filing requires clear quarterly period label: ${metric.period_label}`,
        };
      }
      
      // For other filing types, accept if period_scope is Q and not clearly YTD/annual
      // This allows AI to extract even when labels don't match our exact patterns
    } else if (metric.period_scope === 'FY') {
      // Annual metrics
      if (!extractionIntent.acceptsAnnualFromTables) {
        return {
          valid: false,
          error: `Filing type ${filingType} does not accept annual metrics. Period scope: ${metric.period_scope}`,
        };
      }
      
      // Reject quarterly period labels for annual metrics
      if (/three\s*months|quarter\s*ended|nine\s*months/i.test(metric.period_label)) {
        return {
          valid: false,
          error: `Annual metric has quarterly period label: ${metric.period_label}`,
        };
      }
    } else {
      // Reject YTD/TTM
      return {
        valid: false,
        error: `Invalid period scope: ${metric.period_scope} (only Q or FY allowed)`,
      };
    }
    
    // Validate value is a number
    if (typeof metric.value !== 'number' || !isFinite(metric.value)) {
      return {
        valid: false,
        error: `Invalid value: ${metric.value}`,
      };
    }
    
    // Validate confidence
    if (
      metric.confidence !== 'high' &&
      metric.confidence !== 'medium' &&
      metric.confidence !== 'low'
    ) {
      return {
        valid: false,
        error: `Invalid confidence: ${metric.confidence}`,
      };
    }
  }
  
  return { valid: true };
}

/** Parse date from period label like "Three Months Ended October 27, 2024" or "Oct 27, 2024" or "FY2025" */
function parseDateFromPeriodLabel(periodLabel: string): Date | null {
  const monthNames: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m1 = periodLabel.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\s+(\d{1,2}),?\s*(\d{4})/i);
  if (m1) {
    const month = monthNames[m1[1].toLowerCase().slice(0, 3)] ?? -1;
    const day = parseInt(m1[2], 10);
    const year = parseInt(m1[3], 10);
    if (month >= 0 && month <= 11 && !isNaN(day) && !isNaN(year)) return new Date(year, month, day);
  }
  const m2 = periodLabel.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(parseInt(m2[1], 10), parseInt(m2[2], 10) - 1, parseInt(m2[3], 10));
  const m3 = periodLabel.match(/(?:fy|fiscal\s*year)\s*(\d{4})/i);
  if (m3) return new Date(parseInt(m3[1], 10), 11, 31); // Use Dec 31 of year for FY match
  return null;
}

/**
 * STEP 7: Metric Persistence with Full Provenance
 */
async function persistMetrics(
  metrics: TableExtractedMetric[],
  filingId: string,
  tableFingerprint: string,
  tableHtml: string,
  onProgress?: CanonicalPipelineCallback
): Promise<{ stored: number; errors: string[] }> {
  const supabase = createServerClient();
  const errors: string[] = [];
  let stored = 0;
  
  // Get filing once for all metrics
  const { data: filing } = await supabase
    .from('filings')
    .select('fiscal_year, fiscal_quarter, period_end_date, company_id')
    .eq('id', filingId)
    .single();

  if (!filing?.period_end_date || !filing?.company_id) {
    errors.push('Filing missing period_end_date or company_id');
    return { stored: 0, errors };
  }

  const filingPeriodEnd = new Date(filing.period_end_date);
  const filingYear = filingPeriodEnd.getFullYear();
  const filingMonth = filingPeriodEnd.getMonth();
  const filingDay = filingPeriodEnd.getDate();

  // Only persist explicitly stated metrics from SEC filings (no computed free_cash_flow)
  const metricsToPersist = metrics.filter(m => m.metric !== 'capital_expenditures');

  // Get fiscal year for filing (needed for annual period matching)
  let filingFiscalYear: number | null = filing?.fiscal_year ?? null;
  if (!filingFiscalYear && filing?.period_end_date) {
    const { data: company } = await supabase
      .from('companies')
      .select('fiscal_year_end_month, fiscal_year_end_day, fiscal_year_end')
      .eq('id', filing.company_id)
      .single();
    const fye = company?.fiscal_year_end_month && company?.fiscal_year_end_day
      ? { month: company.fiscal_year_end_month, day: company.fiscal_year_end_day }
      : company?.fiscal_year ? (await import('./fiscal-calendar')).parseFiscalYearEnd(String(company.fiscal_year)) : null;
    if (fye) {
      const { calculateFiscalYear } = await import('./fiscal-calendar');
      filingFiscalYear = calculateFiscalYear(new Date(filing.period_end_date), fye);
    }
  }

  for (const metric of metricsToPersist) {
    try {
      // Only persist metrics whose period_label matches filing period (avoid prior-year columns)
      const periodLabelDate = parseDateFromPeriodLabel(metric.period_label);
      const periodType: PeriodType =
        metric.period_scope === 'Q' ? 'quarterly' : 'annual';

      if (periodLabelDate) {
        if (periodType === 'quarterly') {
          // Quarterly: strict date match (year, month, day ±3)
          if (periodLabelDate.getFullYear() !== filingYear ||
              periodLabelDate.getMonth() !== filingMonth ||
              Math.abs(periodLabelDate.getDate() - filingDay) > 3) {
            continue;
          }
        } else {
          // Annual: fiscal year match only (10-K tables have multiple years; we want the filing's year)
          const labelYear = periodLabelDate.getFullYear();
          const expectedYear = filingFiscalYear ?? filingYear;
          if (labelYear !== expectedYear) continue;
        }
      } else if (periodType === 'quarterly') {
        // Quarterly with unparseable period_label - skip
        continue;
      }
      // Annual with unparseable period_label: allow (use filing's period)


      // Calculate fiscal_year and fiscal_quarter from period_end_date if not set in filing
      let fiscalYear: number | null = filing?.fiscal_year || null;
      let fiscalQuarter: number | null = filing?.fiscal_quarter || null;
      let fiscalYearEnd: { month: number; day: number } | null = null;

      if (filing?.period_end_date) {
        // Get fiscal year end from company
        const { data: company } = await supabase
          .from('companies')
          .select('fiscal_year_end_month, fiscal_year_end_day, fiscal_year_end')
          .eq('id', filing?.company_id)
          .single();
        
        // Try fiscal_year_end_month/day first
        if (company?.fiscal_year_end_month && company?.fiscal_year_end_day) {
          fiscalYearEnd = {
            month: company.fiscal_year_end_month,
            day: company.fiscal_year_end_day,
          };
        } else if (company?.fiscal_year_end) {
          // Parse from MM-DD string format
          const [monthStr, dayStr] = company.fiscal_year_end.split('-');
          const month = parseInt(monthStr, 10);
          const day = parseInt(dayStr, 10);
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            fiscalYearEnd = { month, day };
          }
        }
        
        if (fiscalYearEnd) {
          const { calculateFiscalYear, calculateFiscalQuarter } = await import('./fiscal-calendar');
          const periodEndDate = new Date(filing.period_end_date);
          
          // Calculate fiscal year if missing
          if (!fiscalYear) {
            fiscalYear = calculateFiscalYear(periodEndDate, fiscalYearEnd);
          }
          
          // Calculate fiscal quarter if missing and quarterly
          if (periodType === 'quarterly' && !fiscalQuarter) {
            fiscalQuarter = calculateFiscalQuarter(periodEndDate, fiscalYearEnd);
          }
        }
      }
      
      // Final check: if periodType is quarterly, fiscal_quarter must be set (constraint requirement)
      if (periodType === 'quarterly' && !fiscalQuarter) {
        const errorMsg = `Cannot store quarterly ${metric.metric}: fiscal_quarter is required but could not be calculated. period_end_date: ${filing?.period_end_date}, fiscalYearEnd: ${fiscalYearEnd ? `${fiscalYearEnd.month}-${fiscalYearEnd.day}` : 'not found'}`;
        console.error('[Persistence] Skipping quarterly metric - fiscal_quarter missing', {
          metric: metric.metric,
          value: metric.value,
          periodType,
          periodEndDate: filing?.period_end_date,
          fiscalYearEnd,
          companyId: filing?.company_id,
        });
        errors.push(errorMsg);
        continue;
      }
      
      // Determine unit based on metric type (USD for most, USD/shares for EPS)
      const unit = (metric.metric === 'eps_diluted' || metric.metric === 'eps_basic') 
        ? 'USD/shares' 
        : 'USD';
      
      // Only EPS is split-adjusted; all other metrics (revenue, costs, income) are not
      const splitAdjusted = (metric.metric === 'eps_diluted' || metric.metric === 'eps_basic');
      
      const periodEndDate = filing?.period_end_date;
      if (!periodEndDate || !filing?.company_id || fiscalYear === null) {
        errors.push(`Cannot store ${metric.metric}: missing period_end_date, company_id, or fiscal_year`);
        continue;
      }
      
      // Use createFinancialMetric (upsert) to avoid duplicate key errors on re-ingestion
      // fiscal_quarter must be null for annual metrics (DB constraint: fiscal_quarter_only_for_quarterly)
      const result = await createFinancialMetric({
        filingId,
        companyId: filing.company_id,
        metricType: metric.metric as MetricType,
        value: metric.value,
        unit,
        periodType,
        periodEndDate,
        fiscalYear,
        fiscalQuarter: periodType === 'quarterly' ? fiscalQuarter : null,
        accountingBasis: 'gaap',
        currency: 'USD',
        splitAdjusted,
        metadata: {
          source: 'filing_table',
          confidence: metric.confidence,
          table_fingerprint: tableFingerprint,
          row_label: metric.metric,
          column_label: metric.period_label,
          extraction_method: 'ai_table_reader',
        },
      });
      
      if (!result.success) {
        console.error('[Persistence] Failed to store metric', {
          metric: metric.metric,
          value: metric.value,
          error: result.error,
          fiscalYear,
          fiscalQuarter,
          periodType,
        });
        errors.push(`Failed to store ${metric.metric}: ${result.error}`);
      } else {
        stored++;
        onProgress?.('Metric stored', {
          metric: metric.metric,
          value: metric.value,
          period: metric.period_label,
        });
      }
    } catch (error) {
      errors.push(
        `Failed to store ${metric.metric}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
  
  return { stored, errors };
}

/**
 * CANONICAL PIPELINE: Filing → Storage → Tables → AI → Validation → Persistence
 * This is the single source of truth for metric extraction
 */
export async function executeCanonicalPipeline(
  filingId: string,
  options: {
    onProgress?: CanonicalPipelineCallback;
    skipCache?: boolean;
  } = {}
): Promise<CanonicalPipelineResult> {
  const { onProgress } = options;
  const supabase = createServerClient();
  const logs: PipelineLog[] = [];
  const errors: string[] = [];
  
  const log = (
    step: string,
    success: boolean,
    details?: any,
    metric?: string,
    reason?: string
  ) => {
    const logEntry: PipelineLog = {
      symbol: details?.ticker || 'UNKNOWN',
      filing_id: filingId,
      step,
      metric,
      reason,
      details,
      timestamp: new Date().toISOString(),
      success,
    };
    logs.push(logEntry);
    // Clean up step message for display
    const cleanStep = step
      .replace(/^Fetching filing metadata$/, 'Loading filing')
      .replace(/^Filing type validated$/, 'Validating filing')
      .replace(/^Fetching and storing filing$/, 'Downloading filing')
      .replace(/^Filing fetched and stored$/, 'Filing downloaded')
      .replace(/^Detecting financial tables$/, 'Finding tables')
      .replace(/^Table detection complete$/, 'Tables found')
      .replace(/^Normalizing table$/, 'Processing table')
      .replace(/^Table normalized$/, 'Table processed')
      .replace(/^Invoking AI table reader$/, 'Reading table')
      .replace(/^AI extraction successful$/, 'Table read')
      .replace(/^Metric stored$/, 'Metric saved')
      .replace(/^Candidate quarterly table detected$/, 'Quarterly table found')
      .replace(/^Candidate annual table detected$/, 'Annual table found')
      .replace(/^Table rejected$/, 'Table skipped');
    onProgress?.(cleanStep, { success, ...details });
  };
  
  try {
    // STEP 1: Fetch filing metadata
    log('Fetching filing metadata', true);
    const { data: filing, error: filingError } = await supabase
      .from('filings')
      .select(
        `
        *,
        company:companies(ticker, name, cik)
      `
      )
      .eq('id', filingId)
      .single();
    
    if (filingError || !filing) {
      errors.push(`Failed to fetch filing: ${filingError?.message || 'Not found'}`);
      log('Fetch filing metadata', false, { error: errors[0] });
      return {
        success: false,
        filingId,
        metricsExtracted: 0,
        metricsStored: 0,
        tablesProcessed: 0,
        errors,
        logs,
      };
    }
    
    const company = (filing as any).company;
    
    // STEP 1: Validate filing type (allowlist)
    const filingType = filing.filing_type as string;
    if (!SUPPORTED_FILINGS.includes(filingType as SupportedFilingType)) {
      const error = `Filing type ${filingType} not supported. Allowed: ${SUPPORTED_FILINGS.join(', ')}`;
      errors.push(error);
      log('Filing type validation', false, { filingType }, undefined, error);
      return {
        success: false,
        filingId,
        metricsExtracted: 0,
        metricsStored: 0,
        tablesProcessed: 0,
        errors,
        logs,
        details: {
          companyName: company.name,
          ticker: company.ticker,
          filingType: filingType,
          accessionNumber: filing.accession_number,
        },
      };
    }
    
    const extractionIntent = FILING_EXTRACTION_INTENT[filingType as SupportedFilingType];
    log('Filing type validated', true, {
      filingType,
      intent: extractionIntent.description,
      expectsQuarterly: extractionIntent.expectsQuarterly,
      expectsAnnual: extractionIntent.expectsAnnual,
    });
    
    // STEP 2: Fetch and store raw HTML
    log('Fetching and storing filing', true, {
      ticker: company.ticker,
      accessionNumber: filing.accession_number,
      filingType,
    });
    
    const fetchResult = await fetchAndStoreFiling(
      filing.accession_number,
      company.cik,
      filingId,
      onProgress
    );
    
    if (!fetchResult.success || !fetchResult.rawHtml) {
      errors.push(fetchResult.error || 'Failed to fetch filing');
      log('Fetch and store filing', false, { error: errors[errors.length - 1] });
      return {
        success: false,
        filingId,
        metricsExtracted: 0,
        metricsStored: 0,
        tablesProcessed: 0,
        errors,
        logs,
        details: {
          companyName: company.name,
          ticker: company.ticker,
          filingType: filing.filing_type,
          accessionNumber: filing.accession_number,
        },
      };
    }
    
    // STEP 3: Detect financial tables (filing-type-aware)
    log('Detecting financial tables', true);
    const tables = detectFinancialTables(
      fetchResult.rawHtml,
      filingType as SupportedFilingType,
      extractionIntent,
      onProgress
    );

    if (tables.length === 0) {
      const reason = extractionIntent.expectsQuarterly
        ? 'No quarterly income statement tables found'
        : extractionIntent.expectsAnnual
        ? 'No annual income statement tables found'
        : 'No qualifying financial tables found';
      
      log('No qualifying tables found', false, {}, undefined, reason);
      
      // STEP 8: Log quarterly EPS miss for 10-Q filings
      if (filingType === '10-Q' || filingType === '6-K') {
        log('Quarterly EPS miss - no tables', false, {
          filingType,
          expectsQuarterly: extractionIntent.expectsQuarterly,
        }, 'eps_diluted', reason);
      }
      
      return {
        success: true,
        filingId,
        metricsExtracted: 0,
        metricsStored: 0,
        tablesProcessed: 0,
        errors: [reason],
        logs,
        details: {
          companyName: company.name,
          ticker: company.ticker,
          filingType: filing.filing_type,
          accessionNumber: filing.accession_number,
        },
      };
    }
    
    // STEP 4-7: Process each table (sorted by richness - revenue tables first)
    // Limit to 8 tables for comprehensive extraction (revenue, costs, income, EPS)
    const maxTables = 8;
    const tablesToProcess = tables.slice(0, maxTables);
    
    if (tables.length > maxTables) {
      onProgress?.('Limiting table processing', {
        total: tables.length,
        processing: maxTables,
      });
    }
    
    let totalExtracted = 0;
    let totalStored = 0;
    
    for (let tableIdx = 0; tableIdx < tablesToProcess.length; tableIdx++) {
      const tableHtml = tablesToProcess[tableIdx];

      // STEP 4: Normalize table with column filtering
      const normalizeResult = normalizeTable(
        tableHtml,
        extractionIntent,
        onProgress
      );

      // Skip if no columns of expected period type remain after filtering
      const hasExpectedColumns = extractionIntent.expectsAnnual || extractionIntent.acceptsAnnualFromTables
        ? normalizeResult.columnStats.annual > 0
        : (normalizeResult.columnStats.quarterly > 0 || normalizeResult.columnStats.ytd > 0);
      if (!normalizeResult.structuredText || normalizeResult.structuredText.length < 100 || !hasExpectedColumns) {
        log('Table skipped - no matching period columns', false, {
          quarterly: normalizeResult.columnStats.quarterly,
          ytd: normalizeResult.columnStats.ytd,
          annual: normalizeResult.columnStats.annual,
        });
        continue;
      }
      
      // STEP 5 & 6: Extract with AI and validate
      const extractionResult = await extractMetricsFromTableWithAI(
        tableHtml,
        normalizeResult.structuredText,
        normalizeResult.fingerprint,
        filingId,
        extractionIntent,
        onProgress
      );
      
      if (!extractionResult.success) {
        console.error('[Pipeline] AI extraction failed for table', {
          error: extractionResult.error,
          tableFingerprint: normalizeResult.fingerprint.substring(0, 16),
          hasStructuredText: !!normalizeResult.structuredText,
          structuredTextLength: normalizeResult.structuredText?.length || 0,
        });
        log(
          'AI extraction failed',
          false,
          { tableFingerprint: normalizeResult.fingerprint.substring(0, 16) },
          undefined,
          extractionResult.error
        );
        errors.push(
          `Table extraction failed: ${extractionResult.error}`
        );
        
        // Don't log individual failures - will be summarized at end
        continue;
      }
      
      
      totalExtracted += extractionResult.extractedMetrics.length;
      
      // STEP 7: Persist metrics
      if (extractionResult.extractedMetrics.length > 0) {
        // Log what we're about to persist
        onProgress?.('Attempting to persist metrics', {
          count: extractionResult.extractedMetrics.length,
          metrics: extractionResult.extractedMetrics.map(m => ({
            metric: m.metric,
            value: m.value,
            period_scope: m.period_scope,
            period_label: m.period_label,
            confidence: m.confidence,
          })),
        });
        
        
        const persistResult = await persistMetrics(
          extractionResult.extractedMetrics,
          filingId,
          normalizeResult.fingerprint,
          tableHtml,
          onProgress
        );
        
        
        totalStored += persistResult.stored;
        errors.push(...persistResult.errors);
        
        log(
          'Metrics persisted',
          persistResult.errors.length === 0,
          {
            stored: persistResult.stored,
            attempted: extractionResult.extractedMetrics.length,
            errors: persistResult.errors,
          }
        );
        
        // Log detailed errors if any
        if (persistResult.errors.length > 0) {
          persistResult.errors.forEach((error) => {
            onProgress?.('Metric persistence error', {
              error,
            });
          });
        }
      }
    }
    
    // STEP 8: Final summary for quarterly filings
    if ((filingType === '10-Q' || filingType === '6-K') && extractionIntent.expectsQuarterly) {
      const hasQuarterlyStored = totalStored > 0;
      
      if (!hasQuarterlyStored) {
        const summary = totalExtracted === 0 
          ? `No quarterly EPS extracted from ${tablesToProcess.length} table(s)`
          : `No quarterly EPS stored (${totalExtracted} extracted, 0 stored)`;
        
        log('Quarterly EPS extraction failed', false, {
          filingType,
          tablesProcessed: tablesToProcess.length,
          metricsExtracted: totalExtracted,
          metricsStored: totalStored,
          summary,
        }, 'eps_diluted', summary);
      } else {
        log('Quarterly EPS extracted successfully', true, {
          filingType,
          metricsStored: totalStored,
        });
      }
    }
    
    // Log summary of what was extracted
    if (totalStored > 0) {
      const { data: storedMetrics } = await supabase
        .from('financial_metrics')
        .select('metric_type')
        .eq('filing_id', filingId)
        .eq('period_type', 'quarterly');
      
      const metricTypes = storedMetrics?.map(m => m.metric_type) || [];
      log('Pipeline completed successfully', true, {
        metricsStored: totalStored,
        metricTypes: [...new Set(metricTypes)],
      });
    } else {
      log('Pipeline completed with no metrics stored', false, {
        tablesProcessed: tablesToProcess.length,
        metricsExtracted: totalExtracted,
        errors: errors.slice(0, 3), // Show first 3 errors
      });
    }
    
    return {
      success: errors.length === 0 || totalStored > 0,
      filingId,
      metricsExtracted: totalExtracted,
      metricsStored: totalStored,
      tablesProcessed: tables.length,
      errors,
      logs,
      details: {
        companyName: company.name,
        ticker: company.ticker,
        filingType: filing.filing_type,
        accessionNumber: filing.accession_number,
      },
    };
  } catch (error) {
    errors.push(
      `Pipeline execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    log('Pipeline execution', false, {}, undefined, errors[errors.length - 1]);
    
    return {
      success: false,
      filingId,
      metricsExtracted: 0,
      metricsStored: 0,
      tablesProcessed: 0,
      errors,
      logs,
    };
  }
}
