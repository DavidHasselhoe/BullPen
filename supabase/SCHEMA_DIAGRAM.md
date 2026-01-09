# BullPen Database Schema Diagram

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           COMPANIES                                      │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│  id (UUID, PK)                                                          │
│  ticker (VARCHAR, UNIQUE)     ← Primary identifier                      │
│  name (VARCHAR)                                                         │
│  cik (VARCHAR, UNIQUE)        ← SEC identifier                          │
│  sector, industry (VARCHAR)                                             │
│  metadata (JSONB)             ← Flexible company data                   │
│  created_at, updated_at                                                 │
└────────────┬────────────────────────────────────────────────────────────┘
             │
             │ 1:N (One company has many filings)
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            FILINGS                                       │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│  id (UUID, PK)                                                          │
│  company_id (UUID, FK)        → companies.id                            │
│  filing_type (ENUM)           ← 10-K, 10-Q, 8-K, etc.                   │
│  accession_number (VARCHAR)   ← Unique SEC filing ID                    │
│  filing_date (DATE)                                                     │
│  period_end_date (DATE)       ← Reporting period                        │
│  source_url, document_url                                               │
│  processing_status (ENUM)     ← pending/processing/completed/failed     │
│  metadata (JSONB)                                                       │
│  created_at, updated_at                                                 │
└────┬──────┬──────────┬─────────────┬─────────────────────────────────┘
     │      │          │             │
     │      │          │             │ (All relationships: 1:N)
     │      │          │             │
     ▼      ▼          ▼             ▼
┌─────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────────────┐
│ FILING  │ │  FINANCIAL   │ │  AI_INSIGHTS  │ │      SIGNALS         │
│SECTIONS │ │   METRICS    │ │               │ │                      │
│━━━━━━━━│ │━━━━━━━━━━━━━│ │━━━━━━━━━━━━━│ │━━━━━━━━━━━━━━━━━━━│
│ Parsed  │ │ Structured   │ │ AI-generated  │ │ Trading signals      │
│ sections│ │ financial    │ │ summaries &   │ │ derived from         │
│ from    │ │ data         │ │ analysis      │ │ filings              │
│ filings │ │              │ │               │ │                      │
└─────────┘ └──────────────┘ └───────────────┘ └──────────────────────┘
```

## Detailed Table Relationships

### Primary Entity: COMPANIES
**Central table** - All other tables link back to companies

```
companies (1) ──┬──< filings (N)
                │
                ├──< financial_metrics (N)   [Direct link for queries]
                │
                ├──< ai_insights (N)         [Direct link for queries]
                │
                └──< signals (N)             [Direct link for queries]
```

### Secondary Entity: FILINGS
**Hub for filing-specific data** - Sections, metrics, insights derived from each filing

```
filings (1) ──┬──< filing_sections (N)
              │
              ├──< financial_metrics (N)     [Also links to company]
              │
              ├──< ai_insights (N)           [Also links to company]
              │
              └──< signals (N) [Optional]    [Also links to company]
```

### Tertiary Entity: FILING_SECTIONS
**Granular content** - Individual sections can have insights

```
filing_sections (1) ──< ai_insights (N) [Optional]
```

## Data Flow Diagram

```
┌──────────────┐
│  SEC EDGAR   │  (External source)
└──────┬───────┘
       │ Ingestion
       ▼
┌──────────────────────────────────────┐
│  1. Create COMPANY (if new)          │
│     - ticker, name, cik, sector      │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  2. Create FILING                    │
│     - filing_type, accession_number  │
│     - status: pending                │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  3. Parse & Extract                  │
│     → FILING_SECTIONS                │
│     → FINANCIAL_METRICS              │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  4. AI Analysis                      │
│     → AI_INSIGHTS (summaries, etc.)  │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  5. Generate SIGNALS                 │
│     - direction: bullish/bearish     │
│     - strength: 0-100                │
└──────────────────────────────────────┘
```

## Query Patterns

### Pattern 1: Company Timeline
**Get all filings for a company, most recent first**

```typescript
companies → filings (filter by company_id, order by filing_date DESC)
```

**SQL**:
```sql
SELECT f.* 
FROM filings f
WHERE f.company_id = 'company-uuid'
ORDER BY f.filing_date DESC;
```

**Optimized by**: `idx_filings_company_date (company_id, filing_date DESC)`

---

### Pattern 2: Financial Metrics Time Series
**Get revenue history for a company**

```typescript
companies → financial_metrics (filter by company_id + metric_type, order by period_end_date)
```

**SQL**:
```sql
SELECT fm.* 
FROM financial_metrics fm
WHERE fm.company_id = 'company-uuid'
  AND fm.metric_type = 'revenue'
