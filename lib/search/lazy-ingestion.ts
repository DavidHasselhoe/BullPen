// Lazy Ingestion Orchestrator
// Ingests company filings on-demand when user selects a company from search

import { ingestLatestFiling, ingestRecentFilings } from '../ingestion/filing-ingestion';
import { extractMetricsForFiling } from '../metrics/metrics-orchestrator';
import { analyzeFilingSections } from '../ai/ai-orchestrator';
import { generateSignalsForFiling } from '../signals/signals-orchestrator';
import { calculateFilingCompositeScore } from '../scores/scores-orchestrator';
import { analyzeTrendsForCompany } from '../trends/trends-orchestrator';
import { markCompanyIndexAsIngested, getCompanyIndexByTicker } from './search-db';
import { createServerClient } from '../supabase/client';
import type { Company } from '../types/database';

export interface LazyIngestionResult {
  success: boolean;
  companyId?: string;
  ticker?: string;
  filingsIngested?: number;
  error?: string;
  details?: {
    companyName?: string;
    filings?: Array<{
      filingType: string;
      filingId: string;
      success: boolean;
      error?: string;
    }>;
  };
}

export type LazyIngestionProgressCallback = (step: string, details?: any) => void;

/**
 * Ingests a company on-demand (latest 10-K + last 4 10-Qs)
 * Then runs full pipeline: metrics, AI, signals, trends, composite score
 */
