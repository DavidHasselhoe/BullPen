// Financial Table Extractor
// Extracts metrics from HTML/structured tables in SEC filings using strict rules
// This is a fallback when XBRL data doesn't provide quarterly values

import type { PeriodScope } from './period-classification';

/**
 * All metrics we extract from income statement tables
 */
export type TableExtractedMetricType =
  | 'eps_diluted'
  | 'eps_basic'
  | 'revenue'
  | 'cost_of_revenue'
  | 'gross_profit'
  | 'operating_income'
  | 'net_income'
  | 'operating_cash_flow'
  | 'capital_expenditures' // Used for FCF calculation (OCF - CapEx)
  | 'free_cash_flow'; // Calculated: OCF - CapEx

/**
 * Extracted metric from a financial table
 */
export interface TableExtractedMetric {
  metric: TableExtractedMetricType;
  value: number;
  period_scope: PeriodScope;
  period_label: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

/**
 * Result of table extraction
 */
export interface TableExtractionResult {
  metrics: TableExtractedMetric[];
  rawOutput?: string;
  error?: string;
}

/**
 * System prompt for strict financial table extraction
 */
export const TABLE_EXTRACTION_PROMPT = `System Instruction

You are a financial document extraction engine.

Your task is to read a financial statement table exactly as written and extract only explicitly stated values.
You must never calculate, infer, estimate, subtract, or guess any financial metric.

If a value is not clearly present in the provided table, you must omit it entirely.

User Instruction

You are given ONE financial statement table extracted from an SEC filing (10-Q, 10-K, 6-K, or 20-F).

Your job is to extract explicitly stated financial metrics that meet all of the following conditions:

✅ EXTRACTION RULES (STRICT)

ONLY extract values that are explicitly shown in the table

Do NOT calculate quarterly values from YTD

Do NOT derive EPS from net income

Do NOT subtract periods

Do NOT normalize or adjust values

ONLY extract values under a column labeled exactly or clearly equivalent to:

{{COLUMN_INSTRUCTIONS}}

EXTRACT ALL AVAILABLE {{PERIOD_LABEL}} METRICS from the table. Map row labels to these metric names:

1. revenue: "Revenue", "Revenues", "Net revenue", "Total revenue", "Sales", "Net sales", "Total net revenue"
2. cost_of_revenue: "Cost of revenue", "Cost of goods sold", "Cost of sales", "Total cost of revenue", "Cost of products"
3. gross_profit: "Gross profit", "Gross margin"
4. operating_income: "Operating income", "Operating income (loss)", "Income from operations"
5. net_income: "Net income", "Net income (loss)", "Net earnings", "Net income attributable to common stockholders", "Net income (loss) attributable to"
6. eps_basic: "Earnings per share – basic", "EPS (basic)", "Basic earnings per share", "Basic net income per share"
7. eps_diluted: "Earnings per share – diluted", "EPS (diluted)", "Net income per share – diluted", "Diluted earnings per share", "Diluted net income per share"
8. operating_cash_flow: "Net cash provided by (used in) operating activities", "Cash flows from operating activities", "Net cash from operating activities", "Operating activities"
9. capital_expenditures: "Payments for property, plant and equipment", "Capital expenditures", "Purchase of property and equipment", "Additions to property, plant and equipment"

TABLE STRUCTURE: Row labels (Revenue, Cost of revenue, etc.) are in the first column. Values are in the quarterly column.
Match each row label to the metric type and extract the numeric value. Strip $ and commas from numbers.
If table says "(in millions)" or "($ in millions)", multiply the value by 1,000,000. EPS values stay as-is (per share).
Return the final numeric value (e.g. revenue 46743 in millions → 46743000000).

CRITICAL: Extract EVERY metric that has a row label match and a value in the {{PERIOD_LABEL_LOWER}} column. Do NOT return empty. Use period_scope "{{PERIOD_SCOPE}}" for all metrics.

🧠 WHAT YOU ARE ALLOWED TO DO

Read table headers

Match row labels to known metric names

Read numeric values

Return structured JSON

🚫 WHAT YOU ARE NOT ALLOWED TO DO

Compute values

Infer missing metrics

Convert YTD → quarterly

Use values from other columns

Use values from other tables

Guess based on prior filings

📤 OUTPUT FORMAT (STRICT JSON ONLY)

Return a JSON object with this exact structure:

{
  "metrics": [
    {
      "metric": "eps_diluted",
      "value": 1.30,
      "period_scope": "{{PERIOD_SCOPE}}",
      "period_label": "{{PERIOD_LABEL_EXAMPLE}}",
      "confidence": "high",
      "source": "filing_income_statement"
    },
    {
      "metric": "revenue",
      "value": 5000000000,
      "period_scope": "{{PERIOD_SCOPE}}",
      "period_label": "{{PERIOD_LABEL_EXAMPLE}}",
      "confidence": "high",
      "source": "filing_income_statement"
    },
    {
      "metric": "cost_of_revenue",
      "value": 2000000000,
      "period_scope": "{{PERIOD_SCOPE}}",
      "period_label": "{{PERIOD_LABEL_EXAMPLE}}",
      "confidence": "high",
      "source": "filing_income_statement"
    },
    {
      "metric": "gross_profit",
      "value": 3000000000,
      "period_scope": "{{PERIOD_SCOPE}}",
      "period_label": "{{PERIOD_LABEL_EXAMPLE}}",
      "confidence": "high",
      "source": "filing_income_statement"
    }
  ]
}

⚠️ IMPORTANT OUTPUT RULES

If no qualifying {{PERIOD_LABEL_LOWER}} metrics exist, return:

{ "metrics": [] }

Extract ALL available {{PERIOD_LABEL_LOWER}} metrics: revenue, cost_of_revenue, gross_profit, operating_income, net_income, eps_basic, eps_diluted. Do not skip any.


Do NOT include explanations

Do NOT include commentary

Do NOT include derived metrics

Do NOT include values from non-{{PERIOD_LABEL_LOWER}} columns

🧪 VALIDATION CHECK (MENTAL)

Before returning a value, ask yourself:

"Is this value explicitly printed under a {{COLUMN_CHECK}} column in the provided table?"

If the answer is not YES, do not include it.

INPUT

Below is the extracted financial statement table (HTML or structured rows):

{{INCOME_STATEMENT_TABLE}}

FINAL REMINDER

You are a reader, not an analyst.
If the filing does not say it, you do not return it.`;

/**
 * Extracts income statement tables from filing content
 * Looks for HTML tables containing financial data
 */
export function extractIncomeStatementTables(filingContent: string): string[] {
  // Find tables that likely contain income statement data
  // Look for EPS-related keywords in table headers/rows
  const tablePattern = /<table[^>]*>[\s\S]*?<\/table>/gi;
  const tables: string[] = [];
  
  let match;
  while ((match = tablePattern.exec(filingContent)) !== null) {
    const tableHtml = match[0];
    
    // Check if table contains EPS-related terms
    const hasEPS = /earnings\s*per\s*share|eps|diluted|basic/i.test(tableHtml);
    // Check if table has period columns
    const hasPeriods = /three\s*months|quarter|months\s*ended|nine\s*months|year.*date/i.test(tableHtml);
    
    if (hasEPS && hasPeriods) {
      tables.push(tableHtml);
    }
  }
  
  return tables;
}

/**
 * Converts HTML table to structured text format for LLM processing
 */
export function tableToStructuredText(tableHtml: string): string {
  // Extract text content from HTML table, preserving structure
  // Remove HTML tags but keep row/column structure
  
  // Simple HTML-to-text conversion (can be enhanced with proper HTML parser)
  let text = tableHtml
    .replace(/<thead[^>]*>/gi, '\n[HEADER]\n')
    .replace(/<\/thead>/gi, '\n[/HEADER]\n')
    .replace(/<tbody[^>]*>/gi, '\n[DATA]\n')
    .replace(/<\/tbody>/gi, '\n[/DATA]\n')
    .replace(/<tr[^>]*>/gi, '\n[ROW]\n')
    .replace(/<\/tr>/gi, '\n[/ROW]\n')
    .replace(/<th[^>]*>/gi, '[COL]')
    .replace(/<\/th>/gi, '[/COL]')
    .replace(/<td[^>]*>/gi, '[COL]')
    .replace(/<\/td>/gi, '[/COL]')
    .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
    .replace(/\[COL\]\s*\[COL\]/g, '[COL]') // Clean up empty columns
    .replace(/\n{3,}/g, '\n\n'); // Normalize whitespace
  
  return text.trim();
}

/**
 * Parses LLM JSON response and validates structure
 */
export function parseExtractionResponse(response: string): TableExtractionResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        metrics: [],
        error: 'No JSON found in response',
        rawOutput: response,
      };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate structure
    if (!parsed.metrics || !Array.isArray(parsed.metrics)) {
      return {
        metrics: [],
        error: 'Invalid response structure: missing metrics array',
        rawOutput: response,
      };
    }
    
    // Validate each metric - accept both Q (quarterly) and FY (annual)
    const validMetrics: TableExtractedMetric[] = [];
    const allowedMetrics: TableExtractedMetricType[] = [
      'eps_diluted', 'eps_basic', 'revenue', 'cost_of_revenue', 'gross_profit',
      'operating_income', 'net_income', 'operating_cash_flow', 'capital_expenditures',
    ];
    
    for (const metric of parsed.metrics) {
      if (
        allowedMetrics.includes(metric.metric as TableExtractedMetricType) &&
        typeof metric.value === 'number' &&
        isFinite(metric.value) &&
        typeof metric.period_scope === 'string' &&
        (metric.period_scope === 'Q' || metric.period_scope === 'FY') &&
        typeof metric.period_label === 'string' &&
        metric.period_label.trim().length > 0
      ) {
        validMetrics.push({
          metric: metric.metric as TableExtractedMetric['metric'],
          value: metric.value,
          period_scope: metric.period_scope as PeriodScope,
          period_label: metric.period_label,
          confidence: metric.confidence || 'medium',
          source: metric.source || 'filing_income_statement',
        });
      }
    }
    
    return {
      metrics: validMetrics,
      rawOutput: response,
    };
  } catch (error) {
    return {
      metrics: [],
      error: `Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      rawOutput: response,
    };
  }
}

/** Prompt variants for quarterly vs annual extraction */
const QUARTERLY_COLUMN_INSTRUCTIONS = `"Three Months Ended", "Three months ended", "Quarter Ended"
❌ Reject: "Nine Months Ended", "Year to Date", "TTM", "Fiscal Year", Any cumulative period`;
const ANNUAL_COLUMN_INSTRUCTIONS = `"Year Ended", "Fiscal Year", "Twelve Months Ended", "FY 2024" (or year), "Full Year"
❌ Reject: "Three Months Ended", "Nine Months Ended", "Quarter Ended", "YTD", Any quarterly/cumulative period`;

/**
 * Extract metrics from table using OpenAI
 * @param tableHtml - Raw HTML table (used when structuredTable not provided)
 * @param llmProvider - LLM provider
 * @param structuredTableOverride - Optional: use this instead of converting tableHtml (e.g. filtered content)
 * @param periodScope - 'Q' for quarterly (10-Q), 'FY' for annual (10-K)
 */
export async function extractMetricsFromTable(
  tableHtml: string,
  llmProvider: 'openai' | 'anthropic' | 'local' = 'openai',
  structuredTableOverride?: string,
  periodScope: 'Q' | 'FY' = 'Q'
): Promise<TableExtractionResult> {
  // Use filtered/normalized content when provided
  const structuredTable = structuredTableOverride && structuredTableOverride.length > 100
    ? structuredTableOverride
    : tableToStructuredText(tableHtml);
  
  const isAnnual = periodScope === 'FY';
  const columnInstructions = isAnnual ? ANNUAL_COLUMN_INSTRUCTIONS : QUARTERLY_COLUMN_INSTRUCTIONS;
  const periodLabel = isAnnual ? 'ANNUAL' : 'QUARTERLY';
  const periodLabelLower = isAnnual ? 'annual' : 'quarterly';
  const periodLabelExample = isAnnual ? 'Year Ended January 28, 2024' : 'Three Months Ended September 30, 2024';
  const columnCheck = isAnnual ? 'Year-Ended/Fiscal-Year' : 'Three-Months-Ended';
  
  // Build prompt with table content and period-specific instructions
  let prompt = TABLE_EXTRACTION_PROMPT
    .replace(/\{\{COLUMN_INSTRUCTIONS\}\}/g, columnInstructions)
    .replace(/\{\{PERIOD_LABEL\}\}/g, periodLabel)
    .replace(/\{\{PERIOD_LABEL_LOWER\}\}/g, periodLabelLower)
    .replace(/\{\{PERIOD_SCOPE\}\}/g, periodScope)
    .replace(/\{\{PERIOD_LABEL_EXAMPLE\}\}/g, periodLabelExample)
    .replace(/\{\{COLUMN_CHECK\}\}/g, columnCheck)
    .replace(/\{\{INCOME_STATEMENT_TABLE\}\}/g, structuredTable);
  
  // Split into system (before INPUT) and user (INPUT + table) parts
  const systemPrompt = prompt.split('INPUT')[0].trim();
  const userContent = `INPUT\n\nBelow is the extracted financial statement table (HTML or structured rows):\n\n${structuredTable}\n\nFINAL REMINDER\n\nYou are a reader, not an analyst.\nIf the filing does not say it, you do not return it.`;
  
  if (llmProvider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return {
        metrics: [],
        error: 'OPENAI_API_KEY environment variable not set',
      };
    }
    
    try {
      // Add timeout to prevent hanging (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-4o', // Use gpt-4o for accuracy
          temperature: 0, // Deterministic (zero inference)
          max_tokens: 2048,
          response_format: { type: 'json_object' }, // Force JSON output
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userContent,
            },
          ],
        }),
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          metrics: [],
          error: `OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`,
        };
      }
      
      const result = await response.json();
      const contentText = result.choices?.[0]?.message?.content;
      
      if (!contentText) {
        return {
          metrics: [],
          error: 'No content in OpenAI response',
        };
      }
      
      // Parse and validate response
      const parsed = parseExtractionResponse(contentText);
      
      return {
        metrics: parsed.metrics,
        rawOutput: contentText,
        error: parsed.error,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          metrics: [],
          error: 'OpenAI API call timed out after 30 seconds',
        };
      }
      return {
        metrics: [],
        error: `OpenAI API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
  
  // Anthropic or local providers not yet implemented
  return {
    metrics: [],
    error: `LLM provider ${llmProvider} not yet implemented. Use 'openai'.`,
  };
}
