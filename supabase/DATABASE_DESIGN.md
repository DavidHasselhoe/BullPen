# BullPen Database Schema Design

## Overview

The BullPen database schema is designed to support a professional fintech analytics platform focused on SEC filings analysis. The schema emphasizes normalization, clear relationships, and auditability for AI-driven insights.

## Design Principles

1. **Normalized Structure**: Avoid data duplication, use clear foreign key relationships
2. **Type Safety**: Use ENUM types for constrained values
3. **Auditability**: Track model versions, timestamps, and processing status
4. **Flexibility**: JSONB metadata columns for extensibility
5. **Performance**: Strategic indexes on common query patterns
6. **Future-Proof**: Schema accommodates growth without major restructuring

## Core Tables

### `companies`
**Purpose**: Master table for all public companies tracked in BullPen

- Stores basic company information (ticker, name, CIK)
- Sector/industry classification for filtering and analysis
- JSONB metadata for flexible additional attributes (market cap, founding date, etc.)
- Unique indexes on `ticker` and `cik` for fast lookups

**Key Columns**:
- `cik`: SEC Central Index Key - unique identifier used in EDGAR system
- `ticker`: Primary trading symbol (e.g., AAPL, MSFT)
- `metadata`: Extensible JSON for additional company data

### `filings`
**Purpose**: Stores SEC filing documents (10-K, 10-Q, 8-K, etc.)

- One record per SEC filing
- Links to parent company via `company_id`
- Tracks processing pipeline status (pending → processing → completed/failed)
- Fiscal period information for time-series analysis

**Key Columns**:
- `accession_number`: Unique SEC filing identifier (format: XXXXXXXXXX-XX-XXXXXX)
- `filing_type`: ENUM of supported filing types
- `processing_status`: Tracks ingestion pipeline progress
- `period_end_date`: End date of reporting period (for quarterly/annual filings)

**Indexes**:
- Compound index on `(company_id, filing_date)` for company timeline queries
- Index on `processing_status` for job queue management

### `filing_sections`
**Purpose**: Parsed sections extracted from SEC filings

- One record per section (MD&A, Risk Factors, Financials, etc.)
- Enables targeted AI analysis of specific filing sections
- Stores raw text content for processing
- `section_order` maintains original document structure

**Key Columns**:
- `section_type`: Standardized ENUM for common filing sections
- `content`: Raw text extracted from section
- `content_length`: Character count (useful for AI processing cost estimation)

**Use Case**: Rather than processing entire filings, BullPen can analyze specific sections (e.g., only Risk Factors or MD&A) for more focused insights.

### `financial_metrics`
**Purpose**: Structured financial data extracted from filings

- Normalized table for time-series financial analysis
- One record per metric per period
- Links to both filing and company for flexible queries
- Supports restated metrics (when companies revise past financials)

**Key Columns**:
- `metric_type`: Standardized ENUM of common financial metrics
- `value`: NUMERIC(20,4) for precise financial values
- `unit`: Currency or unit specification (USD, EUR, shares, etc.)
- `period_type`: Annual, quarterly, TTM (trailing twelve months), YTD
- `is_restated`: Tracks if metric was revised in later filing

**Unique Constraint**: `(filing_id, metric_type, period_end_date)` prevents duplicate metrics

**Indexes**:
- Compound index on `(company_id, metric_type, period_end_date)` for company financial history queries
- Optimized for queries like "Show me AAPL's revenue over the last 5 years"

### `ai_insights`
**Purpose**: AI-generated summaries, sentiment analysis, and insights

- Stores structured AI outputs (JSON format)
- Links to filing and optionally to specific section
- Tracks model version for auditability
- Confidence scoring for reliability assessment

**Key Columns**:
- `insight_type`: Category of AI analysis (summary, sentiment, risk analysis, etc.)
- `content`: Structured JSON output from AI models
- `summary`: Human-readable text summary
- `model_version`: AI model identifier (e.g., "gpt-4-turbo-2024-04-09")
- `confidence_score`: 0.0 to 1.0 confidence level

