// Database Operations for Composite Scores
// Optional storage for computed scores

import { createServerClient } from '../supabase/client';
import type { CompositeScore } from './composite-score';

/**
 * Result of score database operations
 */
export interface ScoreDBResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Stored composite score record
 * Note: This is stored in a simple JSONB field in filings.metadata
 * Alternative: Could create a filing_scores table if needed
 */
export interface StoredCompositeScore {
  filing_id: string;
  composite_score: number;
  direction: string;
  explanation: string;
  contributing_signal_ids: string[];
  calculated_at: string;
  calculation_details: CompositeScore['calculation_details'];
}

/**
 * Stores composite score in filing metadata
 * Uses filings.metadata JSONB field to avoid schema changes
 */
export async function storeCompositeScore(
  filingId: string,
  score: CompositeScore
): Promise<ScoreDBResult<void>> {
  const supabase = createServerClient();

  try {
    // Get current metadata
    const { data: filing, error: fetchError } = await supabase
      .from('filings')
      .select('metadata')
      .eq('id', filingId)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    // Update metadata with composite score
    const metadata = (filing.metadata || {}) as Record<string, unknown>;
    metadata.composite_score = {
      composite_score: score.composite_score,
      direction: score.direction,
      explanation: score.explanation,
      contributing_signal_ids: score.contributing_signals.map(s => s.signal_id),
      calculated_at: new Date().toISOString(),
      calculation_details: score.calculation_details,
    };

    const { error: updateError } = await supabase
      .from('filings')
      .update({ metadata })
      .eq('id', filingId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retrieves stored composite score from filing metadata
 */
export async function getStoredCompositeScore(
  filingId: string
): Promise<ScoreDBResult<StoredCompositeScore | null>> {
  const supabase = createServerClient();

  try {
    const { data: filing, error } = await supabase
      .from('filings')
      .select('metadata')
      .eq('id', filingId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    const metadata = (filing.metadata || {}) as Record<string, unknown>;
    const storedScore = metadata.composite_score as StoredCompositeScore | undefined;

    if (!storedScore) {
      return { success: true, data: null };
    }

    return { success: true, data: storedScore };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets signals for a filing (used for score calculation)
 */
export async function getFilingSignalsForScore(
  filingId: string
): Promise<ScoreDBResult<any[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('filing_id', filingId)
      .eq('is_active', true)
      .order('strength', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
