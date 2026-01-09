// Composite Score Orchestrator
// Computes and optionally stores composite scores for filings

import { createServerClient } from '../supabase/client';
import { calculateCompositeScore } from './composite-score';
import { getFilingSignalsForScore, storeCompositeScore, getStoredCompositeScore } from './scores-db';
import type { CompositeScore } from './composite-score';
import type { Signal } from '../types/database';

/**
 * Progress callback for score calculation
 */
export type ScoreProgressCallback = (step: string, details?: any) => void;

/**
 * Result of composite score calculation
 */
export interface ScoreCalculationResult {
  success: boolean;
  filingId?: string;
  companyId?: string;
  score?: CompositeScore;
  errors?: string[];
  details?: {
    companyName?: string;
    filingType?: string;
    signalsCount?: number;
    stored?: boolean;
  };
}

/**
 * Calculates composite score for a filing
 * 
 * Process:
 * 1. Fetch filing with company info
 * 2. Fetch all active signals for the filing
 * 3. Calculate composite score using deterministic rules
 * 4. Optionally store in filing metadata
 */
export async function calculateFilingCompositeScore(
  filingId: string,
  options: {
    useStored?: boolean; // If true, return stored score if available
    storeResult?: boolean; // If true, store calculated score
    onProgress?: ScoreProgressCallback;
  } = {}
): Promise<ScoreCalculationResult> {
  const { useStored = false, storeResult = false, onProgress } = options;
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

    // Step 2: Check for stored score if requested
    if (useStored) {
      onProgress?.('Checking for stored composite score');
      const storedResult = await getStoredCompositeScore(filingId);
      
      if (storedResult.success && storedResult.data) {
        onProgress?.('Using stored composite score');
        
        // Convert stored score back to CompositeScore format
        const stored = storedResult.data;
        const score: CompositeScore = {
          composite_score: stored.composite_score,
          direction: stored.direction as any,
          explanation: stored.explanation,
          contributing_signals: [], // Would need to fetch signals to reconstruct
          calculation_details: stored.calculation_details,
        };

        return {
          success: true,
          filingId: filing.id,
          companyId: company.id,
          score,
          details: {
            companyName: company.name,
            filingType: filing.filing_type,
            stored: true,
          },
        };
      }
    }

    // Step 3: Fetch active signals
    onProgress?.('Fetching active signals');
    
    const signalsResult = await getFilingSignalsForScore(filingId);
    
    if (!signalsResult.success) {
      return {
        success: false,
        errors: [`Failed to fetch signals: ${signalsResult.error}`],
      };
    }

    const signals = signalsResult.data as Signal[];

    if (signals.length === 0) {
      return {
        success: false,
        errors: ['No active signals found for this filing. Generate signals first.'],
      };
    }

    onProgress?.('Signals loaded', {
      signalsCount: signals.length,
    });

    // Step 4: Calculate composite score
    onProgress?.('Calculating composite score');
    
    const score = calculateCompositeScore(signals);
    
    onProgress?.('Score calculated', {
      score: score.composite_score,
      direction: score.direction,
    });

    // Step 5: Optionally store result
    if (storeResult) {
      onProgress?.('Storing composite score');
      const storeResult = await storeCompositeScore(filingId, score);
      
      if (!storeResult.success) {
        // Non-fatal error - score calculated but not stored
        onProgress?.('Warning: Failed to store score', { error: storeResult.error });
      }
    }

    return {
      success: true,
      filingId: filing.id,
      companyId: company.id,
      score,
      details: {
        companyName: company.name,
        filingType: filing.filing_type,
        signalsCount: signals.length,
        stored: storeResult,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
    };
  }
}