ORDER BY fm.period_end_date DESC;
```

**Optimized by**: `idx_financial_metrics_company_metric (company_id, metric_type, period_end_date DESC)`

---

### Pattern 3: Filing Deep Dive
**Get complete filing with sections, metrics, and insights**

```typescript
filings → filing_sections, financial_metrics, ai_insights (all joined)
```

**SQL**:
```sql
SELECT 
  f.*,
  json_agg(DISTINCT fs.*) as sections,
  json_agg(DISTINCT fm.*) as metrics,
  json_agg(DISTINCT ai.*) as insights
FROM filings f
LEFT JOIN filing_sections fs ON fs.filing_id = f.id
LEFT JOIN financial_metrics fm ON fm.filing_id = f.id
LEFT JOIN ai_insights ai ON ai.filing_id = f.id
WHERE f.id = 'filing-uuid'
GROUP BY f.id;
```

---

### Pattern 4: Active Signals Dashboard
**Get all active signals across portfolio**

```typescript
signals → companies (filter by is_active, order by strength)
```

**SQL**:
```sql
SELECT s.*, c.ticker, c.name
FROM signals s
JOIN companies c ON c.id = s.company_id
WHERE s.is_active = true
  AND (s.expires_at IS NULL OR s.expires_at > NOW())
ORDER BY s.strength DESC, s.created_at DESC;
```

**Optimized by**: `idx_signals_active (is_active, expires_at)`

---

### Pattern 5: Sector Analysis
**Get latest insights for all companies in a sector**

```typescript
companies (filter by sector) → ai_insights (most recent per company)
```

**SQL**:
```sql
SELECT DISTINCT ON (ai.company_id)
  c.ticker, c.name,
  ai.insight_type, ai.title, ai.summary
FROM companies c
JOIN ai_insights ai ON ai.company_id = c.id
WHERE c.sector = 'Technology'
ORDER BY ai.company_id, ai.created_at DESC;
```

## Index Strategy

### High-Traffic Indexes
- `companies.ticker` - Used in every company lookup
- `companies.cik` - Used in SEC data ingestion
- `filings.accession_number` - Unique SEC identifier
- `filings (company_id, filing_date DESC)` - Company timeline queries

### Join Optimization Indexes
- `filing_sections.filing_id`
- `financial_metrics.filing_id`
- `ai_insights.filing_id`
- `signals.company_id`

### Filter Optimization Indexes
- `filings.processing_status` - Job queue management
- `signals (is_active, expires_at)` - Active signals dashboard
- `financial_metrics.metric_type` - Metric-specific queries

### Sorting Optimization Indexes
- All date columns indexed DESC for "most recent first" queries
- `signals.strength DESC` - Top signals queries

## Cascade Behavior

### DELETE CASCADE
When a company is deleted, all related data is automatically deleted:

```
DELETE companies → CASCADE deletes:
  ├── filings
  │   ├── filing_sections
  │   ├── financial_metrics
  │   ├── ai_insights
  │   └── signals
  ├── financial_metrics (direct)
  ├── ai_insights (direct)
  └── signals (direct)
```

### SET NULL
When a filing is deleted, signals remain but lose filing reference:

```
DELETE filings → signals.filing_id SET NULL
(Signal remains, but filing reference is cleared)
```

**Rationale**: Signals can represent analysis across multiple filings or time periods

## JSON Content Examples

### companies.metadata
```json
{
  "market_cap": "3000000000000",
  "founded": "1976",
  "headquarters": "Cupertino, CA",
  "employees": 161000,
  "fiscal_year_end": "09-30"
}
```

### signals.evidence
```json
{
  "metrics": {
    "revenue_change": 0.15,
    "eps_change": 0.22
  },
  "excerpts": [
    "Revenue increased 15% year-over-year...",
    "Operating margin expanded to 30.2%..."
  ],
  "compared_to": {
    "period": "Q4 2023",
    "filing_id": "uuid-here"
  }
}
```

### ai_insights.content
```json
{
  "summary": "Management expressed cautious optimism...",
  "sentiment": "neutral_positive",
  "key_themes": ["supply chain", "margin expansion", "AI investment"],
  "risk_level": "low",
  "notable_changes": [
    "Increased R&D spending by 18%",
    "New product launches expected in Q2"
  ]
}
```

---

**Last Updated**: Initial schema design  
**Version**: 1.0.0  
**Migration**: `001_initial_schema.sql`
