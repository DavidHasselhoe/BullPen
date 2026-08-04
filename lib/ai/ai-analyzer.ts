// AI Analyzer for SEC Filing Sections
// Generates structured, deterministic insights from filing content

import type { SectionType } from '../types/database';

/**
 * Structured AI insight for a filing section
 */
export interface SectionInsight {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  key_points: string[];
  risk_flags: string[];
  confidence: number;
}

/**
 * AI model configuration
 */
export interface AIModelConfig {
  model: string;
  temperature: number;
  max_tokens: number;
}

/**
 * Default model configuration
 * Using low temperature for deterministic outputs
 * Using gpt-3.5-turbo for cost efficiency (cheaper than gpt-4o-mini)
 */
const DEFAULT_MODEL_CONFIG: AIModelConfig = {
  model: 'gpt-4o-mini',
  temperature: 0.1, // Low temperature for consistency
  max_tokens: 2000,
};

/**
 * Generates a deterministic prompt for analyzing a filing section
 * Prompt structure ensures JSON-only output with specific fields
 */
function generatePrompt(sectionType: SectionType, content: string): string {
  const truncatedContent = truncateContent(content, 15000);
  
  const sectionDescriptions: Record<SectionType, string> = {
    business_overview: 'This is the Business section (Item 1) describing the company\'s operations, products, and services.',
    risk_factors: 'This is the Risk Factors section (Item 1A) disclosing material risks to the business.',
    legal_proceedings: 'This is the Legal Proceedings section (Item 3) describing material legal matters.',
    management_discussion_analysis: 'This is the MD&A section (Item 7) with management\'s analysis of financial condition and results.',
    financial_statements: 'This is the Financial Statements section (Item 8) containing consolidated financial data.',
    controls_procedures: 'This is the Controls and Procedures section (Item 9A) evaluating internal controls.',
    notes_to_financials: 'This is the Notes to Financial Statements section with detailed accounting disclosures.',
    other: 'This is a filing section requiring analysis.',
  };

  const sectionDescription = sectionDescriptions[sectionType] || sectionDescriptions.other;

  return `You are analyzing a SEC 10-K filing section. ${sectionDescription}

TASK: Extract structured insights from this section.

SECTION CONTENT:
${truncatedContent}

OUTPUT FORMAT: Return ONLY valid JSON matching this exact structure (no additional text):
{
  "summary": "A concise, factual summary in 3-5 sentences. State only facts from the text. Use neutral, professional language.",
  "sentiment": "positive | neutral | negative - Overall tone based on business outlook, risks, and performance indicators",
  "key_points": ["Bullet point 1", "Bullet point 2", "Bullet point 3"] - 3-7 most important factual points,
  "risk_flags": ["Risk 1", "Risk 2"] - Explicit risks mentioned in this section (empty array if none),
  "confidence": 0.95 - Your confidence in this analysis (0.0 to 1.0)
}

RULES:
- Output ONLY the JSON object, nothing else
- Summary must be 3-5 complete sentences
- Sentiment must be one of: positive, neutral, negative
- Key points must be factual statements from the text
- Risk flags are explicit risks mentioned (not implied)
- Confidence should reflect text clarity and completeness
- Use professional, neutral language
- Do not speculate beyond what is stated
- Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead`;
}

/**
 * Truncates content to fit within token limits
 * Preserves beginning and end for context
 */
function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  // Keep first 60% and last 20% to preserve context
  const firstChunk = Math.floor(maxChars * 0.6);
  const lastChunk = Math.floor(maxChars * 0.2);

  const beginning = content.slice(0, firstChunk);
  const ending = content.slice(-lastChunk);

  return `${beginning}\n\n[... middle section truncated for length ...]\n\n${ending}`;
}

/**
 * Validates AI response structure
 */
function validateInsight(data: unknown): data is SectionInsight {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  // Check required fields
  if (typeof data.summary !== 'string' || data.summary.length < 50) {
    return false;
  }

  if (!['positive', 'neutral', 'negative'].includes(data.sentiment)) {
    return false;
  }

  if (!Array.isArray(data.key_points) || data.key_points.length < 2) {
    return false;
  }

  if (!Array.isArray(data.risk_flags)) {
    return false;
  }

  if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
    return false;
  }

  return true;
}

/**
 * Analyzes a filing section using OpenAI API
 * Returns structured insights with confidence score
 */
export async function analyzeSectionWithOpenAI(
  sectionType: SectionType,
  content: string,
  config: AIModelConfig = DEFAULT_MODEL_CONFIG
): Promise<SectionInsight> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  const prompt = generatePrompt(sectionType, content);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a financial analyst extracting structured insights from SEC filings. Output valid JSON only.',
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
  const content_text = result.choices?.[0]?.message?.content;

  if (!content_text) {
    throw new Error('No content in OpenAI response');
  }

  // Parse JSON response
  let parsed;
  try {
    parsed = JSON.parse(content_text);
  } catch (e) {
    throw new Error(`Failed to parse OpenAI JSON response: ${e}`);
  }

  // Validate structure
  if (!validateInsight(parsed)) {
    throw new Error('Invalid insight structure from OpenAI');
  }

  return parsed;
}

/**
 * Analyzes a filing section (currently uses OpenAI, can be swapped)
 */
export async function analyzeSection(
  sectionType: SectionType,
  content: string
): Promise<SectionInsight> {
  return analyzeSectionWithOpenAI(sectionType, content);
}

/**
 * Gets the model configuration for audit trail
 */
export function getModelInfo(): { name: string; version: string; config: AIModelConfig } {
  return {
    name: 'openai',
    version: DEFAULT_MODEL_CONFIG.model,
    config: DEFAULT_MODEL_CONFIG,
  };
}