export async function lazyIngestCompany(
  ticker: string,
  onProgress?: LazyIngestionProgressCallback
): Promise<LazyIngestionResult> {
  try {
    // Step 1: Get company index entry to get CIK
    onProgress?.('Looking up company information', { ticker });
    const indexResult = await getCompanyIndexByTicker(ticker);

    if (!indexResult.success || !indexResult.data) {
      return {
        success: false,
        error: `Company ${ticker} not found in index`,
      };
    }

    const companyIndex = indexResult.data;
    const cik = companyIndex.cik;

    onProgress?.('Company found', {
      name: companyIndex.name,
      cik,
    });

    // Step 2: Get or create company in main companies table
    onProgress?.('Creating company record');
    const supabase = createServerClient();
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id, name, ticker')
      .eq('ticker', ticker.toUpperCase())
      .single();

    let company: Company;
    if (existingCompany) {
      company = existingCompany as Company;
      onProgress?.('Using existing company record', { companyId: company.id });
    } else {
      // Create company from index data
      const { data: newCompany, error: createError } = await supabase
        .from('companies')
        .insert({
          ticker: companyIndex.ticker.toUpperCase(),
          name: companyIndex.name,
          cik: companyIndex.cik,
          sector: null,
          industry: null,
          description: null,
          metadata: {},
        })
        .select()
        .single();

      if (createError || !newCompany) {
        return {
          success: false,
          error: `Failed to create company: ${createError?.message || 'Unknown error'}`,
        };
      }

      company = newCompany as Company;
      onProgress?.('Company record created', { companyId: company.id });
    }

    const filings: Array<{ filingType: string; filingId: string; success: boolean; error?: string }> = [];

    // Step 3: Detect if company is foreign private issuer
    // Check SEC submissions for foreign issuer forms (20-F, 6-K)
    onProgress?.('Detecting issuer type', { ticker });
    
    // Fetch company submissions to check for foreign issuer forms
    let isForeignIssuer = false;
    try {
      const { getRecentFilings } = await import('../ingestion/sec-edgar');
      // Check for 20-F or 6-K filings (foreign issuer forms)
      const foreignFilings20F = await getRecentFilings(cik, '20-F', 1);
      const foreignFilings6K = await getRecentFilings(cik, '6-K', 1);
      
      if (foreignFilings20F.length > 0 || foreignFilings6K.length > 0) {
        isForeignIssuer = true;
        onProgress?.('Foreign private issuer detected', {
          has20F: foreignFilings20F.length > 0,
          has6K: foreignFilings6K.length > 0,
        });
      }
    } catch (error) {
      console.warn(`Failed to detect issuer type for ${ticker}:`, error);
      // Continue assuming US issuer if detection fails
    }

    // Step 3a/3b: Ingest annual reports (10-K for US, 20-F for foreign)
    const annualFormType = isForeignIssuer ? '20-F' : '10-K';
    onProgress?.('Downloading reports', { formType: annualFormType });
    const annualResults = await ingestRecentFilings(cik, annualFormType, 3, (step, details) => {
      // Don't send individual filing progress - too repetitive
      // Only send significant milestones
      if (step.includes('Filing content retrieved') || step.includes('Filing saved') || step.includes('Filing classified')) {
        onProgress?.(step, details);
      }
    });

    // Track successful new ingestions and filings that already exist
    const successfulNewFilings: Array<{ filingType: string; filingId: string; success: boolean }> = [];
    const existingFilingAccessions = new Set<string>();

    annualResults.forEach((result) => {
      if (result.success && result.filingId) {
        // Newly ingested filing
        successfulNewFilings.push({
          filingType: annualFormType,
          filingId: result.filingId,
          success: true,
        });
        filings.push({
          filingType: annualFormType,
          filingId: result.filingId,
          success: true,
        });
      } else if (result.error?.includes('already exists')) {
        // Filing already exists - we'll fetch it from DB
        if (result.details?.accessionNumber) {
          existingFilingAccessions.add(result.details.accessionNumber);
        }
        filings.push({
          filingType: annualFormType,
          filingId: '',
          success: false,
          error: 'Already exists',
        });
      } else {
        filings.push({
          filingType: annualFormType,
          filingId: '',
          success: false,
          error: result.error || 'Unknown error',
        });
      }
    });

    // Step 4: Ingest quarterly reports
    // For US issuers: 10-Q (last 10 quarterly)
    // For foreign issuers: 6-K (earnings-related, last 15 to account for non-earnings 6-Ks)
    const quarterlyFormType = isForeignIssuer ? '6-K' : '10-Q';
    const quarterlyLimit = isForeignIssuer ? 15 : 10; // More 6-Ks to filter through for foreign issuers
    
    onProgress?.('Downloading quarterly reports', { formType: quarterlyFormType, limit: quarterlyLimit });
    const quarterlyResults = await ingestRecentFilings(cik, quarterlyFormType, quarterlyLimit, (step, details) => {
      // Don't send individual filing progress - too repetitive
      // Only send significant milestones
      if (step.includes('Filing content retrieved') || step.includes('Filing saved') || step.includes('Filing classified') || step.includes('Earnings exhibits')) {
        onProgress?.(step, details);
      }
    });

    quarterlyResults.forEach((result) => {
      // For 6-K filings, only include if classification succeeded (earnings-related)
      // The classifier will filter out non-earnings 6-Ks during ingestion
      if (result.success && result.filingId) {
        // Newly ingested filing
        successfulNewFilings.push({
          filingType: quarterlyFormType,
          filingId: result.filingId,
          success: true,
        });
        filings.push({
          filingType: quarterlyFormType,
          filingId: result.filingId,
          success: true,
        });
      } else if (result.error?.includes('already exists')) {
        // Filing already exists - we'll fetch it from DB
        if (result.details?.accessionNumber) {
          existingFilingAccessions.add(result.details.accessionNumber);
        }
        filings.push({
          filingType: quarterlyFormType,
          filingId: '',
          success: false,
          error: 'Already exists',
        });
      } else if (result.error?.includes('Skipping ingestion') || result.error?.includes('low confidence')) {
        // 6-K filing was classified as non-earnings - skip it (not an error)
        // Don't add to filings list as it was intentionally skipped
      } else {
        filings.push({
          filingType: quarterlyFormType,
          filingId: '',
          success: false,
          error: result.error || 'Unknown error',
        });
      }
    });

    // Fetch existing filings if we have their accession numbers, or get recent completed filings
    let successfulFilings = successfulNewFilings;
    
    if (existingFilingAccessions.size > 0) {
      // Fetch filings by accession number
      const { data: existingFilings } = await supabase
        .from('filings')
        .select('id, filing_type')
        .eq('company_id', company.id)
        .in('accession_number', Array.from(existingFilingAccessions))
        .eq('processing_status', 'completed');

      if (existingFilings && existingFilings.length > 0) {
        const existingFilingIds = existingFilings.map(f => ({
          filingType: f.filing_type || '10-K',
          filingId: f.id,
          success: true,
        }));
        successfulFilings = [...successfulFilings, ...existingFilingIds];
      }
    }

    // If we still have no filings, check for any existing completed filings
    if (successfulFilings.length === 0) {
      const { data: existingCompletedFilings } = await supabase
        .from('filings')
        .select('id, filing_type')
        .eq('company_id', company.id)
        .eq('processing_status', 'completed')
        .order('filing_date', { ascending: false })
        .limit(13); // Get up to 13 filings (3 10-Ks + 10 10-Qs)

      if (existingCompletedFilings && existingCompletedFilings.length > 0) {
        successfulFilings = existingCompletedFilings.map(f => ({
          filingType: f.filing_type || '10-K',
          filingId: f.id,
          success: true,
        }));
        onProgress?.('Using existing filings', {
          count: successfulFilings.length,
        });
      }
    }

    onProgress?.('Processing documents', {
      total: successfulFilings.length,
    });

    if (successfulFilings.length === 0) {
      return {
        success: false,
        error: 'No filings were available. This may be due to network issues, SEC server problems, or the company may not have recent filings.',
        details: {
          companyName: companyIndex.name,
          filings,
          suggestion: 'Please try again later or check if the company has recent filings available on SEC.gov',
        },
      };
    }

    // Step 5: Process each successful filing through full pipeline
    // Optimize: Process filings in parallel batches, but pipeline steps sequentially per filing
    // to avoid overwhelming the database/AI APIs
    const batchSize = 2; // Process 2 filings at a time
    for (let i = 0; i < successfulFilings.length; i += batchSize) {
      const batch = successfulFilings.slice(i, i + batchSize);
      
      // Process batch in parallel
      await Promise.all(
        batch.map(async (filing) => {
          // Don't send per-filing progress - too repetitive

          // Pipeline steps run sequentially per filing (they depend on each other)
          // But multiple filings can be processed in parallel
          // Suppress per-filing progress messages to avoid repetition
          try {
            // 5a: Extract metrics
            if (i === 0) {
              // Only show progress for first filing in batch
              onProgress?.('Extracting metrics');
            }
            await extractMetricsForFiling(filing.filingId, {
              // Suppress individual step progress - too repetitive
            });

            // 5b: AI Analysis
            if (i === 0) {
              onProgress?.('Analyzing with AI');
            }
            await analyzeFilingSections(filing.filingId, {
              // Suppress individual step progress
            });

            // 5c & 5d: Generate signals and calculate score in parallel
            if (i === 0) {
              onProgress?.('Generating insights');
            }
            await Promise.all([
              generateSignalsForFiling(filing.filingId, {
                // Suppress individual step progress
              }),
              calculateFilingCompositeScore(filing.filingId, {
                storeResult: true,
                // Suppress individual step progress
              }),
            ]);
          } catch (error) {
            console.error(`Error processing filing ${filing.filingId}:`, error);
            // Don't show per-filing errors - log only
          }
        })
      );
    }

    // Step 6: Generate trends for company (based on all metrics)
    onProgress?.('Analyzing trends across all filings');
    await analyzeTrendsForCompany(company.id, {
      onProgress: (step, details) => {
        onProgress?.(`Trends: ${step}`, details);
      },
    });

    // Step 7: Mark company index as ingested
    onProgress?.('Marking company as analyzed');
    await markCompanyIndexAsIngested(ticker);

    // Step 8: Check for and ingest missing reports
    onProgress?.('Checking for missing reports');
    try {
      const { detectAndIngestMissingReports } = await import('../ingestion/missing-reports');
      const missingReportsResult = await detectAndIngestMissingReports(
        company.id,
        cik,
        company.ticker,
        (step, details) => {
          onProgress?.(step, details);
        }
      );
      
      if (missingReportsResult.success) {
        if (missingReportsResult.ingested10Ks && missingReportsResult.ingested10Ks > 0) {
          onProgress?.('Missing 10-K reports ingested', {
            count: missingReportsResult.ingested10Ks,
          });
        }
        if (missingReportsResult.ingested10Qs && missingReportsResult.ingested10Qs > 0) {
          onProgress?.('Missing 10-Q reports ingested', {
            count: missingReportsResult.ingested10Qs,
          });
        }
      }
    } catch (err) {
      // Missing reports ingestion is optional, don't fail the whole pipeline
      console.warn(`Failed to check for missing reports for ${ticker}:`, err);
    }

    // Step 9: Fetch and store logo in background (non-blocking, fire and forget)
    try {
      const { ingestCompanyLogo } = await import('../logos/logos-orchestrator');
      ingestCompanyLogo(company.ticker, company.name, company.id, (step) => {
        // Only log completion, not every step
        if (step.includes('completed') || step.includes('failed')) {
          onProgress?.(`Logo: ${step}`);
        }
      }).catch((err) => {
        // Logo failure is non-fatal, just log it
        console.warn(`Logo ingestion failed for ${ticker}:`, err);
      });
    } catch (err) {
      // Logo ingestion is optional, don't fail the whole pipeline
      console.warn(`Failed to import logo orchestrator for ${ticker}:`, err);
    }

    onProgress?.('Lazy ingestion completed successfully');

    return {
      success: true,
      companyId: company.id,
      ticker: company.ticker,
      filingsIngested: successfulFilings.length,
      details: {
        companyName: companyIndex.name,
        filings,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
