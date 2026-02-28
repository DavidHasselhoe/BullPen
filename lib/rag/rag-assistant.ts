// RAG (Retrieval-Augmented Generation) Assistant for Financial Questions
// Combines structured financial metrics and semantic document search to answer questions

import { createServerClient } from '../supabase/client';
import type { Company, FinancialMetric, Filing, FilingSection } from '../types/database';

/**
 * Structured response from RAG assistant
 */
export interface RAGResponse {
  summary: string;
  keyDrivers: string[];
  citedSources: Array<{
    filingType: string;
    section: string;
    fiscalPeriod: string;
  }>;
}

/**
 * Context assembled for LLM
 */
interface RAGContext {
  company: {
    name: string;
    ticker: string;
  };
  metrics: {
    revenue?: number;
    netIncome?: number;
    operatingIncome?: number;
    epsBasic?: number;
    epsDiluted?: number;
    grossProfit?: number;
    operatingCashFlow?: number;
    freeCashFlow?: number;
  };
  fiscalPeriod?: {
    year: number;
    quarter?: number;
    periodEndDate: string;
  };
  documentExcerpts: Array<{
    content: string;
    sectionType: string;
    sectionName: string | null;
    filingType: string;
    fiscalPeriod: string;
  }>;
}

/**
 * Error types for RAG assistant
 */
export class RAGError extends Error {
  constructor(
    message: string,
    public code: 'NO_DATA' | 'AMBIGUOUS_PERIOD' | 'LLM_ERROR' | 'MALFORMED_OUTPUT' | 'VECTOR_SEARCH_ERROR'
  ) {
    super(message);
    this.name = 'RAGError';
  }
}

/**
 * Extracts fiscal period from question (if mentioned)
 * Returns null if ambiguous or not found
 */
function extractFiscalPeriodFromQuestion(question: string): {
  year?: number;
  quarter?: number;
} | null {
  const lowerQuestion = question.toLowerCase();
  
  // Look for year patterns: "2024", "FY 2024", "fiscal year 2024"
  const yearMatch = lowerQuestion.match(/(?:fy|fiscal\s*year)?\s*20(\d{2})/);
  const year = yearMatch ? 2000 + parseInt(yearMatch[1], 10) : undefined;
  
  // Look for quarter patterns: "Q1", "Q2", "Q3", "Q4", "first quarter", etc.
  let quarter: number | undefined;
  if (lowerQuestion.match(/\bq[1-4]\b|first\s*quarter|1st\s*quarter/)) {
    quarter = 1;
  } else if (lowerQuestion.match(/\bq2\b|second\s*quarter|2nd\s*quarter/)) {
    quarter = 2;
  } else if (lowerQuestion.match(/\bq3\b|third\s*quarter|3rd\s*quarter/)) {
    quarter = 3;
  } else if (lowerQuestion.match(/\bq4\b|fourth\s*quarter|4th\s*quarter/)) {
    quarter = 4;
  }
  
  // If year is mentioned but quarter is ambiguous (e.g., "2024" could mean annual or any quarter)
  if (year && !quarter && lowerQuestion.match(/\b(annual|year|full\s*year)\b/)) {
    return { year }; // Annual period
  }
  
  // Return null if period is ambiguous (year mentioned but no clear quarter/annual indicator)
  if (year && !quarter && !lowerQuestion.match(/\b(quarter|q[1-4]|annual|year)\b/)) {
    return null; // Ambiguous
  }
  
  return year || quarter ? { year, quarter } : null;
}

/**
 * Fetches relevant financial metrics for a company
 * Filters by fiscal period if specified
 */
async function fetchRelevantMetrics(
  companyId: string,
  fiscalPeriod?: { year?: number; quarter?: number }
): Promise<FinancialMetric[]> {
  const supabase = createServerClient();
  
  let query = supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', companyId)
    .order('period_end_date', { ascending: false })
    .limit(20); // Get most recent metrics
  
  // Filter by fiscal period if specified
  if (fiscalPeriod?.year) {
    query = query.eq('fiscal_year', fiscalPeriod.year);
    
    if (fiscalPeriod.quarter) {
      query = query.eq('fiscal_quarter', fiscalPeriod.quarter);
      query = query.eq('period_type', 'quarterly');
    } else {
      // Annual period
      query = query.eq('period_type', 'annual');
    }
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new RAGError(`Failed to fetch metrics: ${error.message}`, 'NO_DATA');
  }
  
  return data || [];
}

/**
 * Performs vector similarity search on document embeddings
 * Returns top-k most relevant document excerpts
 */
