# BullPen Ingestion Pipeline - Setup Complete ✅

## What's Been Built

A minimal, deterministic background ingestion pipeline for SEC filings (10-K, 10-Q, 8-K).

### 📁 File Structure

```
BullPen/
├── lib/ingestion/
│   ├── README.md                    # Comprehensive pipeline documentation
│   ├── sec-edgar.ts                 # SEC EDGAR API client
│   ├── filing-parser.ts             # Section extraction logic
│   ├── database.ts                  # Database operations
│   └── filing-ingestion.ts          # Pipeline orchestrator
├── app/api/ingest/
│   └── route.ts                     # HTTP API endpoint
├── scripts/
│   └── test-ingestion.ts            # CLI test script
└── package.json                     # Updated with scripts
```

## 🎯 Pipeline Features

✅ **Fetches SEC filings** from EDGAR API (respects rate limits)  
✅ **Parses filings** into logical sections (MD&A, Risk Factors, etc.)  
✅ **Stores metadata** in `filings` table  
✅ **Stores sections** in `filing_sections` table  
✅ **Deterministic** - Pattern-based section extraction  
✅ **Type-safe** - Full TypeScript coverage  
✅ **Testable** - Modular, composable functions  
✅ **Idempotent** - Checks for existing filings  
✅ **Error handling** - Comprehensive error tracking  

## 🔄 Pipeline Flow

```
1. Fetch company info from SEC EDGAR
   ↓
2. Create/update company in database
   ↓
3. Check if filing already exists (skip if yes)
   ↓
4. Fetch filing content from SEC
   ↓
5. Validate content (check for SEC headers)
   ↓
6. Create filing record (status: processing)
   ↓
7. Parse filing into sections
   ↓
8. Validate parsed sections
   ↓
9. Store sections in database
   ↓
10. Update filing status to completed
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `@supabase/supabase-js` - Database client
- `tsx` - TypeScript execution for scripts

### 2. Configure Environment

Make sure `.env.local` has Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Update SEC User-Agent

**IMPORTANT**: Edit `lib/ingestion/sec-edgar.ts` and update the User-Agent with your contact info:

```typescript
const SEC_CONFIG = {
  userAgent: 'BullPen Analytics your-email@example.com', // ← Update this
  // ...
};
```

The SEC requires a User-Agent header with contact information.

### 4. Test the Pipeline

#### Option A: Via CLI Script

```bash
# Fetch company info
npm run test-ingest:info 0000320193

# List recent 10-K filings
npm run test-ingest:list 0000320193 10-K

# Ingest latest 10-K for Apple
npm run test-ingest:latest 0000320193 10-K

# Or use full command
npx tsx scripts/test-ingestion.ts ingest-latest 0000320193 10-K
```

#### Option B: Via HTTP API

Start dev server:

```bash
npm run dev
```

Trigger ingestion:

```bash
# Ingest latest 10-K for Apple
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"cik": "0000320193", "filingType": "10-K"}'
```

## 📊 Supported Filing Types

| Filing Type | Description | Sections Extracted |
|-------------|-------------|-------------------|
| **10-K** | Annual report | Business, Risk Factors, Legal, MD&A, Financials, Controls |
| **10-Q** | Quarterly report | Financials, MD&A, Risk Factors, Controls |
| **8-K** | Current events | Basic support (single section) |

## 🧪 Test Companies

Pre-configured CIKs for testing:

- **Apple (AAPL)**: `0000320193`
- **Microsoft (MSFT)**: `0000789019`
- **Alphabet (GOOGL)**: `0001652044`
- **Tesla (TSLA)**: `0001318605`

## 📖 Example: Ingest Apple's Latest 10-K

```bash
npm run test-ingest:latest 0000320193 10-K
```

Expected output:

```
🔄 Ingesting latest 10-K filing for CIK: 0000320193

  → Fetching company information ({"cik":"0000320193"})
  → Company info retrieved ({"name":"Apple Inc."})
  → Creating/updating company in database
  → Company ready ({"companyId":"abc-123..."})
  → Checking if filing already exists
  → Fetching filing content from SEC EDGAR
  → Filing content retrieved ({"contentLength":1234567})
  → Filing type identified ({"filingType":"10-K"})
  → Creating filing record in database
  → Filing record created ({"filingId":"xyz-789..."})
  → Parsing filing into sections
  → Filing parsed successfully {...}
  → Storing filing sections in database
  → Marking filing as completed
  → Ingestion completed successfully

✅ Ingestion completed successfully!

Results:
  Filing ID:        xyz-789...
  Company ID:       abc-123...
  Sections Created: 6

Details:
  Company:      Apple Inc. (AAPL)
  Filing Type:  10-K
  Accession:    0000320193-23-000077

Section Statistics:
  Total Sections:  6
  Total Length:    456,789 chars
  Average Length:  76,131 chars
  Section Types:   business_overview, risk_factors, legal_proceedings, 
                   management_discussion_analysis, financial_statements, 
                   controls_procedures
