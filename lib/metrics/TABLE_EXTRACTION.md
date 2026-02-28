# Financial Table Extraction

## Overview

This module provides strict table-based extraction of financial metrics from SEC filing documents as a **fallback** when XBRL data doesn't provide quarterly values.

## Problem Statement

When extracting quarterly EPS from 10-Q filings, the SEC Company Facts API and filing-specific XBRL sometimes only provide YTD (Year-to-Date) values, not individual quarterly values.

Example:
- **Q3 filing (period ending 2025-10-26)**
- XBRL provides: YTD diluted EPS = 3.14 (nine months)
- Needed: Q3 diluted EPS = ~1.30 (single quarter)

## Solution

Use LLM-based extraction from actual filing document tables when:
1. XBRL extraction fails or returns only YTD/TTM values
2. We need quarterly values from a 10-Q filing
3. The filing document contains an income statement table

## Extraction Rules (Strict)

The extraction follows a **zero-inference** policy:

✅ **Extract**:
- Values explicitly under "Three Months Ended" columns
- EPS labeled as "Earnings per share – diluted" or "EPS (diluted)"
- Only values that are explicitly printed in the table

❌ **Reject**:
- "Nine Months Ended" values
- "Year to Date" values
- "TTM" values
- Calculated/derived values
- Values from non-quarterly columns

## Usage

```typescript
import { 
  extractIncomeStatementTables,
  extractMetricsFromTable,
  TABLE_EXTRACTION_PROMPT
} from '@/lib/metrics/table-extractor';
import { getFilingContent } from '@/lib/ingestion/sec-edgar';

// 1. Fetch filing document
const filingContent = await getFilingContent(accessionNumber, cik);

// 2. Extract income statement tables
const tables = extractIncomeStatementTables(filingContent);

// 3. Extract metrics from each table
for (const table of tables) {
  const result = await extractMetricsFromTable(table, 'openai');
  
  if (result.metrics.length > 0) {
    // Found quarterly EPS values
    for (const metric of result.metrics) {
      console.log(`${metric.metric}: ${metric.value} (${metric.period_label})`);
    }
  }
}
```

## Integration with Metrics Pipeline

This should be integrated as a fallback in `metrics-orchestrator.ts`:

```typescript
// When XBRL extraction fails for EPS in 10-Q filings
if (metricType === 'eps_diluted' || metricType === 'eps_basic') {
  if (!metric && filing.filing_type === '10-Q') {
    // Try table extraction as fallback
    const filingContent = await getFilingContent(
      filing.accession_number,
      company.cik
    );
    const tables = extractIncomeStatementTables(filingContent);
    
    for (const table of tables) {
      const tableResult = await extractMetricsFromTable(table);
      
      // Look for quarterly EPS
      const quarterlyEPS = tableResult.metrics.find(
        m => m.period_scope === 'Q'
      );
      
      if (quarterlyEPS) {
        // Convert to ExtractedMetric format
        // Process as if from XBRL
      }
    }
  }
}
```

## LLM Provider Integration

The `extractMetricsFromTable` function needs to be connected to an LLM provider:

### OpenAI

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function extractMetricsFromTable(
  tableHtml: string,
  provider: 'openai' = 'openai'
): Promise<TableExtractionResult> {
  const structuredTable = tableToStructuredText(tableHtml);
  const prompt = TABLE_EXTRACTION_PROMPT.replace(
    '{{INCOME_STATEMENT_TABLE}}',
    structuredTable
  );
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TABLE_EXTRACTION_PROMPT.split('INPUT')[0] },
      { role: 'user', content: `INPUT\n\n${structuredTable}` }
    ],
    temperature: 0, // Deterministic
    response_format: { type: 'json_object' }
  });
  
  return parseExtractionResponse(response.choices[0].message.content || '');
}
```

### Anthropic

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function extractMetricsFromTable(
  tableHtml: string,
  provider: 'anthropic' = 'anthropic'
): Promise<TableExtractionResult> {
  const structuredTable = tableToStructuredText(tableHtml);
  const prompt = TABLE_EXTRACTION_PROMPT.replace(
    '{{INCOME_STATEMENT_TABLE}}',
    structuredTable
  );
  
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0, // Deterministic
  });
  
  const content = response.content[0];
  if (content.type === 'text') {
    return parseExtractionResponse(content.text);
  }
  
  return { metrics: [], error: 'Invalid response format' };
}
```

## Validation

The extracted metrics are validated:

1. **Structure**: Must be valid JSON with `metrics` array
2. **Period Scope**: Only `period_scope === 'Q'` (quarterly) values are accepted
3. **Period Label**: Must contain "Three Months Ended" or equivalent
4. **Metric Type**: Only `eps_diluted` or `eps_basic`
5. **Value**: Must be a valid number

## Output Format

```json
{
  "metrics": [
    {
      "metric": "eps_diluted",
      "value": 1.30,
      "period_scope": "Q",
      "period_label": "Three Months Ended October 26, 2025",
      "confidence": "high",
      "source": "filing_income_statement"
    }
  ]
}
```

## Safety & Auditability

This approach is safe because:

- **Zero inference**: Only extracts explicitly stated values
- **Column-context enforced**: Only values under quarterly columns
- **Period correctness**: Only "Three Months Ended" values accepted
- **Hallucination-resistant**: Strict JSON validation
- **Auditable output**: Original table and extraction results logged

## Status

- ✅ Prompt defined (`TABLE_EXTRACTION_PROMPT`)
- ✅ Table extraction utilities (`extractIncomeStatementTables`)
- ✅ Structured text conversion (`tableToStructuredText`)
- ✅ Response parsing (`parseExtractionResponse`)
- ⏳ LLM provider integration (TODO)
- ⏳ Pipeline integration (TODO)

## Next Steps

1. **Integrate LLM provider** (OpenAI or Anthropic)
2. **Add to metrics pipeline** as fallback for 10-Q EPS extraction
3. **Test with NVIDIA Q3 filing** to extract ~1.30 diluted EPS
4. **Add logging** for table extraction attempts
5. **Cache results** to avoid redundant LLM calls
