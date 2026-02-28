# RAG (Retrieval-Augmented Generation) Assistant

A server-side AI assistant that answers financial questions by combining structured financial metrics with semantic document search from SEC filings.

## Overview

The RAG assistant:
1. **Retrieves** relevant financial data from Supabase (structured metrics + document embeddings)
2. **Assembles** a clean, authoritative context
3. **Generates** an answer using an external LLM (OpenAI)
4. **Returns** a structured, explainable response with citations

## Architecture

```
User Question
    ↓
answerFinancialQuestion()
    ↓
┌─────────────────────────────────────┐
│ 1. Fetch Company Info              │
│ 2. Extract Fiscal Period         │
│ 3. Fetch Financial Metrics        │
│ 4. Vector Search (Embeddings)     │
│ 5. Assemble Context               │
│ 6. Generate LLM Prompt            │
│ 7. Call LLM API                   │
│ 8. Validate & Return Response     │
└─────────────────────────────────────┘
    ↓
Structured Response
```

## API Endpoint

### POST `/api/rag/answer`

**Request Body:**
```json
{
  "question": "What drove NVIDIA's revenue growth in Q1 2024?",
  "companyId": "uuid-here"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": "NVIDIA's revenue growth in Q1 2024 was primarily driven by...",
    "keyDrivers": [
      "Strong demand for AI data center products",
      "Expansion in gaming segment",
      "Growth in professional visualization"
    ],
    "citedSources": [
      {
        "filingType": "10-Q",
        "section": "Management Discussion and Analysis",
        "fiscalPeriod": "2024 Q1"
      }
    ]
  }
}
```

## Database Schema

### `sec_document_embeddings` Table

Stores vector embeddings for semantic search:

```sql
CREATE TABLE sec_document_embeddings (
  id UUID PRIMARY KEY,
  filing_id UUID REFERENCES filings(id),
  section_id UUID REFERENCES filing_sections(id),
  company_id UUID REFERENCES companies(id),
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  content_type TEXT,       -- 'filing_section' or 'filing_full'
  content_text TEXT,       -- Original text
  section_type TEXT,
  section_name TEXT,
  filing_type TEXT,
  period_end_date DATE,
  fiscal_year INTEGER,
  fiscal_quarter INTEGER,
  model_name TEXT,
  created_at TIMESTAMPTZ
);
```

### Vector Search Function

```sql
SELECT * FROM match_document_embeddings(
  query_embedding := '[vector]',
  company_id_param := 'uuid',
  match_threshold := 0.7,
  match_count := 5,
  fiscal_year_param := 2024,
  fiscal_quarter_param := 1
);
```

## Usage

### Server-Side (TypeScript)

```typescript
import { answerFinancialQuestion } from '@/lib/rag/rag-assistant';

const response = await answerFinancialQuestion(
  "What were NVIDIA's key revenue drivers in Q1 2024?",
  companyId
);

console.log(response.summary);
console.log(response.keyDrivers);
console.log(response.citedSources);
```

### Client-Side (API Call)

```typescript
const response = await fetch('/api/rag/answer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: "What drove NVIDIA's revenue growth?",
    companyId: 'uuid-here'
  }),
});

const data = await response.json();
```

## Features

### 1. Fiscal Period Extraction

Automatically extracts fiscal period from questions:
- "Q1 2024" → `{ year: 2024, quarter: 1 }`
- "FY 2024" → `{ year: 2024 }` (annual)
- "2024" → Ambiguous (uses most recent period)

### 2. Structured Metrics Retrieval

Fetches relevant financial metrics:
- Revenue
- Net Income
- Operating Income
- EPS (Basic & Diluted)
- Gross Profit
- Operating Cash Flow
- Free Cash Flow

### 3. Vector Similarity Search

Uses pgvector for semantic search:
- Cosine similarity search
- Filters by company and fiscal period
- Returns top-k most relevant excerpts
- Minimum similarity threshold: 0.7

### 4. LLM Integration

- **Model**: `gpt-4o-mini` (cost-efficient)
- **Temperature**: 0.2 (deterministic)
- **Output Format**: Structured JSON
- **System Prompt**: Financial analyst tone, no advice, cite sources

## Error Handling

The assistant handles several error cases:

- **NO_DATA**: No financial metrics or documents found
- **AMBIGUOUS_PERIOD**: Fiscal period mentioned but unclear
- **LLM_ERROR**: OpenAI API error
- **MALFORMED_OUTPUT**: LLM returned invalid JSON
- **VECTOR_SEARCH_ERROR**: Embedding search failed

## Context Assembly

The context sent to the LLM includes:

1. **Company Info**: Name, ticker
2. **Financial Metrics**: Key metrics with formatted values
3. **Fiscal Period**: Year, quarter, period end date
4. **Document Excerpts**: Top 5 most relevant filing sections with:
   - Content preview (500 chars)
   - Section type and name
   - Filing type
   - Fiscal period

## LLM Prompt Structure

```
You are a financial analyst assistant...

CRITICAL RULES:
- Answer ONLY based on provided context
- Explain numbers, do NOT predict prices
- Cite specific sources
- Professional, analytical tone

FINANCIAL METRICS:
- revenue: $X.XXM
- net income: $X.XXM
...

RELEVANT DOCUMENT EXCERPTS:
[Excerpt 1]
Section: MD&A - Management Discussion
Filing: 10-Q (2024 Q1)
Content: ...

USER QUESTION: ...
```

## Response Structure

```typescript
interface RAGResponse {
  summary: string;              // 2-4 sentence summary
  keyDrivers: string[];         // 3-5 key drivers
  citedSources: Array<{         // Sources referenced
    filingType: string;         // "10-Q", "10-K", etc.
    section: string;            // "MD&A", "Risk Factors", etc.
    fiscalPeriod: string;       // "2024 Q1", "2023 (Annual)", etc.
  }>;
}
```

## Setup

### 1. Database Migration

```bash
# Apply migrations
supabase db push
```

This creates:
- `sec_document_embeddings` table
- `match_document_embeddings()` RPC function

### 2. Environment Variables

```env
OPENAI_API_KEY=sk-...your-api-key
```

### 3. Generate Embeddings

You'll need to populate the `sec_document_embeddings` table by:
- Extracting text from filing sections
- Generating embeddings using OpenAI API
- Storing embeddings in the database

See `lib/rag/embedding-generator.ts` (to be created) for embedding generation utilities.

## Limitations

1. **No Conversation Memory**: Each question is independent
2. **No Fine-Tuning**: Uses base OpenAI models
3. **No Price Predictions**: Explicitly avoids investment advice
4. **Requires Embeddings**: Vector search only works if embeddings are populated

## Future Enhancements

- [ ] Batch embedding generation for existing filings
- [ ] Caching of common questions
- [ ] Multi-company comparisons
- [ ] Time-series trend analysis
- [ ] Support for non-English questions
