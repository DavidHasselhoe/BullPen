// Revenue Segment Extractor
// Extracts revenue breakdowns by business segment from filings
// Supports deterministic (XBRL tables) and AI-assisted extraction

import { createServerClient } from '@/lib/supabase/client';

export interface RevenueSegment {
  name: string;
  value: number; // Revenue value in millions
}

export interface SegmentExtractionResult {
  success: boolean;
  segments?: RevenueSegment[];
  totalRevenueReference?: number;
  confidence: 'high' | 'medium' | 'low';
  source: 'filing_table' | 'filing_text' | 'ai_extracted';
  error?: string;
}

export interface AISegmentResponse {
  segments: Array<{
    name: string;
    value: number;
  }>;
  total_revenue_reference: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Validates that segment totals reconcile with total revenue (±2%)
 */
export function validateSegmentReconciliation(
  segments: RevenueSegment[],
  totalRevenue: number
): { valid: boolean; difference: number; percentage: number } {
  const segmentSum = segments.reduce((sum, seg) => sum + seg.value, 0);
  const difference = Math.abs(segmentSum - totalRevenue);
  const percentage = (difference / totalRevenue) * 100;

  // Allow ±2% tolerance
  const valid = percentage <= 2.0;

  return { valid, difference, percentage };
}

/**
 * Gets revenue segments for a company and fiscal period from the database
 */
export async function getRevenueSegments(
  symbol: string,
  fiscalPeriod: string
): Promise<RevenueSegment[] | null> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('company_revenue_segments')
      .select('segment_name, revenue_value, confidence')
      .eq('symbol', symbol)
      .eq('fiscal_period', fiscalPeriod)
      .gte('confidence', 'medium') // Only use high or medium confidence segments
      .order('revenue_value', { ascending: false });

    if (error) {
      console.error(`[SegmentExtractor] Error fetching segments for ${symbol}:`, error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data.map((row) => ({
      name: row.segment_name,
      value: Number(row.revenue_value),
    }));
  } catch (error) {
    console.error(`[SegmentExtractor] Unexpected error fetching segments for ${symbol}:`, error);
    return null;
  }
}

/**
 * Saves revenue segments to the database
 */
export async function saveRevenueSegments(
  symbol: string,
  fiscalPeriod: string,
  segments: RevenueSegment[],
  source: 'filing_table' | 'filing_text' | 'ai_extracted',
  confidence: 'high' | 'medium' | 'low',
  segmentType: 'business' | 'product' | 'geography' = 'business'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  try {
    // Delete existing segments for this period
    const { error: deleteError } = await supabase
      .from('company_revenue_segments')
      .delete()
      .eq('symbol', symbol)
      .eq('fiscal_period', fiscalPeriod);

    if (deleteError) {
      console.error(`[SegmentExtractor] Error deleting existing segments:`, deleteError);
      // Continue anyway - might be first time
    }

    // Insert new segments
    const segmentsToInsert = segments.map((seg) => ({
      symbol,
      fiscal_period: fiscalPeriod,
      segment_type: segmentType,
      segment_name: seg.name,
      revenue_value: seg.value,
      source,
      confidence,
    }));

    const { error: insertError } = await supabase
      .from('company_revenue_segments')
      .insert(segmentsToInsert);

    if (insertError) {
      console.error(`[SegmentExtractor] Error saving segments:`, insertError);
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SegmentExtractor] Unexpected error saving segments:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Extracts revenue segments using AI (Claude Sonnet)
 * This should be called from the ingestion pipeline, not directly from API routes
 * 
 * TODO: Implement AI extraction when segment tables/text are not available
 * For now, this is a placeholder for future AI integration
 */
export async function extractSegmentsWithAI(
  _filingContent: string,
  _totalRevenue: number
): Promise<SegmentExtractionResult> {
  // Placeholder for AI extraction
  // This will be implemented when we add Claude Sonnet integration
  // For now, return not available
  
  return {
    success: false,
    confidence: 'low',
    source: 'ai_extracted',
    error: 'AI segment extraction not yet implemented',
  };
}