```

## 🗄️ Database Changes

After successful ingestion, you'll have data in three tables:

### companies
```sql
SELECT * FROM companies WHERE ticker = 'AAPL';
```

| id | ticker | name | cik | created_at |
|----|--------|------|-----|------------|
| uuid | AAPL | Apple Inc. | 0000320193 | 2026-01-08... |

### filings
```sql
SELECT * FROM filings WHERE company_id = 'company-uuid';
```

| id | filing_type | accession_number | filing_date | processing_status |
|----|-------------|------------------|-------------|-------------------|
| uuid | 10-K | 0000320193-23-000077 | 2023-11-03 | completed |

### filing_sections
```sql
SELECT section_type, section_name, content_length 
FROM filing_sections 
WHERE filing_id = 'filing-uuid';
```

| section_type | section_name | content_length |
|--------------|--------------|----------------|
| business_overview | Item 1. Business | 45,123 |
| risk_factors | Item 1A. Risk Factors | 89,456 |
| management_discussion_analysis | Item 7. MD&A | 123,789 |
| ... | ... | ... |

## 🔧 Programmatic Usage

Use the pipeline in your own code:

```typescript
import { ingestLatestFiling } from '@/lib/ingestion/filing-ingestion';

// With progress tracking
const result = await ingestLatestFiling('0000320193', '10-K', (step, details) => {
  console.log(`Progress: ${step}`, details);
});

if (result.success) {
  console.log('Filing ID:', result.filingId);
  console.log('Sections:', result.sectionsCreated);
} else {
  console.error('Error:', result.error);
}
```

Or fetch specific filing:

```typescript
import { ingestFiling } from '@/lib/ingestion/filing-ingestion';

const result = await ingestFiling(
  '0000320193',
  '0000320193-23-000077'
);
```

## 🎨 API Endpoints

### POST /api/ingest

Triggers filing ingestion.

**Request body**:
```json
{
  "cik": "0000320193",
  "filingType": "10-K"
}
```

Or ingest specific filing:
```json
{
  "cik": "0000320193",
  "accessionNumber": "0000320193-23-000077"
}
```

**Response** (success):
```json
{
  "success": true,
  "message": "Filing ingested successfully",
  "data": {
    "filingId": "...",
    "companyId": "...",
    "sectionsCreated": 6,
    "details": {
      "ticker": "AAPL",
      "companyName": "Apple Inc.",
      "filingType": "10-K",
      "accessionNumber": "0000320193-23-000077",
      "sectionStats": {...}
    }
  },
  "progress": [...]
}
```

### GET /api/ingest

Returns API documentation.

## 🛠️ Available Scripts

Added to `package.json`:

```bash
npm run test-ingest        # Run test script with args
npm run test-ingest:info   # Fetch company info (AAPL default)
npm run test-ingest:list   # List recent filings (AAPL default)
npm run test-ingest:latest # Ingest latest filing (AAPL default)
```

## 🚨 Important Notes

### SEC Rate Limits

- **10 requests per second** maximum
- Pipeline includes automatic 100ms delays
- Violating rate limits may result in IP ban

### User-Agent Requirement

The SEC **requires** a User-Agent header with contact info. Update this in `lib/ingestion/sec-edgar.ts` before running:

```typescript
const SEC_CONFIG = {
  userAgent: 'BullPen Analytics your-email@example.com',
};
```

### Idempotent Operations

The pipeline checks if a filing already exists (by accession number) and will not re-ingest. To re-ingest:

1. Delete the existing filing from database
2. Run ingestion again

```sql
DELETE FROM filings WHERE accession_number = '0000320193-23-000077';
```

## ❌ No AI Analysis Yet

This pipeline is **minimal and deterministic**:

✅ Fetches filings  
✅ Parses sections  
✅ Stores in database  

❌ **NOT included** (future work):
- AI-generated insights
- Financial metrics extraction (XBRL)
- Signal generation
- Background job queue
- Batch processing

## 📈 Next Steps

With the ingestion pipeline complete, you can now:

1. **Query filing data** in Supabase Studio
2. **Build dashboard UI** to display filings and sections
3. **Add AI analysis** to generate insights (future)
4. **Extract financial metrics** from filings (future)
5. **Generate signals** from parsed data (future)

## 🐛 Troubleshooting

### Error: "Missing Supabase environment variables"

Make sure `.env.local` exists and has correct values:
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Error: "SEC API error: 403"

1. Update User-Agent in `sec-edgar.ts`
2. Check you're not exceeding rate limits
3. Try again in a few minutes

### Error: "No sections found in filing"

The parser couldn't identify standard sections. This can happen with:
- Amended filings (10-K/A)
- Foreign companies with different formats
- Very old filings

The filing is still stored, just with fewer sections.

### Error: "Filing already exists"

The filing is already in your database. To re-ingest:
```sql
DELETE FROM filings WHERE accession_number = 'XXXXXXXXXX-YY-XXXXXX';
```

## 📚 Documentation

- **[lib/ingestion/README.md](./lib/ingestion/README.md)** - Comprehensive pipeline documentation
- **[supabase/DATABASE_DESIGN.md](./supabase/DATABASE_DESIGN.md)** - Database schema details
- **[SEC EDGAR API Docs](https://www.sec.gov/edgar/sec-api-documentation)** - Official SEC API documentation

## ✅ Status

**Pipeline Status**: Complete and ready for use  
**AI Analysis**: Not yet implemented  
**Background Jobs**: Not yet implemented  

---

**Ready to ingest!** Start with the test script:

```bash
npm run test-ingest:latest 0000320193 10-K
```