async function searchDocumentEmbeddings(
  question: string,
  companyId: string,
  fiscalPeriod?: { year?: number; quarter?: number },
  limit: number = 5
): Promise<Array<{
  content: string;
  sectionType: string;
  sectionName: string | null;
  filingType: string;
  fiscalPeriod: string;
  similarity: number;
}>> {
  const supabase = createServerClient();
  
  try {
    // Generate embedding for the question
    const questionEmbedding = await generateEmbedding(question);
    
    // Call RPC function for vector similarity search
    const { data, error } = await supabase.rpc('match_document_embeddings', {
      query_embedding: questionEmbedding,
      company_id_param: companyId,
      match_threshold: 0.7, // Minimum similarity threshold (0-1)
      match_count: limit,
      fiscal_year_param: fiscalPeriod?.year || null,
      fiscal_quarter_param: fiscalPeriod?.quarter || null,
    });
    
    if (error) {
      // If RPC function doesn't exist, fall back to empty results
      // This allows the system to work even if embeddings aren't set up yet
      console.warn('[RAG] Vector search failed, continuing without document excerpts:', error.message);
      return [];
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Transform results to match expected format
    return data.map((row: any) => {
      // Format fiscal period string
      let fiscalPeriodStr = '';
      if (row.fiscal_year) {
        fiscalPeriodStr = `${row.fiscal_year}`;
        if (row.fiscal_quarter) {
          fiscalPeriodStr += ` Q${row.fiscal_quarter}`;
        } else {
          fiscalPeriodStr += ' (Annual)';
        }
      } else if (row.period_end_date) {
        fiscalPeriodStr = row.period_end_date;
      } else {
        fiscalPeriodStr = 'Unknown';
      }
      
      return {
        content: row.content_text || '',
        sectionType: row.section_type || 'other',
        sectionName: row.section_name || null,
        filingType: row.filing_type || 'Unknown',
        fiscalPeriod: fiscalPeriodStr,
        similarity: row.similarity || 0,
      };
    });
  } catch (error) {
    // If vector search fails (e.g., embeddings table doesn't exist), continue without excerpts
    console.warn('[RAG] Vector search error, continuing without document excerpts:', error);
    return [];
  }
}

/**
 * Generates embedding vector for text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new RAGError('OPENAI_API_KEY not configured', 'LLM_ERROR');
  }
  
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new RAGError(`OpenAI embedding API error: ${response.status} - ${error}`, 'LLM_ERROR');
  }
  
  const result = await response.json();
  return result.data[0].embedding;
}

/**
 * Assembles context from metrics and document excerpts
 */
function assembleContext(
  company: Company,
  metrics: FinancialMetric[],
  documentExcerpts: Array<{
    content: string;
    sectionType: string;
    sectionName: string | null;
    filingType: string;
    fiscalPeriod: string;
  }>,
  fiscalPeriod?: { year?: number; quarter?: number }
): RAGContext {
  // Extract key metrics from the most recent period
  const latestMetric = metrics[0];
  const metricsMap: RAGContext['metrics'] = {};
  
  for (const metric of metrics) {
    switch (metric.metric_type) {
      case 'revenue':
        metricsMap.revenue = Number(metric.value);
        break;
      case 'net_income':
        metricsMap.netIncome = Number(metric.value);
        break;
      case 'operating_income':
        metricsMap.operatingIncome = Number(metric.value);
        break;
      case 'eps_basic':
        metricsMap.epsBasic = Number(metric.value);
        break;
      case 'eps_diluted':
        metricsMap.epsDiluted = Number(metric.value);
        break;
      case 'gross_profit':
        metricsMap.grossProfit = Number(metric.value);
        break;
      case 'operating_cash_flow':
        metricsMap.operatingCashFlow = Number(metric.value);
        break;
      case 'free_cash_flow':
        metricsMap.freeCashFlow = Number(metric.value);
        break;
    }
  }
  
  return {
    company: {
      name: company.name,
      ticker: company.ticker,
    },
    metrics: metricsMap,
    fiscalPeriod: latestMetric
      ? {
          year: latestMetric.fiscal_year || undefined,
          quarter: latestMetric.fiscal_quarter || undefined,
          periodEndDate: latestMetric.period_end_date,
        }
      : undefined,
    documentExcerpts,
  };
}

/**
 * Generates LLM prompt with context
 */
function generateLLMPrompt(question: string, context: RAGContext): string {
  const metricsText = Object.entries(context.metrics)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => {
      const formatted = typeof value === 'number' && value >= 1000000
        ? `$${(value / 1000000).toFixed(2)}M`
        : typeof value === 'number' && value >= 1000
        ? `$${(value / 1000).toFixed(2)}K`
        : value?.toString();
      return `  - ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${formatted}`;
    })
    .join('\n');
  
  const periodText = context.fiscalPeriod
    ? `Fiscal Period: ${context.fiscalPeriod.year}${context.fiscalPeriod.quarter ? ` Q${context.fiscalPeriod.quarter}` : ' (Annual)'} (Ended: ${context.fiscalPeriod.periodEndDate})`
    : 'Fiscal Period: Not specified';
  
  const excerptsText = context.documentExcerpts
    .map((excerpt, idx) => {
      return `[Excerpt ${idx + 1}]
Section: ${excerpt.sectionType}${excerpt.sectionName ? ` - ${excerpt.sectionName}` : ''}
Filing: ${excerpt.filingType} (${excerpt.fiscalPeriod})
Content: ${excerpt.content.substring(0, 500)}${excerpt.content.length > 500 ? '...' : ''}`;
    })
    .join('\n\n');
  
  return `You are a financial analyst assistant answering questions about ${context.company.name} (${context.company.ticker}).

CRITICAL RULES:
- Answer ONLY based on the provided context
- Explain numbers and trends, do NOT predict prices or give investment advice
- Cite specific sources when referencing data
- Use professional, analytical tone
- If context is insufficient, state what information is missing

FINANCIAL METRICS:
${metricsText || 'No metrics available'}

${periodText}

RELEVANT DOCUMENT EXCERPTS:
${excerptsText || 'No document excerpts available'}

USER QUESTION: ${question}

Provide a structured response with:
1. A concise summary (2-4 sentences)
2. Key drivers (3-5 bullet points explaining what drove the results)
3. Cited sources (list of filing sections referenced)`;
}

