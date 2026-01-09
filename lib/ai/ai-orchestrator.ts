// AI Analysis Orchestrator
// Coordinates AI analysis of filing sections and stores results

import { createServerClient } from '../supabase/client';
import { analyzeSection, getModelInfo } from './ai-analyzer';
import {
  createAIInsight,
  mapSectionToInsightType,
  insightExistsForSection,
} from './ai-insights-db';
import type { FilingSection } from '../types/database';

/**
 * Progress callback for AI analysis
 */
export type AIProgressCallback = (step: string, details?: any) => void;

/**
 * Result of AI analysis for a filing
 */
export interface AIAnalysisResult {
  success: boolean;
  filingId?: string;
  sectionsAnalyzed?: number;
  insightsCreated?: number;
  errors?: string[];
  details?: {
    companyName?: string;
    filingType?: string;
    sectionResults?: Array<{
      sectionType: string;
      success: boolean;
      error?: string;
    }>;
  };
}

/**
 * Analyzes all sections of a filing with AI
 * 
 * Process:
 * 1. Fetch filing and sections from database
 * 2. For each section, run AI analysis
 * 3. Store insights in ai_insights table
 * 4. Track progress and errors
 */
export async function analyzeFilingSections(
  filingId: string,
  options: {
    skipExisting?: boolean;
    onProgress?: AIProgressCallback;
  } = {}
): Promise<AIAnalysisResult> {
  const { skipExisting = true, onProgress } = options;
  const supabase = createServerClient();

  try {
    // Step 1: Fetch filing with company info and sections
    onProgress?.('Fetching filing and sections from database');
    
    const { data: filing, error: filingError } = await supabase
      .from('filings')
      .select(`
        *,
        company:companies(*),
        filing_sections(*)
      `)
      .eq('id', filingId)
      .single();

    if (filingError || !filing) {
      return {
        success: false,
        errors: [`Failed to fetch filing: ${filingError?.message || 'Not found'}`],
      };
    }

    const sections = (filing as any).filing_sections as FilingSection[];
    const company = (filing as any).company;

    if (!sections || sections.length === 0) {
      return {
        success: false,
        errors: ['No sections found for filing'],
      };
    }

    onProgress?.('Filing loaded', {
      companyName: company.name,
      filingType: filing.filing_type,
      sectionsCount: sections.length,
    });

    // Step 2: Get model info for audit trail
    const modelInfo = getModelInfo();
    onProgress?.('AI model initialized', {
      model: modelInfo.version,
      temperature: modelInfo.config.temperature,
    });

    // Step 3: Analyze each section
    const sectionResults: Array<{ sectionType: string; success: boolean; error?: string }> = [];
    let insightsCreated = 0;
    const errors: string[] = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      onProgress?.(`Analyzing section ${i + 1}/${sections.length}`, {
        sectionType: section.section_type,
        sectionName: section.section_name,
      });

      try {
        // Check if insight already exists
        if (skipExisting) {
          const exists = await insightExistsForSection(section.id, modelInfo.version);
          if (exists) {
            onProgress?.(`Skipping ${section.section_type} (already analyzed)`);
            sectionResults.push({
              sectionType: section.section_type,
              success: true,
            });
            continue;
          }
        }

        // Run AI analysis
        const insight = await analyzeSection(section.section_type, section.content);
        onProgress?.(`AI analysis completed for ${section.section_type}`, {
          confidence: insight.confidence,
          sentiment: insight.sentiment,
        });

        // Store insight in database
        const insightType = mapSectionToInsightType(section.section_type);
        const result = await createAIInsight({
          filingId: filing.id,
          companyId: company.id,
          sectionId: section.id,
          insightType,
          title: `${section.section_name} - AI Analysis`,
          content: insight,
          modelVersion: modelInfo.version,
          modelParameters: modelInfo.config,
        });

        if (result.success) {
          insightsCreated++;
          onProgress?.(`Stored insight for ${section.section_type}`);
          sectionResults.push({
            sectionType: section.section_type,
            success: true,
          });
        } else {
          errors.push(`Failed to store insight for ${section.section_type}: ${result.error}`);
          sectionResults.push({
            sectionType: section.section_type,
            success: false,
            error: result.error,
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Error analyzing ${section.section_type}: ${errorMsg}`);
        sectionResults.push({
          sectionType: section.section_type,
          success: false,
          error: errorMsg,
        });
      }

      // Small delay between API calls to avoid rate limits
      if (i < sections.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    onProgress?.('AI analysis completed for all sections');

    return {
      success: errors.length === 0,
      filingId: filing.id,
      sectionsAnalyzed: sections.length,
      insightsCreated,
      errors: errors.length > 0 ? errors : undefined,
      details: {
        companyName: company.name,
        filingType: filing.filing_type,
        sectionResults,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
    };
  }
}

/**
 * Re-analyzes a filing (deletes existing insights and runs analysis again)
 */
export async function reanalyzeFilingSections(
  filingId: string,
  onProgress?: AIProgressCallback
): Promise<AIAnalysisResult> {
  // Delete existing insights
  onProgress?.('Deleting existing insights for re-analysis');
  
  const { deleteFilingInsights } = await import('./ai-insights-db');
  await deleteFilingInsights(filingId);

  // Run analysis with skipExisting=false
  return analyzeFilingSections(filingId, {
    skipExisting: false,
    onProgress,
  });
}
