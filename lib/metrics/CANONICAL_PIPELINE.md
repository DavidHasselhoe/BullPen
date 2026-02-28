# Canonical Filing-First Ingestion Pipeline

## Overview

The canonical pipeline is BullPen's **single source of truth** for metric extraction. It implements a strict, auditable, filing-first approach where every metric must be traceable to a specific filing and table.

## Design Philosophy

BullPen is not a data aggregator. It is a **filing-grounded financial system**.

If challenged, you must be able to say:
> "This number comes from this filing, this table, this row, this column."

Anything less is unacceptable.

## Non-Negotiable Principles

1. **If the filing does not explicitly state a value, BullPen does not store it**
2. **AI is a reader, never an analyst**
3. **Wrong data is worse than missing data**
4. **Every stored metric must be traceable to a filing and a table**
5. **Failures must be logged, not hidden**

## Pipeline Flow

```
Fetch Filing
  ↓
Store Raw HTML (immutably)
  ↓
Parse Filing Sections
  ↓
Extract Candidate Tables
  ↓
Run Deterministic Validation
  ↓
Call AI (table reader only)
  ↓
Validate AI Output (zero trust)
  ↓
Persist Metrics with Full Provenance
```

**No step may be skipped.**

## Components

### 1. Secure Filing Fetch & Storage (`fetchAndStoreFiling`)

**Requirements:**
- Fetch filings only from `sec.gov`
- Enforce SEC rate limits (10 req/sec)
- Validate accession number format
- Strip scripts, inline JS, and external references
- Store raw HTML immutably in filing metadata
- Reject filings larger than 15MB

**Security Controls:**
- URL validation (must be `https://www.sec.gov/`)
- Content length validation (max 15MB)
- HTML sanitization (remove `<script>` tags, inline handlers)
- Immutable storage (raw HTML never modified after storage)

**Storage Format:**
```json
{
  "metadata": {
    "raw_html": "<sanitized HTML>",
    "raw_html_size": 1234567,
    "raw_html_sha256": "abc123...",
    "stored_at": "2025-01-15T10:00:00Z"
  }
}
```

### 2. Deterministic Table Detection (`detectFinancialTables`)

**Requirements:**
- Match known GAAP row labels (EPS, revenue, net income, etc.)
- Require column headers (dates + period labels)
- Reject tables without clear period context

**Detection Rules:**
- Must have EPS indicators OR (revenue AND income)
- Must have period headers ("Three Months Ended", etc.)
- Must have date context (year/month in headers)

**Output:**
- Array of qualifying HTML table elements
- If no qualifying table exists → stop (no metrics extracted)

### 3. Table Normalization (`normalizeTable`)

**Purpose:**
- Convert HTML tables to structured plain text
- Compute SHA256 fingerprint for deduplication
- Preserve column headers and row labels

**Process:**
1. Extract text from HTML table
2. Preserve structure (headers, rows, columns)
3. Remove footnotes (store separately if needed)
4. Compute `table_fingerprint = sha256(structured_text)`

**Fingerprint Usage:**
- Deduplicate AI calls (same table = same extraction)
- Guarantee idempotency
- Support safe reprocessing

### 4. AI Table Reader Invocation (`extractMetricsFromTableWithAI`)

**Strict Contract:**
- One table = one AI call
- Use `TABLE_EXTRACTION_PROMPT` only
- No additional context or instructions
- Force JSON output format

**Hard Rules:**
- Never batch tables
- Never modify prompt
- Never add examples or hints
- AI output must be strict JSON

**Caching:**
- Check `ai_extraction_cache` by `table_fingerprint`
- If cached → use cached result
- If not cached → call AI and cache result

### 5. Zero Trust AI Output Validation (`validateAIOutput`)

**Before persisting anything, validate:**

1. **JSON Schema Correctness**
   - Must be valid JSON
   - Must have `metrics` array

2. **Metric Name Allowlist**
   - Only `eps_diluted` or `eps_basic`
   - Reject unknown metric types

3. **Period Scope Validation**
   - Only `period_scope === 'Q'` for quarterly metrics
   - Reject YTD/TTM/FY for quarterly context

4. **Period Label Validation**
   - Must include "Three Months Ended" or "Quarter Ended"
   - Reject cumulative periods

