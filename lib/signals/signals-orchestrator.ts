// Signals Orchestrator
// Coordinates signal generation from AI insights

import { createServerClient } from '../supabase/client';
import { generateSignalsFromInsights } from './signal-generator';
import { createSignals, deleteFilingSignals } from './signals-db';
import type { AIInsight } from '../types/database';

/**
 * Progress callback for signal generation
 */
export type SignalProgressCallback = (step: string, details?: any) => void;

/**
 * Result of signal generation for a filing
 */
export interface SignalGenerationResult {
  success: boolean;
  filingId?: string;
  companyId?: string;
  signalsCreated?: number;
  errors?: string[];
  details?: {
    companyName?: string;
    filingType?: string;
    summary?: {
      total: number;
      bullish: number;
      bearish: number;
      neutral: number;
    };
  };
}

/**
 * Generates signals for a filing from its AI insights
 * 
 * Process:
 * 1. Fetch filing with company info
 * 2. Fetch all AI insights for the filing
 * 3. Generate signals using deterministic rules
 * 4. Store signals in database
 */
export async function generateSignalsForFiling(
  filingId: string,
  options: {
    replaceExisting?: boolean;
    onProgress?: SignalProgressCallback;
  } = {}
): Promise<SignalGenerationResult> {
  const { replaceExisting = true, onProgress } = options;
  const supabase = createServerClient();

  try {
    // Step 1: Fetch filing with company info
    onProgress?.('Fetching filing and company information');
    
    const { data: filing, error: filingError } = await supabase
      .from('filings')
      .select(`
        *,
        company:companies(*)
      `)
      .eq('id', filingId)
      .single();

    if (filingError || !filing) {
      return {
        success: false,
        errors: [`Failed to fetch filing: ${filingError?.message || 'Not found'}`],
      };
    }

    const company = (filing as any).company;

    onProgress?.('Filing loaded', {
      companyName: company.name,
      filingType: filing.filing_type,
    });

    // Step 2: Fetch AI insights for this filing
    onProgress?.('Fetching AI insights');
    
    const { data: insights, error: insightsError } = await supabase
      .from('ai_insights')
      .select('*')
      .eq('filing_id', filingId)
      .order('created_at', { ascending: true });

    if (insightsError) {
      return {
        success: false,
        errors: [`Failed to fetch insights: ${insightsError.message}`],
      };
    }

    if (!insights || insights.length === 0) {
      return {
        success: false,
        errors: ['No AI insights found for this filing. Run AI analysis first.'],
      };
    }

    onProgress?.('AI insights loaded', {
      insightsCount: insights.length,
    });

    // Step 3: Delete existing signals if replacing
    if (replaceExisting) {
      onProgress?.('Deleting existing signals');
      await deleteFilingSignals(filingId);
    }

    // Step 4: Generate signals using deterministic rules
    onProgress?.('Generating signals from AI insights');
    
    const result = generateSignalsFromInsights(insights);
    
    onProgress?.('Signals generated', {
      total: result.summary.total,
      bullish: result.summary.bullish,
      bearish: result.summary.bearish,
      neutral: result.summary.neutral,
    });

    if (result.signals.length === 0) {
      return {
        success: true,
        filingId: filing.id,
        companyId: company.id,
        signalsCreated: 0,
        details: {
          companyName: company.name,
          filingType: filing.filing_type,
          summary: result.summary,
        },
      };
    }

    // Step 5: Store signals in database
    onProgress?.('Storing signals in database');
    
    const dbResult = await createSignals({
      companyId: company.id,
      filingId: filing.id,
      signals: result.signals,
    });

    if (!dbResult.success) {
      return {
        success: false,
        errors: [`Failed to store signals: ${dbResult.error}`],
      };
    }

    onProgress?.('Signals stored successfully');

    return {
      success: true,
      filingId: filing.id,
      companyId: company.id,
      signalsCreated: result.signals.length,
      details: {
        companyName: company.name,
        filingType: filing.filing_type,
        summary: result.summary,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
    };
  }
}