**Design Note**: Deterministic and auditable - every insight includes model version and parameters used to generate it. This enables:
- Reproducing insights with same model
- Comparing outputs across model versions
- Filtering low-confidence insights

### `signals`
**Purpose**: Trading and analytical signals derived from filings

- Actionable insights for investors
- Each signal has direction (bullish/bearish/neutral) and strength (0-100)
- Links to source filing but can represent multi-filing analysis
- Can expire (time-sensitive signals) or be evergreen

**Key Columns**:
- `signal_type`: Category (earnings surprise, guidance change, risk alert, etc.)
- `direction`: Market direction indicator (bullish/bearish/neutral)
- `strength`: 0-100 normalized score for signal intensity
- `evidence`: Structured JSON with data backing the signal
- `expires_at`: When signal becomes stale (NULL for evergreen signals)
- `is_active`: Manual override to deactivate signals

**Use Cases**:
- Dashboard showing active signals for portfolio companies
- Filtering by signal type and strength
- Historical signal performance tracking

## Relationships

```
companies (1) ──< filings (N)
                    │
                    ├──< filing_sections (N)
                    │
                    ├──< financial_metrics (N)
                    │
                    ├──< ai_insights (N)
                    │
                    └──< signals (N)

companies (1) ──< financial_metrics (N)
companies (1) ──< ai_insights (N)
companies (1) ──< signals (N)

filing_sections (1) ──< ai_insights (N) [optional]
```

**Design Rationale**:
- `financial_metrics` links to both `company` and `filing` for flexible querying
- `ai_insights` can reference specific `filing_section` or entire `filing`
- `signals` optionally link to `filing` (some signals may derive from multiple filings)

## Performance Optimizations

1. **Strategic Indexes**: Covering common query patterns (company timeline, metric history)
2. **Partial Indexes**: On `is_active` and `expires_at` for active signals queries
3. **DESC Indexes**: On date fields for chronological queries (most recent first)
4. **JSONB Columns**: For flexible metadata without schema migrations

## Data Integrity

1. **Foreign Key Constraints**: All relationships enforced with CASCADE deletes
2. **Unique Constraints**: Prevent duplicate companies (ticker, CIK) and filings (accession number)
3. **Check Constraints**: Validate ranges (confidence_score 0-1, signal strength 0-100)
4. **NOT NULL**: Required fields enforced at database level

## Extensibility

1. **ENUM Types**: Easy to extend with ALTER TYPE commands
2. **JSONB Metadata**: Add new attributes without schema changes
3. **Flexible AI Content**: JSON content structure can evolve per insight type
4. **Section Types**: Covers major filing sections, with "other" for edge cases

## Row Level Security (RLS)

RLS is enabled on all tables but policies are commented out in migration. Typical implementation:

```sql
-- Public read access for all users
CREATE POLICY "public_read" ON companies FOR SELECT USING (true);

-- Authenticated users can create insights
CREATE POLICY "auth_insert" ON ai_insights FOR INSERT 
  TO authenticated WITH CHECK (true);

-- Service role for background jobs
CREATE POLICY "service_role_all" ON filings FOR ALL 
  TO service_role USING (true);
```

## Migration Strategy

1. Apply migration: `supabase migration up`
2. Seed with test companies: See `seeds/001_sample_companies.sql`
3. Validate with TypeScript types: See `lib/types/database.ts`

## Future Enhancements

Potential additions without breaking changes:

1. **User Tables**: For authentication and portfolios
2. **Watchlists**: User-curated company lists
3. **Alerts**: User-defined notification rules
4. **Comparisons**: Peer company analysis tables
5. **Embeddings**: Vector columns for semantic search (pgvector extension)
6. **Audit Log**: Track data modifications and user actions

## Maintenance

- `updated_at` automatically maintained by triggers
- Indexes should be monitored and adjusted based on query patterns
- Consider partitioning `filings` by year as dataset grows
- Archive old signals based on `expires_at` date
