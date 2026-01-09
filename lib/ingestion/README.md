# BullPen Ingestion Pipeline

Minimal, deterministic background ingestion pipeline for SEC filings.

## Architecture

The pipeline follows a clean, testable structure:

```
1. SEC EDGAR API Client (sec-edgar.ts)
   ↓ Fetches filing metadata and content
   
2. Filing Parser (filing-parser.ts)
   ↓ Extracts sections from raw filing
   
3. Database Operations (database.ts)
   ↓ Stores companies, filings, and sections
   
4. Ingestion Orchestrator (filing-ingestion.ts)
   ↓ Coordinates entire pipeline
   
5. API Route (/api/ingest)
   ↓ HTTP endpoint for triggering ingestion
```

## File Structure

```
lib/ingestion/
├── README.md                    # This file
├── sec-edgar.ts                 # SEC EDGAR API client
├── filing-parser.ts             # Filing section extraction
├── database.ts                  # Database operations
└── filing-ingestion.ts          # Pipeline orchestrator

app/api/ingest/
└── route.ts                     # HTTP API endpoint

scripts/
└── test-ingestion.ts            # CLI test script
```

## Features

✅ **Deterministic parsing** - Sections extracted by pattern matching  
✅ **Type-safe operations** - Full TypeScript coverage  
✅ **Error handling** - Comprehensive error reporting  
✅ **Progress tracking** - Callback-based progress updates  
✅ **Idempotent** - Checks for existing filings  
✅ **Rate limiting** - Respects SEC API limits (10 req/sec)  
✅ **Testable** - Modular functions with clear interfaces  

## Supported Filing Types

- **10-K** - Annual report
- **10-Q** - Quarterly report
- **8-K** - Current events (basic support)

### 10-K Sections Extracted

- Item 1: Business Overview
- Item 1A: Risk Factors
- Item 3: Legal Proceedings
- Item 7: Management's Discussion and Analysis (MD&A)
- Item 8: Financial Statements
- Item 9A: Controls and Procedures

### 10-Q Sections Extracted

- Item 1: Financial Statements
- Item 2: Management's Discussion and Analysis (MD&A)
- Item 1A: Risk Factors
- Item 4: Controls and Procedures

## Usage

### 1. Via API Route

Start the Next.js dev server:

```bash
npm run dev
```

Trigger ingestion via HTTP:

```bash
# Ingest latest 10-K for Apple
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"cik": "0000320193", "filingType": "10-K"}'

# Ingest specific filing
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"cik": "0000320193", "accessionNumber": "0000320193-23-000077"}'
```

### 2. Via Test Script

Run the test script directly:

```bash
# Install tsx for TypeScript execution
npm install -D tsx

# Fetch company info
npx tsx scripts/test-ingestion.ts info 0000320193

# List recent 10-K filings
npx tsx scripts/test-ingestion.ts list 0000320193 10-K

# Ingest latest 10-K
npx tsx scripts/test-ingestion.ts ingest-latest 0000320193 10-K

# Ingest specific filing
npx tsx scripts/test-ingestion.ts ingest 0000320193 0000320193-23-000077
```

### 3. Programmatic Usage

Import and use in your code:

```typescript
import { ingestLatestFiling } from '@/lib/ingestion/filing-ingestion';

// Ingest latest 10-K for Apple
const result = await ingestLatestFiling('0000320193', '10-K', (step, details) => {
  console.log(`Progress: ${step}`, details);
});

if (result.success) {
  console.log('Filing ID:', result.filingId);
  console.log('Sections created:', result.sectionsCreated);
} else {
  console.error('Error:', result.error);
}
```

## Pipeline Steps

When you trigger an ingestion, the pipeline executes these steps:

1. **Fetch company information** from SEC EDGAR
2. **Create/update company** in database (idempotent)
3. **Check if filing exists** (skip if already ingested)
4. **Fetch filing content** from SEC EDGAR
5. **Validate content** (check for SEC headers)
6. **Identify filing type** from SEC metadata
7. **Create filing record** in database (status: processing)
8. **Parse filing** into sections
9. **Validate parsed sections** (minimum content requirements)
10. **Store sections** in database
11. **Update status** to completed

If any step fails, the filing status is set to `failed` with error details.

## Testing

### Test Companies

The pipeline includes pre-configured test companies:

- **AAPL** (Apple): `0000320193`
- **MSFT** (Microsoft): `0000789019`
- **GOOGL** (Alphabet): `0001652044`
- **TSLA** (Tesla): `0001318605`

### Quick Test

```bash
# Test with Apple's latest 10-K
npx tsx scripts/test-ingestion.ts ingest-latest 0000320193 10-K
```

Expected output:
```
🔄 Ingesting latest 10-K filing for CIK: 0000320193

  → Fetching company information ({"cik":"0000320193"})
  → Company info retrieved ({"name":"Apple Inc."})
  → Creating/updating company in database
  → Company ready ({"companyId":"..."})
  → Checking if filing already exists
  → Fetching filing content from SEC EDGAR
  → Filing content retrieved ({"contentLength":...})
  → Filing type identified ({"filingType":"10-K"})
  → Creating filing record in database
  → Filing record created ({"filingId":"..."})
  → Parsing filing into sections
  → Filing parsed successfully {...}
  → Storing filing sections in database
  → Marking filing as completed
  → Ingestion completed successfully

✅ Ingestion completed successfully!

Results:
  Filing ID:        abc123...
  Company ID:       xyz789...
  Sections Created: 6
```

## Error Handling

The pipeline includes comprehensive error handling:

- **Company not found** - Creates new company record
- **Filing already exists** - Returns error without re-ingesting
- **Invalid CIK** - Validates format before calling SEC API
- **SEC API errors** - Returns detailed error messages
- **Parsing failures** - Stores error in filing record
- **Database errors** - Returns error without partial data

All errors are logged with context for debugging.

## Rate Limiting

The SEC EDGAR API enforces rate limits:

- **10 requests per second** maximum
- **User-Agent header required** with contact email

The pipeline includes automatic rate limiting:

```typescript
// Automatic 100ms delay between requests
await rateLimitDelay();
```

**Important**: Update the User-Agent in `sec-edgar.ts`:

```typescript
const SEC_CONFIG = {
  userAgent: 'BullPen Analytics your-email@example.com',
  // ...
};
```

## Database Schema

The pipeline writes to three tables:

### companies
- ticker, name, cik
- sector, industry (optional)
- metadata (JSONB)

### filings
- company_id (FK)
- filing_type (10-K, 10-Q, etc.)
- accession_number (unique)
- filing_date, period_end_date
- source_url, document_url
- **processing_status** (pending/processing/completed/failed)
- processing_error (NULL on success)

### filing_sections
- filing_id (FK)
- section_type (ENUM)
- section_name (e.g., "Item 1. Business")
- content (TEXT)
- content_length (INTEGER)
- section_order (INTEGER)

## Future Enhancements

Planned improvements (not yet implemented):

- [ ] Background job queue (e.g., BullMQ, Inngest)
- [ ] Batch ingestion for multiple companies
- [ ] XBRL financial data extraction
- [ ] 8-K event parsing
- [ ] Incremental updates (only new filings)
- [ ] Retry logic with exponential backoff
- [ ] Webhook notifications on completion
- [ ] Admin dashboard for monitoring

## Troubleshooting

### "Company not found" error

Make sure the CIK is correctly formatted:
```typescript
import { formatCIK } from '@/lib/ingestion/sec-edgar';
const formattedCIK = formatCIK('320193'); // "0000320193"
```

### "Invalid filing content" error

The SEC may have returned an error page instead of filing content. Check:
1. Accession number is correct
2. CIK matches the accession number
3. Filing exists on SEC website

### "No sections found" error

The filing parser couldn't identify standard sections. This can happen if:
1. Filing is in unusual format
2. Filing is an amendment (10-K/A)
3. Company uses non-standard section headers

### Rate limit errors

If you see 403 errors from SEC:
1. Check User-Agent header is set correctly
2. Reduce request rate (increase delay)
3. Wait a few minutes and retry

## Resources

- [SEC EDGAR API Documentation](https://www.sec.gov/edgar/sec-api-documentation)
- [SEC Filing Types Reference](https://www.sec.gov/forms)
- [BullPen Database Schema](../../supabase/DATABASE_DESIGN.md)

## Support

For issues with the ingestion pipeline, check:
1. Database connection (`.env.local` configured)
2. Supabase schema applied (`supabase db push`)
3. SEC API accessibility (test with `curl`)
4. TypeScript compilation (`npm run build`)

---

**Status**: ✅ Minimal pipeline complete (no AI analysis yet)  
**Next**: Implement AI-driven extraction and signal generation