/**
 * Calls LLM API to generate answer
 */
async function callLLM(prompt: string): Promise<RAGResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new RAGError('OPENAI_API_KEY not configured', 'LLM_ERROR');
  }
  
  const systemPrompt = `You are a financial analyst assistant. Your role is to:
- Explain financial data and trends clearly
- Cite sources from SEC filings
- Avoid making predictions or investment recommendations
- Use professional, analytical language
- Output valid JSON only

Output format (strict JSON):
{
  "summary": "2-4 sentence summary of the answer",
  "keyDrivers": ["driver 1", "driver 2", "driver 3"],
  "citedSources": [
    {
      "filingType": "10-Q",
      "section": "Management Discussion and Analysis",
      "fiscalPeriod": "2024 Q1"
    }
  ]
}`;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2, // Low temperature for consistency
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
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
    throw new RAGError(`OpenAI API error: ${response.status} - ${error}`, 'LLM_ERROR');
  }
  
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new RAGError('No content in LLM response', 'MALFORMED_OUTPUT');
  }
  
  // Parse JSON response
  let parsed: RAGResponse;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new RAGError(`Failed to parse LLM JSON response: ${e}`, 'MALFORMED_OUTPUT');
  }
  
  // Validate structure
  if (
    !parsed.summary ||
    !Array.isArray(parsed.keyDrivers) ||
    !Array.isArray(parsed.citedSources)
  ) {
    throw new RAGError('Invalid response structure from LLM', 'MALFORMED_OUTPUT');
  }
  
  // Validate citedSources structure
  for (const source of parsed.citedSources) {
    if (!source.filingType || !source.section || !source.fiscalPeriod) {
      throw new RAGError('Invalid citedSources structure', 'MALFORMED_OUTPUT');
    }
  }
  
  return parsed;
}

/**
 * Main RAG assistant function
 * Answers financial questions using retrieved context
 */
export async function answerFinancialQuestion(
  question: string,
  companyId: string
): Promise<RAGResponse> {
  const supabase = createServerClient();
  
  // Step 1: Fetch company info
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();
  
  if (companyError || !company) {
    throw new RAGError(`Company not found: ${companyError?.message || 'Not found'}`, 'NO_DATA');
  }
  
  // Step 2: Extract fiscal period from question (if mentioned)
  const fiscalPeriod = extractFiscalPeriodFromQuestion(question);
  
  if (fiscalPeriod === null) {
    // Ambiguous period - could mean multiple things
    // For now, we'll use the most recent period
    // In production, you might want to ask for clarification
  }
  
  // Step 3: Fetch relevant financial metrics
  const metrics = await fetchRelevantMetrics(companyId, fiscalPeriod || undefined);
  
  if (metrics.length === 0) {
    throw new RAGError(
      `No financial metrics found for ${company.name}${fiscalPeriod ? ` for ${fiscalPeriod.year}${fiscalPeriod.quarter ? ` Q${fiscalPeriod.quarter}` : ''}` : ''}`,
      'NO_DATA'
    );
  }
  
  // Step 4: Perform vector similarity search on document embeddings
  const documentExcerpts = await searchDocumentEmbeddings(
    question,
    companyId,
    fiscalPeriod || undefined,
    5 // Top 5 most relevant excerpts
  );
  
  // Step 5: Assemble context
  const context = assembleContext(company, metrics, documentExcerpts, fiscalPeriod || undefined);
  
  // Step 6: Generate LLM prompt
  const prompt = generateLLMPrompt(question, context);
  
  // Step 7: Call LLM API
  const response = await callLLM(prompt);
  
  return response;
}
