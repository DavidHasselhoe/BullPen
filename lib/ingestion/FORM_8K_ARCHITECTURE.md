# Form 8-K Ingestion Architecture

## Overview

Form 8-K ingestion is implemented as a **two-phase system** with strict safety guarantees. Phase A (events-only) is fully implemented and validated. Phase B (Item 2.02 earnings extraction) is not yet implemented.

## Core Principles

**Coverage is intentionally limited. Correctness is mandatory.**

The system prioritizes correctness over coverage. It is better to reject ambiguous cases than to create incorrect metrics.

## Phase A: Events-Only Ingestion (Implemented & Locked)

Phase A handles 8-K filings as **event-driven disclosures only**. It **MUST NEVER** create financial metrics.

### What Phase A Does

- **Item parsing**: Extracts 8-K item numbers (1.01, 2.02, 3.01, 3.02, 5.02, 7.01, 8.01)
- **Accepted date extraction**: Extracts `ACCEPTANCE-DATETIME` from SEC header
- **Filing persistence**: Creates filing record with:
  - `filing_type = '8-K'`
  - `items: string[]`
  - `accepted_date: string`
  - **NO fiscal fields** (no `fiscal_year`, `fiscal_quarter`, `period_end_date`)
- **Stock split detection**: Detects splits from items 3.02 and 8.01, persists to `stock_splits` table
- **Corporate event creation**: Creates events for non-metric items (excludes 2.02), persists to `corporate_events` table

### What Phase A Does NOT Do

- ❌ **NO metrics creation** (EPS, revenue, etc.)
- ❌ **NO fiscal period inference**
- ❌ **NO Item 2.02 earnings extraction**
- ❌ **NO fallback logic**

### Item 2.02 Handling (Phase A)

If Item 2.02 is present:
- Phase A detects it
- Stores metadata flag (`has_item_2_02: true`)
- **Does nothing else**

### Safety Constraints

Phase A is locked with explicit guardrails:

1. **Early short-circuit**: 8-K filings branch early, before classification/metrics logic
2. **Function-level invariant**: `handle8KPhaseA()` must never create metrics
3. **No fiscal fields**: Filing records for 8-K have no fiscal year, quarter, or period end date
4. **Test coverage**: Phase A tests validate no metrics are created

## Phase B: Item 2.02 Earnings Extraction (Implemented)

Phase B handles Item 2.02 earnings releases with conservative, fail-closed extraction logic.

### Behavior

- Executes **only after Phase A completes**
- Extracts quarterly EPS and revenue from Item 2.02 content
- Requires explicit "Quarter Ended" language
- Resolves fiscal period using company fiscal year-end
- Checks for 10-Q precedence (10-Q is authoritative)
- Applies stock splits to EPS values
- Validates EPS invariants (upper bound, split-adjusted)
- Rejects if any ambiguity exists

### Rejection Criteria

Phase B rejects extraction if:
- Item 2.02 parsing fails
- Period cannot be resolved to fiscal quarter
- Non-GAAP or adjusted language present
- YTD or combined periods mentioned
- 10-Q exists for same fiscal period (10-Q is authoritative)
- EPS validation fails
- Fiscal year end not found on company record

## File Structure

```
lib/ingestion/
├── filing-ingestion.ts          # Main orchestrator (8-K Phase A & B)
├── form8k-parser.ts             # 8-K item parsing
├── form8k-item202-parser.ts     # Item 2.02 earnings parser (Phase B)
├── form8k-split-detection.ts    # Stock split detection
├── corporate-events-db.ts       # Corporate events database operations
└── FORM_8K_ARCHITECTURE.md      # This file

lib/metrics/
├── splits-db.ts                 # Stock splits database operations
├── stock-splits.ts              # Stock split adjustment logic
├── fiscal-calendar.ts           # Fiscal period resolution
└── eps-invariants.ts            # EPS validation rules
```

## Database Schema

### Filings Table (8-K)

