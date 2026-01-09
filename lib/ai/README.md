# BullPen AI Analysis Module

Deterministic AI extraction layer for SEC filing sections.

## Overview

The AI module generates structured insights from parsed filing sections:
- Factual summaries (3-5 sentences)
- Sentiment analysis (positive/neutral/negative)
- Key points extraction
- Risk flag identification
- Confidence scoring

## Architecture

```
filing_sections (input)
  ↓
ai-analyzer.ts (AI prompts + API calls)
  ↓
SectionInsight (structured JSON)
  ↓
ai-insights-db.ts (database operations)
  ↓
ai_insights table (storage)
```

## Files

- **`ai-analyzer.ts`** - Core AI analysis with deterministic prompts
- **`ai-insights-db.ts`** - Database operations for storing insights
- **`ai-orchestrator.ts`** - Coordinates analysis of all sections in a filing
- **`README.md`** - This file

## Usage

### Analyze a Filing

```typescript
import { analyzeFilingSections } from '@/lib/ai/ai-orchestrator';

const result = await analyzeFilingSections(filingId, {
  skipExisting: true,
  onProgress: (step, details) => {
    console.log(`Progress: ${step}`, details);
  },
});

if (result.success) {
  console.log(`Created ${result.insightsCreated} insights`);
}
```

### Query Insights

```typescript
import { getFilingInsights } from '@/lib/ai/ai-insights-db';

const result = await getFilingInsights(filingId);
if (result.success) {
  result.data.forEach(insight => {
    console.log(insight.title);
    console.log(insight.content.summary);
  });
}
```

### Via CLI

```bash
# Analyze latest completed filing
npm run test-ai

# Analyze specific filing
npx tsx scripts/test-ai-analysis.ts <FILING_ID>
```

## Insight Structure

```typescript
interface SectionInsight {
  summary: string;              // 3-5 sentence factual summary
  sentiment: 'positive' | 'neutral' | 'negative';
  key_points: string[];         // 3-7 most important facts
  risk_flags: string[];         // Explicit risks mentioned
  confidence: number;           // 0.0 to 1.0
}
```

## Model Configuration

**Current Model**: `gpt-4o-mini`
- Fast and cost-effective
- Suitable for structured extraction
- Low temperature (0.1) for determinism

**Configuration** (in `ai-analyzer.ts`):
```typescript
{
  model: 'gpt-4o-mini',
  temperature: 0.1,    // Low for consistency
  max_tokens: 2000,
  response_format: { type: 'json_object' }
}
```

## Prompt Design

Prompts are **deterministic and section-aware**:

1. **Context**: Section type and purpose
2. **Task**: Extract specific structured fields
3. **Format**: JSON-only output with exact schema
4. **Rules**: Factual, neutral, professional tone

Example prompt structure:
```
You are analyzing a SEC 10-K filing section. [Section description]

SECTION CONTENT:
[Content with smart truncation]

OUTPUT FORMAT: Return ONLY valid JSON...
{
  "summary": "...",
  "sentiment": "neutral",
  "key_points": [...],
  "risk_flags": [...],
  "confidence": 0.95
}

RULES:
- Output ONLY JSON
- 3-5 sentence summary
- Factual statements only
- No speculation
```

## Database Schema

Insights are stored in `ai_insights` table:

```sql
CREATE TABLE ai_insights (
  id UUID PRIMARY KEY,
  filing_id UUID REFERENCES filings(id),
  company_id UUID REFERENCES companies(id),
  section_id UUID REFERENCES filing_sections(id),
  insight_type insight_type,
  title VARCHAR(255),
  content JSONB,              -- SectionInsight structure
  summary TEXT,               -- Duplicate for querying
  confidence_score NUMERIC,
  model_version VARCHAR(50),  -- e.g., 'gpt-4o-mini'
  model_parameters JSONB,     -- Temperature, etc.
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## Error Handling

The module handles:
- **API errors**: OpenAI rate limits, timeouts
- **Validation errors**: Invalid JSON structure
- **Database errors**: Insert failures
- **Missing data**: Sections without content

All errors are:
- Logged with context
- Returned in result objects
- Tracked per-section for partial success

## Re-running Analysis

To re-analyze a filing:

```typescript
import { reanalyzeFilingSections } from '@/lib/ai/ai-orchestrator';

// Deletes existing insights and runs fresh analysis
const result = await reanalyzeFilingSections(filingId, onProgress);
```

Or manually:

```typescript
import { deleteFilingInsights } from '@/lib/ai/ai-insights-db';

await deleteFilingInsights(filingId);
await analyzeFilingSections(filingId, { skipExisting: false });
```

## Rate Limiting

- **Delay between sections**: 1 second
- **OpenAI rate limits**: Handled by API
- **Estimated time**: ~5-10 seconds per section

For a 5-section filing: ~30-60 seconds total

## Cost Estimation

**gpt-4o-mini pricing** (as of 2024):
- Input: $0.150 per 1M tokens
- Output: $0.600 per 1M tokens

**Per section** (typical 10-K):
- Input: ~10,000 tokens = $0.0015
- Output: ~500 tokens = $0.0003
- **Total**: ~$0.002 per section

**Per filing** (5 sections):
- **Total**: ~$0.01 per filing

## Validation

Insights are validated for:
- ✅ JSON structure matches schema
- ✅ Summary is 50+ characters
- ✅ Sentiment is one of: positive/neutral/negative
- ✅ Key points array has 2+ items
- ✅ Risk flags is an array (can be empty)
- ✅ Confidence is 0.0-1.0

Invalid responses throw errors with details.

## Environment Variables

Required in `.env.local`:

```env
OPENAI_API_KEY=sk-...your-key
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Testing

Run the test script:

```bash
npm run test-ai
```

This will:
1. Find the latest completed filing
2. Run AI analysis on all sections
3. Store insights in database
4. Display results with confidence scores

## Future Enhancements

Potential improvements (not yet implemented):
- [ ] Batch processing for multiple filings
- [ ] Comparative analysis across filings
- [ ] Custom prompts per company/industry
- [ ] Embeddings for semantic search
- [ ] Signal generation from insights
- [ ] Alert triggers based on sentiment/risks

## Troubleshooting

### Error: "OPENAI_API_KEY not set"

Add your OpenAI API key to `.env.local`:
```env
OPENAI_API_KEY=sk-...
```

### Error: "Failed to parse JSON"

The AI returned invalid JSON. This is rare with `response_format: json_object` but can happen if:
- Content is too complex
- Token limit exceeded
- API error

Solution: Check `model_parameters` and retry.

### Low Confidence Scores

If confidence scores are consistently low:
- Section content may be unclear
- Content may be truncated (check `content_length`)
- Model may need adjustment

### Rate Limit Errors

If hitting OpenAI rate limits:
- Increase delay in `ai-orchestrator.ts`
- Use batch processing
- Upgrade OpenAI tier

---

**Status**: ✅ v1 complete - deterministic extraction working  
**Next**: Test with Apple 10-K sections
