// Filing Ingestion Orchestrator
// Coordinates the complete pipeline: fetch → parse → store

import {
  getCompanyInfo,
  getRecentFilings,
  getFilingContent,
  getFilingDocumentUrl,
  getFilingViewerUrl,
  isValidFilingContent,
  getEarningsExhibits,
  findExhibitsInFiling,
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
import {
  classifyFiling,
  mapFormTypeToFilingType,
  mapReportTypeToPeriodType,
  shouldIngestFiling,
  CLASSIFICATION_CONFIG,
} from './filing-classifier';
import type { FilingType } from '../types/database';
import { parse8KItems, type Parsed8KItems } from './form8k-parser';
import { detectStockSplitFrom8K } from './form8k-split-detection';
import { createStockSplit } from '../metrics/splits-db';
import { createCorporateEvent, createCorporateEvents } from './corporate-events-db';
import type { CorporateEventType } from '../types/database';
import { parseItem202Earnings } from './form8k-item202-parser';
import { getFiscalPeriod, parseFiscalYearEnd, type FiscalYearEnd } from '../metrics/fiscal-calendar';
import { createFinancialMetric } from '../metrics/metrics-db';
import { fetchStockSplits, applyAllSplits } from '../metrics/stock-splits';
import { validateQuarterlyEPS } from '../metrics/eps-invariants';
import { createServerClient } from '../supabase/client';

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
    let rawContent = await getFilingContent(accessionNumber, cik);
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
    const originalFormType = filingTypeMatch?.[1]?.trim() || '10-K';
    const filingType = mapFormTypeToFilingType(originalFormType) as FilingType;
    onProgress?.('Filing type identified', { filingType, originalFormType });

    // Step 6.5: Extract filing date first (needed for 6-K classification)
    const filingDateMatch = rawContent.match(/FILED AS OF DATE:\s+(\d{8})/i);
    const filingDate = filingDateMatch
      ? formatSECDate(filingDateMatch[1])
      : new Date().toISOString().split('T')[0];
    const filingDateForClassification = filingDateMatch?.[1] || undefined; // Pass raw YYYYMMDD format for classification
    
    // ============================================================
    // FORM 8-K PHASE A: EVENTS-ONLY INGESTION
    // ============================================================
    // Phase A is events-only. Metrics MUST NEVER be created from 8-K here.
    // This branch executes BEFORE classification, fiscal inference, or metrics orchestration.
    // If any code path attempts to create metrics for filing_type === '8-K' outside this branch,
    // it is a bug and must be rejected.
    // ============================================================
    if (filingType === '8-K') {
      onProgress?.('Handling 8-K filing (Phase A - Events Only)');
      const phaseAResult = await handle8KPhaseA({
        company,
        accessionNumber,
        rawContent,
        filingDate,
        onProgress,
      });
      
      if (!phaseAResult.success) {
        return {
          success: false,
          error: phaseAResult.error || '8-K Phase A ingestion failed',
          details: {
            ticker: company.ticker,
            companyName: company.name,
            filingType: '8-K',
            accessionNumber,
          },
        };
      }

      // Phase A complete - check if Phase B (Item 2.02 earnings) should run
      if (phaseAResult.success && phaseAResult.filingId) {
        // Check if filing has Item 2.02 (Phase B will handle earnings extraction)
        const parsed8K = parse8KItems(rawContent);
        
        if (parsed8K.items.includes('2.02')) {
          onProgress?.('Handling 8-K filing (Phase B - Item 2.02 Earnings)');
          
          // Phase B: Extract earnings from Item 2.02 (conservative, fail-closed)
          const phaseBResult = await handle8KEarningsPhaseB({
            filingId: phaseAResult.filingId,
            company,
            accessionNumber,
            rawContent,
            onProgress,
          });

          if (!phaseBResult.success) {
            // Phase B rejection is not a failure - log it and continue
            onProgress?.('Phase B: Earnings extraction rejected', {
              reason: phaseBResult.rejectionReason,
              error: phaseBResult.error,
            });
            // Continue - Phase A succeeded, Phase B rejection is acceptable
          } else {
            onProgress?.('Phase B: Earnings extraction completed', {
              metricsCreated: phaseBResult.metricsCreated,
            });
          }
        }
      }

      // Phase A complete - return success (Phase B metrics may have been created, but that's separate)
      return {
        success: true,
        filingId: phaseAResult.filingId,
        companyId: company.id,
        details: {
          ticker: company.ticker,
          companyName: company.name,
          filingType: '8-K',
          accessionNumber,
        },
      };
    }
    
    // Step 6.6: Classify filing (NEW - determines annual/quarterly with confidence)
    onProgress?.('Classifying filing', { filingType, originalFormType });
    const classification = classifyFiling(
      originalFormType,
      rawContent,
      {
        filingDate: filingDateForClassification, // Pass YYYYMMDD format for month checking
        reportDate: undefined,
        periodEndDate: undefined,
      }
    );
    
    onProgress?.('Filing classified', {
      reportType: classification.reportType,
      confidence: classification.confidenceScore,
      signals: classification.signals.length,
    });

    // Step 6.6: Skip if classification confidence is too low or not annual/quarterly
    // Use original form type to determine appropriate threshold (6-K gets lower threshold)
    const normalizedForm = originalFormType.toUpperCase().trim();
    const is6K = normalizedForm === '6-K';
    const threshold = is6K 
      ? CLASSIFICATION_CONFIG.minConfidenceThreshold6K 
      : CLASSIFICATION_CONFIG.minConfidenceThreshold;
    
    if (!shouldIngestFiling(classification, originalFormType)) {
      return {
        success: false,
        error: `Filing classified as ${classification.reportType} with low confidence (${classification.confidenceScore.toFixed(2)} < ${threshold}). Skipping ingestion.`,
        details: {
          ticker: company.ticker,
          companyName: company.name,
          filingType: originalFormType,
          accessionNumber,
          classification,
          threshold,
        },
      };
    }

    // Step 7: Extract period (filing date already extracted above)
    const periodMatch = rawContent.match(/CONFORMED PERIOD OF REPORT:\s+(\d{8})/i);
    const periodEndDate = classification.periodEndDate || (periodMatch ? formatSECDate(periodMatch[1]) : undefined);
    const periodType = mapReportTypeToPeriodType(classification.reportType);

    // Step 7.5: For 6-K filings, fetch earnings exhibits (if present)
    let exhibitContents: Array<{ exhibitNumber: string; content: string }> = [];
    if (filingType === '6-K' && classification.reportType === 'quarterly') {
      onProgress?.('Fetching earnings exhibits for 6-K', { filingType });
      try {
        exhibitContents = await getEarningsExhibits(accessionNumber, cik, rawContent);
        if (exhibitContents.length > 0) {
          onProgress?.('Earnings exhibits fetched', {
            count: exhibitContents.length,
            exhibits: exhibitContents.map(e => e.exhibitNumber),
          });
          // Append exhibit content to raw content for parsing (6-K earnings are often in exhibits)
          rawContent += '\n\n--- EXHIBITS ---\n\n';
          for (const exhibit of exhibitContents) {
            rawContent += `\n\n=== EXHIBIT ${exhibit.exhibitNumber} ===\n\n${exhibit.content}\n\n`;
          }
        }
      } catch (error) {
        // Non-fatal: Continue without exhibits
        console.warn(`Failed to fetch exhibits for 6-K ${accessionNumber}:`, error);
      }
    }

    // Step 8: Create filing record
    onProgress?.('Creating filing record in database');
    const filingResult = await createFiling({
      companyId: company.id,
      filingType,
      accessionNumber,
      filingDate,
      periodEndDate: periodEndDate || classification.periodEndDate,
      periodType,
      fiscalYear: classification.fiscalYear,
      fiscalQuarter: classification.fiscalQuarter,
      sourceUrl: getFilingViewerUrl(accessionNumber, cik),
      documentUrl: getFilingDocumentUrl(accessionNumber, cik),
      metadata: {
        original_form_type: originalFormType,
        classification_confidence: classification.confidenceScore,
        classification_signals: classification.signals,
        exhibit_numbers: exhibitContents.map(e => e.exhibitNumber),
        period_type_source: 'classifier',
      },
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

/**
 * Maps 8-K item numbers to corporate event types
 */
function map8KItemToEventType(item: string): CorporateEventType | null {
  const itemMap: Record<string, CorporateEventType> = {
    '1.01': 'material_agreement',
    '3.01': 'delisting',
    '3.02': 'other', // Equity issuance - using 'other' since 'equity_issuance' doesn't exist in enum
    '5.02': 'executive_change',
    '7.01': 'other', // Regulation FD - using 'other'
    '8.01': 'other',
  };
    return itemMap[item] || null;
}

/**
 * Checks if a 10-Q filing exists for the same fiscal period
 * Phase B: 10-Q is authoritative, so reject 8-K Item 2.02 if 10-Q exists
 */
async function check10QPrecedence(
  companyId: string,
  fiscalYear: number,
  fiscalQuarter: number
): Promise<boolean> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('filings')
    .select('id')
    .eq('company_id', companyId)
    .eq('filing_type', '10-Q')
    .eq('fiscal_year', fiscalYear)
    .eq('fiscal_quarter', fiscalQuarter)
    .eq('processing_status', 'completed')
    .limit(1)
    .single();

  // If we found a 10-Q, it has precedence
  return !error && data !== null;
}

/**
 * Handles Form 8-K Phase B ingestion (Item 2.02 Earnings Extraction)
 * 
 * Phase B: Conservative, fail-closed extraction of quarterly earnings from Item 2.02
 * 
 * Rejects extraction if:
 * - Item 2.02 parsing fails
 * - Period cannot be resolved to fiscal quarter
 * - Non-GAAP or adjusted language present
 * - YTD or combined periods mentioned
 * - 10-Q exists for same fiscal period (10-Q is authoritative)
 * - EPS validation fails
 * 
 * @param params - Phase B handler parameters
 * @returns Metrics extraction result (success only if unambiguous)
 */
async function handle8KEarningsPhaseB(params: {
  filingId: string;
  company: any; // Company from database
  accessionNumber: string;
  rawContent: string;
  onProgress?: IngestionProgressCallback;
}): Promise<{ success: boolean; metricsCreated?: number; error?: string; rejectionReason?: string }> {
  const { filingId, company, accessionNumber, rawContent, onProgress } = params;

  try {
    // Step 1: Parse Item 2.02 content
    onProgress?.('Phase B: Parsing Item 2.02 earnings');
    const parsed8K = parse8KItems(rawContent);

    if (!parsed8K.items.includes('2.02')) {
      return {
        success: false,
        error: 'Item 2.02 not found in 8-K filing',
        rejectionReason: 'item_2_02_not_found',
      };
    }

    const item202Content = parsed8K.itemContents['2.02'];
    if (!item202Content) {
      return {
        success: false,
        error: 'Item 2.02 content not found',
        rejectionReason: 'item_2_02_content_missing',
      };
    }

    // Step 2: Parse earnings data from Item 2.02
    const parseResult = parseItem202Earnings(item202Content);

    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        error: parseResult.error || 'Failed to parse Item 2.02 earnings',
        rejectionReason: parseResult.rejectionReason || 'parsing_failed',
      };
    }

    const earningsData = parseResult.data;
    onProgress?.('Phase B: Earnings data parsed', {
      periodEndDate: earningsData.periodEndDate,
      hasEPS: !!(earningsData.epsDiluted || earningsData.epsBasic),
      hasRevenue: !!earningsData.revenue,
    });

    // Step 3: Resolve fiscal period
    onProgress?.('Phase B: Resolving fiscal period');
    let fiscalYearEnd: FiscalYearEnd | null = null;

    // Get fiscal year end from company record
    if (company.fiscal_year_end_month && company.fiscal_year_end_day) {
      fiscalYearEnd = {
        month: company.fiscal_year_end_month,
        day: company.fiscal_year_end_day,
      };
    } else if (company.fiscal_year_end) {
      fiscalYearEnd = parseFiscalYearEnd(company.fiscal_year_end);
    }

    if (!fiscalYearEnd) {
      return {
        success: false,
        error: 'Fiscal year end not found. Cannot resolve fiscal period.',
        rejectionReason: 'fiscal_year_end_missing',
      };
    }

    // Calculate fiscal period
    const periodEndDateObj = new Date(earningsData.periodEndDate);
    if (isNaN(periodEndDateObj.getTime())) {
      return {
        success: false,
        error: 'Invalid period end date',
        rejectionReason: 'invalid_period_end_date',
      };
    }

    const fiscalPeriod = getFiscalPeriod(periodEndDateObj, fiscalYearEnd, 'quarterly');

    if (!fiscalPeriod || !fiscalPeriod.fiscalQuarter) {
      return {
        success: false,
        error: 'Cannot resolve fiscal quarter from period end date',
        rejectionReason: 'fiscal_quarter_resolution_failed',
      };
    }

    onProgress?.('Phase B: Fiscal period resolved', {
      fiscalYear: fiscalPeriod.fiscalYear,
      fiscalQuarter: fiscalPeriod.fiscalQuarter,
    });

    // Step 4: Check for 10-Q precedence
    onProgress?.('Phase B: Checking 10-Q precedence');
    const has10Q = await check10QPrecedence(
      company.id,
      fiscalPeriod.fiscalYear,
      fiscalPeriod.fiscalQuarter
    );

    if (has10Q) {
      return {
        success: false,
        error: `10-Q filing exists for Q${fiscalPeriod.fiscalQuarter} FY${fiscalPeriod.fiscalYear}. 10-Q is authoritative, rejecting 8-K Item 2.02.`,
        rejectionReason: '10q_precedence',
      };
    }

    // Step 5: Fetch stock splits for EPS adjustment
    onProgress?.('Phase B: Fetching stock splits');
    const stockSplits = await fetchStockSplits(company.id, company.ticker);

    // Step 6: Extract and adjust metrics
    const metricsToCreate = [];
    const periodEndDateStr = earningsData.periodEndDate;

    // Extract EPS (diluted preferred, basic fallback)
    if (earningsData.epsDiluted !== undefined) {
      const { adjustedValue, splitAdjusted } = applyAllSplits(
        earningsData.epsDiluted,
        'eps_diluted',
        periodEndDateStr,
        stockSplits
      );

      // Validate EPS
      const epsValidation = validateQuarterlyEPS(
        'eps_diluted',
        adjustedValue,
        'quarterly',
        splitAdjusted
      );

      if (!epsValidation.valid) {
        return {
          success: false,
          error: `EPS validation failed: ${epsValidation.error}`,
          rejectionReason: 'eps_validation_failed',
        };
      }

      metricsToCreate.push({
        filingId,
        companyId: company.id,
        metricType: 'eps_diluted' as const,
        value: adjustedValue,
        unit: 'USD/shares',
        periodType: 'quarterly' as const,
        periodEndDate: periodEndDateStr,
        fiscalYear: fiscalPeriod.fiscalYear,
        fiscalQuarter: fiscalPeriod.fiscalQuarter,
        splitAdjusted,
        metadata: {
          source: '8-K',
          source_item: '2.02',
          accession_number: accessionNumber,
          original_value: earningsData.epsDiluted,
        },
      });
    } else if (earningsData.epsBasic !== undefined) {
      const { adjustedValue, splitAdjusted } = applyAllSplits(
        earningsData.epsBasic,
        'eps_basic',
        periodEndDateStr,
        stockSplits
      );

      // Validate EPS
      const epsValidation = validateQuarterlyEPS(
        'eps_basic',
        adjustedValue,
        'quarterly',
        splitAdjusted
      );

      if (!epsValidation.valid) {
        return {
          success: false,
          error: `EPS validation failed: ${epsValidation.error}`,
          rejectionReason: 'eps_validation_failed',
        };
      }

      metricsToCreate.push({
        filingId,
        companyId: company.id,
        metricType: 'eps_basic' as const,
        value: adjustedValue,
        unit: 'USD/shares',
        periodType: 'quarterly' as const,
        periodEndDate: periodEndDateStr,
        fiscalYear: fiscalPeriod.fiscalYear,
        fiscalQuarter: fiscalPeriod.fiscalQuarter,
        splitAdjusted,
        metadata: {
          source: '8-K',
          source_item: '2.02',
          accession_number: accessionNumber,
          original_value: earningsData.epsBasic,
        },
      });
    }

    // Extract revenue (optional)
    if (earningsData.revenue !== undefined) {
      metricsToCreate.push({
        filingId,
        companyId: company.id,
        metricType: 'revenue' as const,
        value: earningsData.revenue,
        unit: 'USD',
        periodType: 'quarterly' as const,
        periodEndDate: periodEndDateStr,
        fiscalYear: fiscalPeriod.fiscalYear,
        fiscalQuarter: fiscalPeriod.fiscalQuarter,
        currency: earningsData.currency || 'USD',
        splitAdjusted: false, // Revenue is not split-adjusted
        metadata: {
          source: '8-K',
          source_item: '2.02',
          accession_number: accessionNumber,
        },
      });
    }

    // Step 7: Create metrics (at least one EPS required)
    if (metricsToCreate.length === 0) {
      return {
        success: false,
        error: 'No valid metrics extracted from Item 2.02',
        rejectionReason: 'no_metrics_extracted',
      };
    }

    onProgress?.('Phase B: Creating financial metrics', {
      count: metricsToCreate.length,
    });

    let metricsCreated = 0;
    for (const metric of metricsToCreate) {
      const result = await createFinancialMetric(metric);
      if (result.success) {
        metricsCreated++;
      } else {
        // Log but continue - individual metric failures shouldn't fail entire Phase B
        console.warn(`Failed to create metric ${metric.metricType}: ${result.error}`);
      }
    }

    if (metricsCreated === 0) {
      return {
        success: false,
        error: 'Failed to create any metrics from Item 2.02',
        rejectionReason: 'metric_creation_failed',
      };
    }

    onProgress?.('Phase B: Earnings extraction completed', {
      metricsCreated,
    });

    return {
      success: true,
      metricsCreated,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error in Phase B handler',
      rejectionReason: 'unexpected_error',
    };
  }
}