8-K filings are stored with:
- `filing_type = '8-K'`
- `items: string[]` (array of item numbers)
- `accepted_date: DATE` (from ACCEPTANCE-DATETIME)
- `fiscal_year: NULL`
- `fiscal_quarter: NULL`
- `period_end_date: NULL`
- `metadata.has_item_2_02: boolean`

### Stock Splits Table

Stock splits detected from 8-K:
- `source = '8-K'`
- `source_reference: string` (accession number)
- `split_ratio: number`
- `effective_date: DATE`
- `metadata.item: string` (3.02 or 8.01)

### Corporate Events Table

Corporate events from 8-K:
- `event_type: CorporateEventType`
- `event_date: DATE` (from accepted_date)
- `metadata.item: string` (item number)
- `metadata.accession_number: string`

## Testing

### Phase A Tests

Location: `scripts/test-8k-phase-a.ts`

Test cases:
- Stock split detection (NVIDIA 10-for-1 split)
- Corporate events (Apple 5.02 executive change)
- Item 2.02 safety (Tesla - must NOT produce metrics in Phase A)
- Re-ingestion determinism

### Required Phase A Test Assertions

All Phase A tests must assert:
- ✅ No metrics created by Phase A (`financial_metrics` count unchanged before Phase B)
- ✅ No fiscal fields on filing (`fiscal_year`, `fiscal_quarter`, `period_end_date` are NULL)
- ✅ Items array populated correctly
- ✅ Stock splits persisted (if detected)
- ✅ Corporate events created (if applicable)
- ✅ Re-ingestion is idempotent (no duplicates)

### Phase B Tests

Phase B integration is tested via real filings with Item 2.02.

Required Phase B test assertions:
- ✅ Metrics created only when all criteria met (explicit "Quarter Ended", valid fiscal period, no 10-Q precedence)
- ✅ EPS values are split-adjusted and validated
- ✅ Metrics have `source = '8-K'` and `source_item = '2.02'` in metadata
- ✅ Rejection when 10-Q exists for same fiscal period
- ✅ Rejection when non-GAAP or YTD language present
- ✅ Rejection when fiscal period cannot be resolved

## Integration Points

### IngestFiling Function

8-K filings are handled via early short-circuit in `ingestFiling()`:

```typescript
if (filingType === '8-K') {
  const phaseAResult = await handle8KPhaseA({...});
  // Phase A complete - return (no metrics, no fiscal fields)
  return phaseAResult;
}
```

This executes **before**:
- Classification logic
- Fiscal period inference
- Metrics orchestration

### Metrics Orchestrator

The metrics orchestrator (`metrics-orchestrator.ts`) does NOT handle 8-K filings. 8-K metrics (if any) would be created by Phase B (not implemented).

## Error Handling

Phase A errors:
- Item parsing failures → return error
- Filing persistence failures → return error
- Stock split detection failures → log warning, continue (best effort)
- Corporate event creation failures → log warning, continue (best effort)

Phase A is **non-fatal for best-effort operations** (splits, events) but **fatal for core operations** (filing persistence).

## Future Work

### Phase B Implementation (Not Started)

When Phase B is implemented:
1. Must execute after Phase A completes
2. Must never modify Phase A behavior
3. Must reject ambiguous cases aggressively
4. Must respect 10-Q precedence
5. Must validate all EPS invariants

### Coverage Expansion (Out of Scope)

The following are explicitly **out of scope** for current implementation:
- Parser pattern expansion
- Coverage improvements
- Historical backfills
- Estimates extraction
- Confidence scoring
- New ingestion phases

## Summary

**Phase A (Current State):**
- ✅ Fully implemented
- ✅ Events-only (no metrics)
- ✅ Tested with real filings
- ✅ Locked with guardrails

**Phase B (Current State):**
- ✅ Fully implemented
- ✅ Conservative Item 2.02 extraction (fail-closed)
- ✅ 10-Q precedence checking
- ✅ Stock split adjustment
- ✅ EPS validation

**Key Principle:**
Coverage is intentionally limited. Correctness is mandatory.
