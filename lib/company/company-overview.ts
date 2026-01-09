// Company Overview Generator
// Generates a concise AI-powered company overview summary

import { createServerClient } from '../supabase/client';
import type { Company } from '../types/database';

/**
 * Result of company overview operations
 */
export interface CompanyOverviewResult {
  success: boolean;
  overview?: string;
  error?: string;
}

/**
 * Generates a company overview using OpenAI
 * Creates a 2-4 sentence summary describing the company's business model, products, and markets
 */
async function generateCompanyOverviewWithAI(
  companyName: string,
  ticker: string,
  businessDescription?: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  // Build the prompt
  let prompt = `Write a concise company overview for ${companyName} (${ticker}). 

Requirements:
- 2-4 sentences maximum
- Describe: core business model, main products/services, primary customers or markets
- Avoid: financial performance, price, valuation, predictions, marketing language
- Tone: Neutral, encyclopedic, professional
- Read like: "${companyName} operates a global technology platform that connects consumers with transportation, delivery, and logistics services through its mobile applications..."

`;

  if (businessDescription) {
    const truncated = businessDescription.slice(0, 10000); // Limit context length
    prompt += `\nUse this business description from their latest 10-K filing as the primary source:\n\n${truncated}\n\n`;
  }

  prompt += `\nOutput only the overview text, no labels or formatting.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2, // Low temperature for consistency
      max_tokens: 300, // Limit to 2-4 sentences
      messages: [
        {
          role: 'system',
          content: 'You are a financial data analyst writing encyclopedic company descriptions. Output plain text only, no labels or formatting.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  return content;
}

/**
 * Gets business description from the latest 10-K filing
 */
async function getBusinessDescriptionFromLatest10K(companyId: string): Promise<string | null> {
  const supabase = createServerClient();

  // Get the latest completed 10-K filing
  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select('id')
    .eq('company_id', companyId)
    .eq('filing_type', '10-K')
    .eq('processing_status', 'completed')
    .order('filing_date', { ascending: false })
    .limit(1)
    .single();

  if (filingError || !filing) {
    return null;
  }

  // Get the business_overview section from this filing
  const { data: section, error: sectionError } = await supabase
    .from('filing_sections')
    .select('content')
    .eq('filing_id', filing.id)
    .eq('section_type', 'business_overview')
    .order('section_order', { ascending: true })
    .limit(1)
    .single();

  if (sectionError || !section) {
    return null;
  }

  return section.content;
}

/**
 * Gets or generates company overview
 * Returns cached overview if available, otherwise generates and caches it
 */
export async function getCompanyOverview(companyId: string): Promise<CompanyOverviewResult> {
  const supabase = createServerClient();

  try {
    // Step 1: Check if overview is already cached in company metadata
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, ticker, metadata')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return {
        success: false,
        error: `Company not found: ${companyError?.message || 'Unknown error'}`,
      };
    }

    const typedCompany = company as Company;
    const metadata = typedCompany.metadata || {};

    // Check if overview exists in metadata
    if (metadata.company_overview && typeof metadata.company_overview === 'string') {
      return {
        success: true,
        overview: metadata.company_overview,
      };
    }

    // Step 2: Generate new overview
    // Get business description from latest 10-K
    const businessDescription = await getBusinessDescriptionFromLatest10K(companyId);

    // Generate overview using AI
    const overview = await generateCompanyOverviewWithAI(
      typedCompany.name,
      typedCompany.ticker,
      businessDescription || undefined
    );

    // Step 3: Store in company metadata
    const updatedMetadata = {
      ...metadata,
      company_overview: overview,
      company_overview_generated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('companies')
      .update({ metadata: updatedMetadata })
      .eq('id', companyId);

    if (updateError) {
      console.error('Error updating company metadata:', updateError);
      // Still return the overview even if metadata update fails
    }

    return {
      success: true,
      overview,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