5. **Numeric Formatting**
   - Value must be a valid finite number
   - Reject NaN, Infinity, or non-numeric values

6. **Confidence Level**
   - Must be 'high', 'medium', or 'low'

**If validation fails:**
- Discard output
- Log failure with reason
- Do not retry blindly

### 6. Metric Persistence (`persistMetrics`)

**Every stored metric must include:**

```typescript
{
  metric_type: 'eps_diluted' | 'eps_basic',
  value: number,
  unit: 'USD/shares',
  period_type: 'quarterly',
  period_end_date: Date,
  fiscal_year: number,
  fiscal_quarter: number,
  accounting_basis: 'gaap',
  currency: 'USD',
  split_adjusted: true,
  metadata: {
    source: 'filing_table',
    confidence: 'high' | 'medium' | 'low',
    table_fingerprint: string,
    row_label: string,
    column_label: string,
    extraction_method: 'ai_table_reader'
  }
}
```

**Provenance Fields:**
- `filing_id`: Links to source filing
- `table_fingerprint`: Links to source table
- `row_label`: Exact row label from table
- `column_label`: Exact column header from table
- `extraction_method`: How metric was extracted

**Metrics without full provenance are invalid.**

### 7. Conflict Resolution Rules

**Priority Order:**
1. Filing-table extracted values (preferred over XBRL)
2. Explicit quarterly values (preferred over cumulative)
3. High confidence values (preferred over medium/low)

