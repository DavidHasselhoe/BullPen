// Database Operations for AI Insights
// Stores AI-generated analysis in the ai_insights table

import { createServerClient } from '../supabase/client';
import type { AIInsight, InsertAIInsight, InsightType } from '../types/database';
import type { SectionInsight } from './ai-analyzer';

/**
 * Result of AI insight database operations
 */
export interface InsightDBResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Creates an AI insight record in the database
 */
export async function createAIInsight(params: {
  filingId: string;
  companyId: string;
  sectionId: string;
  insightType: InsightType;
  title: string;
  content: SectionInsight;
  modelVersion: string;
  modelParameters?: Record<string, unknown>;
}): Promise<InsightDBResult<AIInsight>> {
  const supabase = createServerClient();

  try {
    const insightData: InsertAIInsight = {
      filing_id: params.filingId,
      company_id: params.companyId,
      section_id: params.sectionId,
      insight_type: params.insightType,
      title: params.title,
      content: params.content as unknown, // JSONB field
      summary: params.content.summary,
      confidence_score: params.content.confidence,
      model_version: params.modelVersion,
      model_parameters: params.modelParameters || null,
    };

    const { data, error } = await supabase
      .from('ai_insights')
      .insert(insightData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets AI insights for a filing
 */
export async function getFilingInsights(
  filingId: string
): Promise<InsightDBResult<AIInsight[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('ai_insights')
      .select('*')
      .eq('filing_id', filingId)
      .order('created_at', { ascending: false });

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

/**
 * Gets AI insights for a specific section
 */
export async function getSectionInsights(
  sectionId: string
): Promise<InsightDBResult<AIInsight[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('ai_insights')
      .select('*')
      .eq('section_id', sectionId)
      .order('created_at', { ascending: false });

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

/**
 * Checks if AI insights already exist for a section
 */
export async function insightExistsForSection(
  sectionId: string,
  modelVersion: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('ai_insights')
    .select('id')
    .eq('section_id', sectionId)
    .eq('model_version', modelVersion)
    .single();

  return !error && data !== null;
}

/**
 * Deletes AI insights for a filing (useful for re-running analysis)
 */
export async function deleteFilingInsights(
  filingId: string
): Promise<InsightDBResult<void>> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase
      .from('ai_insights')
      .delete()
      .eq('filing_id', filingId);

    if (error) {
      return { success: false, error: error.message };
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
 * Maps section type to insight type
 * Determines what kind of insight to generate based on section
 */
export function mapSectionToInsightType(sectionType: string): InsightType {
  switch (sectionType) {
    case 'business_overview':
      return 'executive_summary';
    case 'risk_factors':
      return 'risk_analysis';
    case 'management_discussion_analysis':
      return 'executive_summary';
    case 'legal_proceedings':
      return 'other';
    case 'financial_statements':
      return 'other';
    case 'controls_procedures':
      return 'other';
    default:
      return 'other';
  }
}
