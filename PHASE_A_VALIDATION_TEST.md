# Form 8-K Phase A Validation Test Suite

## Overview

Comprehensive integration-level test suite for Form 8-K Phase A validation using real historical SEC filings. These tests ensure that 8-K filings are ingested as event-driven disclosures only, with no metrics extraction.

## Test Strategy

- **Real Filings**: Uses actual SEC 8-K filings (fetched from EDGAR API)
- **Integration Tests**: Tests the actual ingestion pipeline, not mocks
- **Fail-Closed**: Hard failures on any regression or safety violation
- **Deterministic**: Re-ingestion produces identical results

## Test Cases

### Test Case Set 1 — Stock Split Detection (Critical)

**Example Companies**:
- NVIDIA (June 2024 10-for-1 split) - Accession: `0001045810-24-000023`
- Apple (historical 4-for-1 split) - Find actual 8-K accession
- Tesla (5-for-1 and 3-for-1 splits) - Find actual 8-K accession

**Assertions**:
- Filing ingests successfully
- `stock_splits` table contains:
  - Correct `company_id`
  - Correct `split_ratio`
  - Correct `effective_date`
  - `source` = `'sec_filing'`
- `financial_metrics` row count remains unchanged
- `corporate_events` may exist, but no metrics

### Test Case Set 2 — Non-Metric Corporate Events

**Example Items**:
- Item 5.02 — Executive changes
- Item 8.01 — Other events
- Item 1.01 — Material agreements

**Assertions**:
- Filing stored with correct `items[]`
- One or more `corporate_events` created
- `corporate_events.event_type` matches mapping
- No EPS / revenue / numeric metrics created
- No fiscal fields populated on filing

### Test Case Set 3 — Item 2.02 Safety (Negative Test)

**Test**: Real 8-K filings that include Item 2.02 earnings press releases

**Assertions**:
- Filing ingests
- Item 2.02 is detected
- **NO metrics are extracted**
- No EPS rows appear
- No revenue rows appear
- System logs or flags the presence of Item 2.02 without action

**Purpose**: Ensures Phase A does not accidentally bleed into Phase B

### Test Case Set 4 — Accepted Date Ordering

**Test**: Filings where filing date ≠ accepted date

**Assertions**:
- `accepted_date` is persisted correctly
- Stock splits use `effective_date` for ordering
- Event sequencing respects `accepted_date`, not `filing_date`

### Test Case Set 5 — Re-Ingestion Determinism

**Test**: Re-run ingestion on the same 8-K filings

**Assertions**:
- No duplicate stock splits
- No duplicate corporate events
- No new rows added on second run
- Database state is identical

## Hard Failure Conditions (Must Throw)

Tests **MUST FAIL** if:

1. Any metric is created from an 8-K
2. Any `fiscal_year` or `fiscal_quarter` appears on an 8-K
3. Any EPS value exists with `source_filing` = "8-K"
4. Any stock split lacks an `effective_date`
5. Any duplicate split/event appears on re-ingestion
6. Filing has `period_end_date` populated

## Usage

### Prerequisites

1. Database migrations applied (including `023_form_8k_support.sql`)
2. Environment variables configured (`.env.local`)
3. Real 8-K accession numbers identified (see below)

### Finding Real 8-K Accession Numbers

Use SEC EDGAR API or search SEC website for specific 8-K filings:

```bash
# Example: Find NVIDIA 8-K filings
curl -H "User-Agent: YourApp contact@example.com" \
  "https://data.sec.gov/submissions/CIK0001045810.json" | jq '.filings.recent'
```

Look for `form` = "8-K" and note the `accessionNumber`.

### Running Tests

```bash
# Run all Phase A validation tests
npx tsx scripts/test-8k-phase-a.ts

# Or add to package.json
npm run test-8k-phase-a
```

### Updating Test Cases

Edit `scripts/test-8k-phase-a.ts` to add or update test cases:

```typescript
const testCases: TestConfig[] = [
  {
    ticker: 'NVDA',
    cik: '0001045810',
    accessionNumber: '0001045810-24-000023', // Real accession number
    filingDate: '2024-06-07',
    expectedItems: ['3.02'],
    expectedSplits: [
      {
        ratio: 10,
        effectiveDate: '2024-06-10', // Actual effective date
      },
    ],
  },
  // Add more test cases...
];
```

## Test Implementation

The test suite (`scripts/test-8k-phase-a.ts`) includes:

1. **Database Snapshot Helpers**: Capture state before/after ingestion
2. **Assertion Functions**: Validate Phase A invariants
3. **Test Cases**: Real-world 8-K filings with expected outcomes
4. **Hard Failure Checks**: Fail loudly on any regression

### Key Functions

- `getDatabaseSnapshot()`: Captures row counts for metrics, splits, events
- `assertPhaseAInvariants()`: Validates all Phase A safety constraints
- `testStockSplitDetection()`: Tests stock split extraction
- `testReIngestionDeterminism()`: Tests re-ingestion behavior

## Expected Outcome

After all tests pass:

- ✅ Phase A behavior is locked
- ✅ Future refactors cannot break 8-K safety
- ✅ Phase B can be added with confidence
- ✅ Real-world SEC variance is handled correctly

## Definition of Done

- [ ] All test cases pass on real filings
- [ ] Phase A behavior is proven, not assumed
- [ ] Tests catch regression if metrics are accidentally enabled
- [ ] Test suite is runnable in CI
- [ ] Hard failures are implemented for all safety violations

## Notes

- **Coverage vs Correctness**: Tests prioritize correctness over coverage
- **Ambiguous Cases**: Reject aggressively - prefer rejecting extraction over inference
- **Real Filings**: Use actual SEC filings, not mocked data
- **Determinism**: Re-ingestion must produce identical results