**Rules:**
- Never overwrite existing high-confidence metrics
- Never merge metrics from different period scopes
- No heuristics, no averaging, no deltas
- If conflict exists → log and skip (don't guess)

### 8. Observability & Logging

**Structured Logs Include:**
- `symbol`: Company ticker
- `filing_id`: Filing identifier
- `step`: Pipeline step name
- `metric`: Metric name (if applicable)
- `reason`: Failure reason (if applicable)
- `details`: Additional context
- `timestamp`: ISO timestamp
- `success`: Boolean success flag

**Log Events:**
- Filing fetch (success/failure)
- Table detection (count, types)
- AI invocation (fingerprint, success/failure)
- AI rejection (reason, metrics count)
- Metric persistence (stored count, errors)
- Missing quarterly metrics (warning)

**Silence is a bug.** All failures must be logged.

### 9. Failure Handling & Safety

**If any step fails:**
- Store nothing (fail closed)
- Log clearly with reason
- Surface "Not reported" in UI

**Never substitute with:**
- YTD values
- TTM values
- Prior quarter values
- Estimates or calculations

**Safety Defaults:**
- Missing quarterly EPS → "Not reported" (not YTD)
- Invalid AI output → "Not reported" (not calculated)
- Table detection failure → "Not reported" (not guessed)

### 10. Cost & Abuse Controls

**Caching:**
- Cache AI results by `table_fingerprint`
- Deduplicate identical tables automatically
- Support idempotent reprocessing

**Rate Limiting:**
- Enforce max AI calls per filing (e.g., 10 tables)
- Rate-limit ingestion jobs (e.g., 1 filing per 5 seconds)
- Circuit breaker for repeated failures

**Cost Protection:**
- Same table fingerprint = zero additional AI cost
- Failed extractions are not cached (avoid caching errors)
- Cache expiration (optional, configurable)

## Usage

### Basic Usage

```typescript
import { executeCanonicalPipeline } from '@/lib/metrics/filing-first-pipeline';

const result = await executeCanonicalPipeline(filingId, {
  onProgress: (step, details) => {
    console.log(`[${step}]`, details);
  },
});

if (result.success) {
  console.log(`Extracted ${result.metricsExtracted} metrics`);
  console.log(`Stored ${result.metricsStored} metrics`);
} else {
  console.error('Pipeline failed:', result.errors);
}
```

### Integration with Metrics Orchestrator

The canonical pipeline should be used as a **fallback** when XBRL extraction fails to provide quarterly values:

```typescript
// In metrics-orchestrator.ts
if (metricType === 'eps_diluted' || metricType === 'eps_basic') {
  // Try XBRL extraction first
  const xbrlMetric = await getMetricForFiling(...);
  
  if (!xbrlMetric || xbrlMetric.periodScope !== 'Q') {
    // XBRL failed or returned YTD - try filing-first pipeline
    const pipelineResult = await executeCanonicalPipeline(filingId, {
      onProgress: (step, details) => {
        onProgress?.(`[Table Extraction] ${step}`, details);
      },
    });
    
    if (pipelineResult.success && pipelineResult.metricsStored > 0) {
      // Successfully extracted quarterly EPS from tables
      // Metrics are already persisted by the pipeline
    }
  }
}
```

## Database Schema

### `ai_extraction_cache`

Stores AI extraction results by table fingerprint:

```sql
CREATE TABLE ai_extraction_cache (
  id UUID PRIMARY KEY,
  table_fingerprint VARCHAR(64) UNIQUE NOT NULL,
  ai_output TEXT NOT NULL,
  extracted_metrics JSONB NOT NULL,
  model_version VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

**Purpose:**
- Deduplicate identical table extractions
- Support idempotent reprocessing
- Control AI API costs

## Acceptance Criteria

All of these must pass:

1. ✅ **NVIDIA Q3 EPS = 1.30** (extracted from filing table)
2. ✅ **No quarterly metric derived from YTD**
3. ✅ **No metric without provenance**
4. ✅ **Re-ingestion is idempotent** (same filing = same results)
5. ✅ **Pipeline is restart-safe** (can resume from any step)
6. ✅ **All failures are explainable via logs**

## Example: NVIDIA Q3 Filing

**Input:**
- Filing: NVIDIA 10-Q (period ending 2025-10-26)
- Accession: `0001045810-25-000155`

**Pipeline Execution:**
1. ✅ Fetch filing from SEC (15MB limit)
2. ✅ Store raw HTML in filing metadata
3. ✅ Detect income statement tables (1 table found)
4. ✅ Normalize table (fingerprint: `abc123...`)
5. ✅ Check cache (not cached)
6. ✅ Call OpenAI with strict prompt
7. ✅ Validate output (EPS = 1.30, period_scope = 'Q')
8. ✅ Cache extraction result
9. ✅ Persist metric with full provenance

**Result:**
- `eps_diluted = 1.30` (quarterly)
- `source = 'filing_table'`
- `table_fingerprint = 'abc123...'`
- `row_label = 'Earnings per share – diluted'`
- `column_label = 'Three Months Ended October 26, 2025'`

## Testing

### Manual Test

```bash
# Run canonical pipeline for a filing
tsx scripts/test-canonical-pipeline.ts <filing-id>
```

### Integration Test

```typescript
// Test NVIDIA Q3 filing
const result = await executeCanonicalPipeline(nvidiaQ3FilingId);

// Verify results
assert(result.success === true);
assert(result.metricsExtracted === 1);
assert(result.metricsStored === 1);

// Verify stored metric
const metrics = await getMetricsForFiling(nvidiaQ3FilingId);
const eps = metrics.find(m => m.metric_type === 'eps_diluted');
assert(eps.value === 1.30);
assert(eps.period_type === 'quarterly');
assert(eps.metadata.source === 'filing_table');
```

## Troubleshooting

### Issue: No tables detected

**Check:**
- Filing HTML contains tables
- Tables have income statement indicators
- Tables have period headers

**Solution:**
- Logs will show table detection results
- Check filing HTML in metadata
- Verify table structure

### Issue: AI output validation failed

**Check:**
- AI output JSON format
- Period scope is 'Q'
- Period label includes "Three Months Ended"

**Solution:**
- Review AI output in logs
- Check prompt adherence
- Verify table structure

### Issue: Metrics not persisted

**Check:**
- Validation passed
- Filing ID is valid
- Company ID is valid

**Solution:**
- Review error logs
- Check database constraints
- Verify provenance fields

## Future Enhancements

1. **Anthropic Claude Support**: Add Claude as alternative LLM provider
2. **Table Fingerprint Analytics**: Track most common tables across filings
3. **Extraction Quality Metrics**: Track confidence scores over time
4. **Automatic Reprocessing**: Reprocess filings when extraction improves
5. **Multi-Table Aggregation**: Handle metrics across multiple tables (advanced)

## Related Documentation

- [TABLE_EXTRACTION.md](./TABLE_EXTRACTION.md) - Table extraction details
- [METRICS_SETUP.md](../METRICS_SETUP.md) - Metrics system overview
- [PERIOD_CLASSIFICATION.md](./period-classification.ts) - Period classification logic
