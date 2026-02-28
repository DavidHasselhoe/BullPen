/**
 * Financial Metrics Orchestrator (XBRL-First)
 *
 * This module is now a thin adapter that triggers XBRL metric extraction for
 * individual filings when needed (e.g. after a new filing appears outside the
 * main lazy-ingestion pipeline).
 *
 * The AI table-reading pipeline (filing-first-pipeline.ts / executeCanonicalPipeline)
 * has been removed from the main path. All structured financial metrics are now
 * extracted via the SEC Company Facts XBRL API in xbrl-company-facts.ts.
 *
 * This file is kept for backward compatibility with any code that calls
 * extractMetricsForFiling() directly.
 */

import { createServerClient } from '../supabase/client';
import { fetchAndExtractCompanyMetrics } from '../ingestion/xbrl-company-facts';
import type { MetricType } from '../types/database';

export type MetricsProgressCallback = (step: string, details?: any) => void;

export interface MetricsExtractionResult {
  success: boolean;
  filingId?: string;
  companyId?: string;
  metricsExtracted?: number;
  errors?: string[];
  details?: {
    companyName?: string;
    filingType?: string;
    metrics?: Array<{
      metricType: string;
      value: number;
      unit: string;
      success: boolean;
      error?: string;
    }>;
  };
}

/**
 * Extracts financial metrics for a single filing by running the full company-level
 * XBRL extraction. Because the SEC Company Facts API returns all historical periods
 * in one call, calling this for a single filing still fetches and stores all metrics
 * for the company — which is by design (it's idempotent via upsert).
 *
 * If you need to extract metrics for all filings at once, call
 * `fetchAndExtractCompanyMetrics` directly from xbrl-company-facts.ts.
 */
export async function extractMetricsForFiling(
  filingId: string,
  options: {
    enforceHistory?: boolean;
    onProgress?: MetricsProgressCallback;
  } = {},
): Promise<MetricsExtractionResult> {
  const { onProgress } = options;
  const supabase = createServerClient();

  try {
    // Resolve filing → company → CIK
    onProgress?.('Fetching filing and company information');
    const { data: filingRaw, error: filingError } = await supabase
      .from('filings')
      .select('*, company:companies(*)')
      .eq('id', filingId)
      .single();

    if (filingError || !filingRaw) {
      return {
        success: false,
        errors: [`Failed to fetch filing: ${filingError?.message || 'Not found'}`],
      };
    }

    const filing = filingRaw as any;
    const company = filing.company;
    if (!company?.cik) {
      return { success: false, errors: ['Company CIK not found'] };
    }

    // Build a minimal filingIdMap so the XBRL extractor can link this filing's facts
    // For on-demand extraction we also fetch all other filings for this company to
    // build the full map — this way all historical XBRL facts get linked correctly.
    onProgress?.('Building filing index');
    const { data: allFilingsRaw } = await supabase
      .from('filings')
      .select('id, accession_number, filing_type, period_end_date, fiscal_year, fiscal_quarter')
      .eq('company_id', company.id);

    const allFilings = (allFilingsRaw || []) as Array<{
      id: string;
      accession_number: string;
      filing_type: string;
      period_end_date: string | null;
      fiscal_year: number | null;
      fiscal_quarter: number | null;
    }>;

    const filingIdMap = new Map(
      allFilings.map((f) => [
        f.accession_number,
        {
          filingId:      f.id,
          filingType:    f.filing_type,
          periodEndDate: f.period_end_date,
          fiscalYear:    f.fiscal_year,
          fiscalQuarter: f.fiscal_quarter,
        },
      ]),
    );

    // Run company-level XBRL extraction (idempotent — upserts metrics)
    onProgress?.('Extracting metrics via XBRL');
    const result = await fetchAndExtractCompanyMetrics(
      company.cik,
      company.id,
      filingIdMap,
      onProgress,
    );

    return {
      success: result.metricsStored > 0 || result.metricsExtracted > 0,
      filingId,
      companyId: company.id,
      metricsExtracted: result.metricsStored,
      errors: result.errors.length > 0 ? result.errors : undefined,
      details: {
        companyName: company.name,
        filingType:  filing.filing_type,
      },
    };
  } catch (err) {
    return {
      success: false,
      errors: [err instanceof Error ? err.message : 'Unknown error occurred'],
    };
  }
}