/**
 * Handles Form 8-K Phase A ingestion (Events Only)
 * 
 * Core Invariant: This function MUST NEVER create financial metrics.
 * It only handles:
 * - Item parsing
 * - Accepted date extraction
 * - Filing persistence (no fiscal fields)
 * - Stock split detection
 * - Corporate event creation
 * 
 * @param params - Phase A handler parameters
 * @returns Ingestion result with filingId (no metrics)
 */
async function handle8KPhaseA(params: {
  company: any; // Company from database
  accessionNumber: string;
  rawContent: string;
  filingDate: string;
  onProgress?: IngestionProgressCallback;
}): Promise<IngestionResult> {
  const { company, accessionNumber, rawContent, filingDate, onProgress } = params;

  try {
    // A. Parse Filing Metadata
    onProgress?.('Parsing 8-K items');
    const parsed8K = parse8KItems(rawContent);
    
    if (parsed8K.items.length === 0) {
      return {
        success: false,
        error: 'No valid 8-K items found in filing',
      };
    }

    onProgress?.('8-K items parsed', { items: parsed8K.items });

    // Extract ACCEPTANCE-DATETIME from SEC header
    // Format: ACCEPTANCE-DATETIME: YYYYMMDDHHMMSS
    const acceptedDateTimeMatch = rawContent.match(/ACCEPTANCE-DATETIME:\s+(\d{14})/i);
    let acceptedDate: string | null = null;
    
    if (acceptedDateTimeMatch) {
      const dateTimeStr = acceptedDateTimeMatch[1];
      // Extract date portion (YYYYMMDD) and convert to ISO format
      const year = dateTimeStr.slice(0, 4);
      const month = dateTimeStr.slice(4, 6);
      const day = dateTimeStr.slice(6, 8);
      acceptedDate = `${year}-${month}-${day}`;
    } else {
      // Fallback to filing date if ACCEPTANCE-DATETIME not found
      acceptedDate = filingDate;
    }

    onProgress?.('Accepted date extracted', { acceptedDate });

    // B. Persist Filing (NO fiscal fields, NO period classification)
    onProgress?.('Persisting 8-K filing record');
    const filingResult = await createFiling({
      companyId: company.id,
      filingType: '8-K',
      accessionNumber,
      filingDate,
      acceptedDate,
      // Explicitly NO fiscal fields:
      // periodEndDate: undefined
      // periodType: undefined
      // fiscalYear: undefined
      // fiscalQuarter: undefined
      items: parsed8K.items,
      sourceUrl: getFilingViewerUrl(accessionNumber, company.cik),
      documentUrl: getFilingDocumentUrl(accessionNumber, company.cik),
      metadata: {
        phase: 'A',
        items: parsed8K.items,
        has_item_2_02: parsed8K.items.includes('2.02'),
      },
    });

    if (!filingResult.success || !filingResult.data) {
      return {
        success: false,
        error: `Failed to create 8-K filing record: ${filingResult.error}`,
      };
    }

    const filing = filingResult.data;
    onProgress?.('8-K filing record created', { filingId: filing.id });

    // C. Stock Split Detection (Primary Purpose)
    // Only check items 3.02 and 8.01 for stock splits
    const splitDetectionItems = parsed8K.items.filter(item => item === '3.02' || item === '8.01');
    
    if (splitDetectionItems.length > 0) {
      onProgress?.('Detecting stock splits', { items: splitDetectionItems });
      
      for (const item of splitDetectionItems) {
        const itemContent = parsed8K.itemContents[item];
        if (!itemContent) continue;

        const detectedSplit = detectStockSplitFrom8K(itemContent, acceptedDate || filingDate);
        
        if (detectedSplit) {
          onProgress?.('Stock split detected', {
            item,
            ratio: detectedSplit.splitRatio,
            effectiveDate: detectedSplit.effectiveDate,
          });

          // Persist to stock_splits table
          const splitResult = await createStockSplit({
            company_id: company.id,
            split_ratio: detectedSplit.splitRatio,
            effective_date: detectedSplit.effectiveDate,
            source: '8-K',
            source_reference: accessionNumber,
            description: detectedSplit.description,
            metadata: {
              item,
              filing_id: filing.id,
            },
          });

          if (!splitResult.success) {
            // Log but don't fail - split detection is best effort
            console.warn(`Failed to persist stock split for ${company.ticker}: ${splitResult.error}`);
          } else {
            onProgress?.('Stock split persisted', {
              splitId: splitResult.data?.id,
            });
          }
        }
      }
    }

    // D. Corporate Event Creation
    // Create events for non-metric items (exclude 2.02 - that's for Phase B)
    const eventItems = parsed8K.items.filter(item => item !== '2.02');
    
    if (eventItems.length > 0) {
      onProgress?.('Creating corporate events', { items: eventItems });
      
      const eventsToCreate = [];
      
      for (const item of eventItems) {
        const eventType = map8KItemToEventType(item);
        if (!eventType) {
          // Skip items that don't map to event types
          continue;
        }

        const itemContent = parsed8K.itemContents[item];
        const title = `Item ${item}`;
        const description = itemContent ? itemContent.substring(0, 500) : null; // Truncate for description

        eventsToCreate.push({
          company_id: company.id,
          filing_id: filing.id,
          event_type: eventType,
          event_date: acceptedDate || filingDate,
          title,
          description,
          metadata: {
            item,
            accession_number: accessionNumber,
          },
        });
      }

      if (eventsToCreate.length > 0) {
        const eventsResult = await createCorporateEvents(eventsToCreate);
        
        if (!eventsResult.success) {
          // Log but don't fail - event creation is best effort
          console.warn(`Failed to create corporate events for ${company.ticker}: ${eventsResult.error}`);
        } else {
          onProgress?.('Corporate events created', {
            count: eventsResult.data?.length || 0,
          });
        }
      }
    }

    // Handle Item 2.02 detection (if present)
    // Phase A: Detect it, store metadata, do nothing else
    if (parsed8K.items.includes('2.02')) {
      onProgress?.('Item 2.02 detected (Phase B will handle earnings extraction)');
      // Item 2.02 metadata is already stored in filing.metadata.has_item_2_02
      // Phase B will handle earnings extraction later
    }

    // Update filing status to completed
    await updateFilingStatus(filing.id, 'completed');

    onProgress?.('8-K Phase A ingestion completed successfully');
    return {
      success: true,
      filingId: filing.id,
      companyId: company.id,
      details: {
        ticker: company.ticker,
        companyName: company.name,
        filingType: '8-K',
        accessionNumber,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error in 8-K Phase A handler',
    };
  }
}
