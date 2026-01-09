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

    // Step 3: Ingest latest 10-K
    onProgress?.('Ingesting latest 10-K');
    const k10Result = await ingestLatestFiling(cik, '10-K', (step, details) => {
      onProgress?.(`10-K: ${step}`, details);
    });

    if (k10Result.success && k10Result.filingId) {
      filings.push({
        filingType: '10-K',
        filingId: k10Result.filingId,
        success: true,
      });
      onProgress?.('10-K ingested successfully', { filingId: k10Result.filingId });
    } else {
      filings.push({
        filingType: '10-K',
        filingId: '',
        success: false,
        error: k10Result.error || 'Unknown error',
      });
      onProgress?.('10-K ingestion failed', { error: k10Result.error });
    }

    // Step 4: Ingest last 4 10-Qs
    onProgress?.('Ingesting last 4 quarterly filings (10-Q)');
    const q10Results = await ingestRecentFilings(cik, '10-Q', 4, (step, details) => {
      onProgress?.(`10-Q: ${step}`, details);
    });

    q10Results.forEach((result, index) => {
      if (result.success && result.filingId) {
        filings.push({
          filingType: '10-Q',
          filingId: result.filingId,
          success: true,
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

    const successfulFilings = filings.filter((f) => f.success);
    onProgress?.('Filings ingested', {
      total: filings.length,
      successful: successfulFilings.length,
    });

    if (successfulFilings.length === 0) {
      return {
        success: false,
        error: 'No filings were successfully ingested',
        details: {
          companyName: companyIndex.name,
          filings,
        },
      };
    }

    // Step 5: Process each successful filing through full pipeline
    for (const filing of successfulFilings) {
      onProgress?.(`Processing ${filing.filingType} through full pipeline`, {
        filingId: filing.filingId,
      });

      // 5a: Extract metrics
      onProgress?.(`Extracting metrics for ${filing.filingType}`);
      await extractMetricsForFiling(filing.filingId, {
        onProgress: (step, details) => {
          onProgress?.(`${filing.filingType} Metrics: ${step}`, details);
        },
      });

      // 5b: AI Analysis
      onProgress?.(`Running AI analysis for ${filing.filingType}`);
      await analyzeFilingSections(filing.filingId, {
        onProgress: (step, details) => {
          onProgress?.(`${filing.filingType} AI: ${step}`, details);
        },
      });

      // 5c: Generate signals
      onProgress?.(`Generating signals for ${filing.filingType}`);
      await generateSignalsForFiling(filing.filingId, {
        onProgress: (step, details) => {
          onProgress?.(`${filing.filingType} Signals: ${step}`, details);
        },
      });

      // 5d: Calculate composite score
      onProgress?.(`Calculating composite score for ${filing.filingType}`);
      await calculateFilingCompositeScore(filing.filingId, {
        storeResult: true,
        onProgress: (step, details) => {
          onProgress?.(`${filing.filingType} Score: ${step}`, details);
        },
      });
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
