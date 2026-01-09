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

    // Step 3: Ingest last 3 years of 10-Ks (annual reports)
    // This gives us 3 years of annual data for better trend analysis
    onProgress?.('Ingesting annual reports (last 3 years)');
    const k10Results = await ingestRecentFilings(cik, '10-K', 3, (step, details) => {
      onProgress?.(`10-K: ${step}`, details);
    });

    // Track successful new ingestions and filings that already exist
    const successfulNewFilings: Array<{ filingType: string; filingId: string; success: boolean }> = [];
    const existingFilingAccessions = new Set<string>();

    k10Results.forEach((result) => {
      if (result.success && result.filingId) {
        // Newly ingested filing
        successfulNewFilings.push({
          filingType: '10-K',
          filingId: result.filingId,
          success: true,
        });
        filings.push({
          filingType: '10-K',
          filingId: result.filingId,
          success: true,
        });
      } else if (result.error?.includes('already exists')) {
        // Filing already exists - we'll fetch it from DB
        if (result.details?.accessionNumber) {
          existingFilingAccessions.add(result.details.accessionNumber);
        }
        filings.push({
          filingType: '10-K',
          filingId: '',
          success: false,
          error: 'Already exists',
        });
      } else {
        filings.push({
          filingType: '10-K',
          filingId: '',
          success: false,
          error: result.error || 'Unknown error',
        });
      }
    });

    // Step 4: Ingest last 10 10-Qs (quarterly reports)
    // This gives us ~2.5 years of quarterly data for better trend analysis
    onProgress?.('Ingesting quarterly reports (last 2.5 years)');
    const q10Results = await ingestRecentFilings(cik, '10-Q', 10, (step, details) => {
      onProgress?.(`10-Q: ${step}`, details);
    });

    q10Results.forEach((result) => {
      if (result.success && result.filingId) {
        // Newly ingested filing
        successfulNewFilings.push({
          filingType: '10-Q',
          filingId: result.filingId,
          success: true,
        });
        filings.push({
          filingType: '10-Q',
          filingId: result.filingId,
          success: true,
        });
      } else if (result.error?.includes('already exists')) {
        // Filing already exists - we'll fetch it from DB
        if (result.details?.accessionNumber) {
          existingFilingAccessions.add(result.details.accessionNumber);
        }
        filings.push({
          filingType: '10-Q',
          filingId: '',
          success: false,
          error: 'Already exists',
        });
      } else {
        filings.push({
          filingType: '10-Q',
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

    onProgress?.('Filings ready for processing', {
      totalAttempted: filings.length,
      newFilings: successfulNewFilings.length,
      existingFilings: successfulFilings.length - successfulNewFilings.length,
      totalAvailable: successfulFilings.length,
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
          onProgress?.(`Processing ${filing.filingType} through full pipeline`, {
            filingId: filing.filingId,
            batch: `${Math.floor(i / batchSize) + 1}/${Math.ceil(successfulFilings.length / batchSize)}`,
          });

          // Pipeline steps run sequentially per filing (they depend on each other)
          // But multiple filings can be processed in parallel
          try {
            // 5a: Extract metrics
            onProgress?.(`Extracting metrics for ${filing.filingType}`);
            await extractMetricsForFiling(filing.filingId, {
              onProgress: (step, details) => {
                onProgress?.(`${filing.filingType} Metrics: ${step}`, details);
              },
            });

            // 5b: AI Analysis (can run in parallel with signals/score, but keeping sequential for now)
            onProgress?.(`Running AI analysis for ${filing.filingType}`);
            await analyzeFilingSections(filing.filingId, {
              onProgress: (step, details) => {
                onProgress?.(`${filing.filingType} AI: ${step}`, details);
              },
            });

            // 5c & 5d: Generate signals and calculate score in parallel (they're independent)
            onProgress?.(`Generating insights for ${filing.filingType}`);
            await Promise.all([
              generateSignalsForFiling(filing.filingId, {
                onProgress: (step, details) => {
                  onProgress?.(`${filing.filingType} Signals: ${step}`, details);
                },
              }),
              calculateFilingCompositeScore(filing.filingId, {
                storeResult: true,
                onProgress: (step, details) => {
                  onProgress?.(`${filing.filingType} Score: ${step}`, details);
                },
              }),
            ]);
          } catch (error) {
            console.error(`Error processing filing ${filing.filingId}:`, error);
            onProgress?.(`Error processing ${filing.filingType}`, {
              error: error instanceof Error ? error.message : 'Unknown error',
            });
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
