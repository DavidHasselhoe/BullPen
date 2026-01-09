# Ingestion Pipeline Architecture

## Overview

The BullPen ingestion pipeline is designed around **modularity**, **testability**, and **determinism**. Each component has a single, well-defined responsibility.

## Component Breakdown

### 1. SEC EDGAR API Client (`sec-edgar.ts`)

**Responsibility**: Communicate with SEC's public EDGAR API

**Key Functions**:
- `getCompanyInfo(cik)` - Fetch company metadata
- `getRecentFilings(cik, type)` - List recent filings
- `getFilingContent(accessionNumber, cik)` - Download filing text
- `formatCIK(cik)` - Normalize CIK to SEC format

**Features**:
- Automatic rate limiting (100ms between requests)
- Required User-Agent header
- URL construction helpers
- Content validation

**Dependencies**: None (pure fetch API)

---

### 2. Filing Parser (`filing-parser.ts`)

**Responsibility**: Extract structured sections from raw SEC filings

**Key Functions**:
- `parse10K(content)` - Extract 10-K sections
- `parse10Q(content)` - Extract 10-Q sections
- `parseFiling(content, type)` - Route to appropriate parser
- `validateParsedSections(parsed)` - Validate extraction quality

**Features**:
- Pattern-based section detection (regex)
- Content cleaning (removes HTML, SGML)
- Section ordering preservation
- Minimum content length validation

**Dependencies**: None (pure TypeScript)

**Section Detection**:
```typescript
// Example: Finding "Item 1A. Risk Factors"
const patterns = [
  /ITEM\s+1A\.?\s+RISK\s+FACTORS/i,
  /ITEM\s+1A\b[^\n]*?RISK\s+FACTORS/i,
];
```

---

### 3. Database Operations (`database.ts`)

**Responsibility**: Type-safe database interactions

**Key Functions**:
- `getOrCreateCompany(params)` - Upsert company
- `createFiling(params)` - Insert filing record
- `createFilingSections(filingId, sections)` - Bulk insert sections
- `updateFilingStatus(filingId, status)` - Update processing status
- `filingExists(accessionNumber)` - Check for duplicates

**Features**:
- Idempotent company creation
- Transaction-safe operations
- Type-safe Supabase client
- Comprehensive error handling

**Dependencies**: 
- `@supabase/supabase-js`
- `lib/supabase/client`
- `lib/types/database`

---

### 4. Ingestion Orchestrator (`filing-ingestion.ts`)

**Responsibility**: Coordinate the complete pipeline

**Key Functions**:
- `ingestFiling(cik, accessionNumber)` - Full pipeline for one filing
- `ingestLatestFiling(cik, type)` - Fetch and ingest latest filing
- `ingestRecentFilings(cik, type, count)` - Batch ingestion

**Features**:
- Progress callbacks for observability
- Comprehensive error handling
- Status tracking (processing → completed/failed)
- Validation at each step

**Dependencies**: All above modules

**Pipeline Steps**:
1. Fetch company info → Create/update in DB
2. Check if filing exists → Skip if yes
3. Fetch filing content → Validate
4. Create filing record → Status: processing
5. Parse sections → Validate
6. Store sections → Update status: completed

---

### 5. HTTP API Route (`app/api/ingest/route.ts`)

**Responsibility**: HTTP interface for triggering ingestion

**Endpoints**:
- `POST /api/ingest` - Trigger ingestion
- `GET /api/ingest` - API documentation

**Request Format**:
```json
{
  "cik": "0000320193",
  "filingType": "10-K"
}
```

**Response Format**:
```json
{
  "success": true,
  "data": {
    "filingId": "...",
    "companyId": "...",
    "sectionsCreated": 6
  },
  "progress": [...]
}
```

**Features**:
- Input validation
- Progress tracking
- Detailed error responses

**Dependencies**: `filing-ingestion.ts`

---

### 6. Test Script (`scripts/test-ingestion.ts`)

**Responsibility**: CLI testing and debugging

**Commands**:
- `info [CIK]` - Fetch company info
- `list [CIK] [TYPE]` - List recent filings
- `ingest-latest [CIK] [TYPE]` - Ingest latest filing
- `ingest <CIK> <ACCESSION>` - Ingest specific filing

**Features**:
- Pre-configured test companies
- Pretty-printed output
- Progress visualization
- Error reporting

**Dependencies**: All ingestion modules

---

## Data Flow Diagram

```
┌─────────────────┐
│   SEC EDGAR     │
│   (External)    │
└────────┬────────┘
         │
         │ HTTP GET (rate-limited)
         ▼
┌─────────────────────────────────────────┐
│  sec-edgar.ts                           │
│  - getCompanyInfo()                     │
│  - getRecentFilings()                   │
│  - getFilingContent()                   │
└────────┬────────────────────────────────┘
         │
         │ Raw filing text
         ▼
┌─────────────────────────────────────────┐
│  filing-parser.ts                       │
│  - parseFiling()                        │
│  - validateParsedSections()             │
└────────┬────────────────────────────────┘
         │
         │ Parsed sections
         ▼
┌─────────────────────────────────────────┐
│  database.ts                            │
│  - createFiling()                       │
│  - createFilingSections()               │
│  - updateFilingStatus()                 │
└────────┬────────────────────────────────┘
         │
         │ SQL INSERT
         ▼
┌─────────────────┐
│   Supabase      │
│   (Database)    │
└─────────────────┘
```

## Orchestration Flow

The `filing-ingestion.ts` orchestrator manages the entire flow:

```typescript
async function ingestFiling(cik, accessionNumber, onProgress) {
  // Step 1: Company
  const company = await getCompanyInfo(cik);
  await getOrCreateCompany(company);
  
  // Step 2: Check duplicate
  if (await filingExists(accessionNumber)) {
    return { success: false, error: 'Already exists' };
  }
  
  // Step 3: Fetch content
  const content = await getFilingContent(accessionNumber, cik);
  
  // Step 4: Create filing
  const filing = await createFiling({...});
  
  // Step 5: Parse
  const parsed = parseFiling(content, filingType);
  const validation = validateParsedSections(parsed);
  
  if (!validation.isValid) {
    await updateFilingStatus(filing.id, 'failed', validation.errors);
    return { success: false };
  }
  
  // Step 6: Store sections
  await createFilingSections(filing.id, parsed.sections);
  
  // Step 7: Complete
  await updateFilingStatus(filing.id, 'completed');
  
  return { success: true, filingId: filing.id };
}
```

## Error Handling Strategy

### At Each Layer

1. **SEC EDGAR Client**: Network errors, rate limits, invalid responses
2. **Parser**: Invalid content, missing sections, malformed HTML
3. **Database**: Unique constraint violations, connection errors
4. **Orchestrator**: Aggregates errors from all layers

### Error Propagation

```typescript
// Database layer
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Orchestrator layer
export interface IngestionResult {
  success: boolean;
  filingId?: string;
  error?: string;
  details?: {...};
}
```

All errors are:
- Caught and wrapped in result objects
- Logged with context
- Stored in `filings.processing_error` if applicable
- Returned to caller for handling

## Testing Strategy

### Unit Testing (Future)

Each module should be tested independently:

```typescript
// sec-edgar.test.ts
test('formatCIK pads to 10 digits', () => {
  expect(formatCIK('320193')).toBe('0000320193');
});

// filing-parser.test.ts
test('parse10K extracts risk factors', () => {
  const content = '...ITEM 1A. RISK FACTORS...';
  const parsed = parse10K(content);
  expect(parsed.sections).toContainEqual({
    type: 'risk_factors',
    name: 'Item 1A. Risk Factors',
  });
});
```

### Integration Testing

Test with real SEC data:

```bash
npm run test-ingest:latest 0000320193 10-K
```

### End-to-End Testing

Use the API route:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -d '{"cik":"0000320193","filingType":"10-K"}'
```

## Performance Considerations

### Rate Limiting

SEC enforces **10 requests/second**. The pipeline includes automatic delays:

```typescript
async function rateLimitDelay() {
  await new Promise(resolve => setTimeout(resolve, 100));
}
```

### Database Performance

- Bulk insert sections (single query)
- Indexed lookups (accession_number, company_id)
- Minimal transactions

### Memory Usage

- Streams not used (filings are typically 1-5 MB)
- Content cleaned before storage (removes HTML/SGML)
- Sections stored separately (efficient retrieval)

## Extensibility

### Adding New Filing Types

1. Add patterns to `filing-parser.ts`:

```typescript
const SECTION_8K_PATTERNS = [
  { type: 'event', patterns: [/ITEM\s+\d+\.\d+/i] },
];
```

2. Add parser function:

```typescript
export function parse8K(content: string): ParsedFiling {
  // ...
}
```

3. Update router in `parseFiling()`.

### Adding New Data Extractions

Future enhancements (not yet implemented):

- **XBRL parsing** for structured financial data
- **Table extraction** for financial statements
- **Exhibit parsing** for supplementary documents
- **PDF rendering** for human-readable output

### Background Job Queue

Future: Replace direct API calls with job queue:

```typescript
// Instead of:
await ingestFiling(cik, accessionNumber);

// Use:
await queue.add('ingest-filing', { cik, accessionNumber });
```

Options: BullMQ, Inngest, Trigger.dev

## Security Considerations

### API Rate Limiting

The public `/api/ingest` endpoint should have rate limiting:

```typescript
// Future: Add rate limiter middleware
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
});
```

### Authentication

Future: Require authentication for ingestion:

```typescript
// Check for valid API key or session
const session = await getServerSession();
if (!session) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Input Validation

Currently validates:
- CIK format (10 digits max)
- Accession number format (XXXXXXXXXX-YY-XXXXXX)
- Filing type (enum values)

## Monitoring & Observability

### Progress Tracking

All functions support optional callbacks:

```typescript
const result = await ingestFiling(cik, accessionNumber, (step, details) => {
  console.log(`[${new Date().toISOString()}] ${step}`, details);
});
```

### Database Status

Track ingestion progress:

```sql
SELECT 
  processing_status,
  COUNT(*) as count
FROM filings
GROUP BY processing_status;
```

### Error Tracking

Failed filings include error details:

```sql
SELECT 
  accession_number,
  processing_error,
  updated_at
FROM filings
WHERE processing_status = 'failed'
ORDER BY updated_at DESC;
```

## Future Architecture

### Background Jobs

```
API Route → Job Queue → Workers → Database
```

- Decouples API from long-running tasks
- Enables retry logic
- Scales horizontally

### Caching

```
SEC EDGAR → Redis Cache → Application
```

- Cache company info (rarely changes)
- Cache filing lists (daily updates)
- Reduce SEC API calls

### Webhooks

```
Ingestion Complete → Webhook → External Services
```

- Notify on completion
- Trigger downstream processing
- Enable integrations

---

**Status**: ✅ Minimal pipeline complete  
**Next**: Add AI analysis, metrics extraction, signal generation
