# Form 8-K Ingestion Pipeline — Plan & Implementation

## Executive Summary

Form 8-K filings are event-driven disclosures (earnings releases, stock splits, M&A, executive changes). This plan integrates full 8-K content ingestion into BullPen's ingestion pipeline. Today, 8-K parsing logic exists but is **never triggered** in the lazy ingestion or cron flows. This document describes the gap, approach, and implementation.

---

## Current State Analysis

### What Exists (Working)

| Component | Status | Notes |
|-----------|--------|-------|
| `form8k-parser.ts` | ✅ | Parses 8-K items (1.01, 2.02, 2.03, 3.01, 3.02, 5.02, 7.01, 8.01) |
| `form8k-split-detection.ts` | ✅ | Detects stock splits from items 3.02, 8.01 |
| `form8k-item202-parser.ts` | ✅ | Parses Item 2.02 earnings (EPS, revenue, period) |
| `filing-ingestion.ts` | ✅ | Phase A (events) + Phase B (Item 2.02 earnings) |
| `corporate-events-db.ts` | ✅ | Stores corporate events |
| `sec-edgar.ts` getRecentFilings | ✅ | Supports `filingType: '8-K'` |
| `database.ts` createFiling | ✅ | Supports 8-K with items, accepted_date |

### What's Broken / Missing

| Gap | Impact |
|-----|--------|
| **Submissions processor stores 8-K** | Creates metadata-only 8-K records. When we later call `ingestFiling`, it fails with "Filing already exists" — we can never run full content ingestion. |
| **Lazy ingestion ignores 8-K** | Only processes 10-K, 10-Q, 20-F, 6-K. Never fetches or parses 8-K content. |
| **Cron freshness excludes 8-K** | `checkForNewFilings` only tracks 10-K, 10-Q, 20-F. New 8-Ks don't trigger refresh. |
| **API/CLI** | `ingestLatestFiling(cik, '8-K')` works when called directly, but nothing invokes it. |

---

## 8-K Data Flow (Target State)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        8-K INGESTION TRIGGERS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Lazy Ingestion (user visits stock page)                                   │
│ 2. Cron (when 10-K/10-Q triggers full refresh)                               │
│ 3. Manual: POST /api/ingest { cik, filingType: '8-K' }                        │
│ 4. Manual: ingestLatestFiling(cik, '8-K') or ingestRecentFilings(cik, '8-K') │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ingestFiling(cik, accessionNumber)                                            │
│   → Fetch content from SEC                                                   │
│   → Classify as 8-K → handle8KPhaseA → [handle8KEarningsPhaseB if Item 2.02] │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────────┐
│ Phase A: Events              │    │ Phase B: Item 2.02                       │
│ - Parse items from document   │    │ - Parse EPS, revenue, period             │
│ - Extract accepted_date       │    │ - Reject if 10-Q exists for same period   │
│ - Create filing record        │    │ - Create financial_metrics (eps, revenue) │
│ - Detect stock splits →       │    │ - Enables "earnings date" = filing_date   │
│   stock_splits table          │    └──────────────────────────────────────────┘
│ - Create corporate_events     │
└──────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Fix Submissions Processor Conflict

**Problem**: `processAndUpsertFilings` stores 8-K with `processing_status: completed` (metadata only). Then `ingestFiling` sees `filingExists` and exits without fetching content.

**Solution**: Remove 8-K from `FORMS_TO_STORE` in `submissions-processor.ts`. 8-K will only be created by the full content ingestion path (`ingestFiling`). This keeps a single source of truth and ensures all 8-K records have parsed items, events, and (when applicable) Item 2.02 metrics.

**Risk**: Existing 8-K rows in `filings` (from prior submissions upserts) will remain. They are metadata-only. We do not delete them; future 8-K ingest will fail for those accession numbers with "already exists". Mitigation: Those records are rare (lazy ingest stores 10-K/10-Q/20-F/6-K; 8-K was stored but never triggered content ingest). For affected companies, a one-time backfill script could delete metadata-only 8-K rows if needed.

### Phase 2: Add 8-K Step to Lazy Ingestion

**Location**: `lib/search/lazy-ingestion.ts`

**Logic**:
1. After Step 7 (Finalizing), add **Step 8: Ingest Recent 8-Ks**
2. Call `ingestRecent8Ks(company, cik, options)`:
   - `getRecentFilings(cik, '8-K', RECENT_8K_LIMIT)` — default 5
   - For each accession number: if `!filingExists(accn)`, call `ingestFiling(cik, accn, onProgress)`
   - Respect SEC rate limit (already in getFilingContent)
   - Non-blocking: if 8-K ingest fails, log and continue (don't fail the whole lazy ingest)

**Config**: `RECENT_8K_LIMIT = 5` (balance: coverage vs. time/rate limits)

### Phase 3: Cron / Freshness (Optional, Deferred)

**Decision**: Do NOT add 8-K to `TRACKED_FORMS` in `filing-freshness.ts`. Companies file 8-Ks frequently; adding it would trigger cron re-ingestion too often. When cron runs for 10-K/10-Q, the full lazy ingest includes the new 8-K step, so we get 8-Ks as a side effect of normal refresh.

### Phase 4: API & Test Script Support

**API** (`/api/ingest`):
- Already supports `{ cik, filingType: '8-K' }` via `ingestLatestFiling`
- Add support for `{ cik, filingType: '8-K', limit: N }` to ingest last N 8-Ks (uses `ingestRecentFilings`)

**Test script** (`scripts/test-ingestion.ts`):
- Ensure `ingest-latest 8-K` and `ingest recent 8-K` work

### Phase 5: Earnings Date Extraction (Follow-up)

The **8-K filing date** for Item 2.02 = **earnings announcement date**. To expose this:
- Option A: Add `earnings_announcement_date` to filings table for 8-K with Item 2.02
- Option B: Create `earnings_dates` table (company_id, period_end_date, announcement_date, source: '8-K')
- Option C: Query existing filings: `filing_type = '8-K' AND '2.02' = ANY(items)` → filing_date is earnings date

Phase 5 is out of scope for this implementation; document for future work.

---

## Edge Cases & Safety

| Case | Behavior |
|------|----------|
| 8-K with no parseable items | Phase A fails, return error; no partial write |
| 8-K Item 2.02 but 10-Q exists | Phase B rejects (10-Q authoritative); Phase A events still stored |
| Item 2.02 with YTD/annual language | Parser rejects; no metrics created |
| Stock split in 8.01 | Detected, stored in stock_splits |
| SEC rate limit | Existing rateLimitDelay in sec-edgar; no new logic |
| Duplicate accession | filingExists → skip, no duplicate work |

---

## File Changes Summary

| File | Change |
|------|--------|
| `lib/ingestion/submissions-processor.ts` | Remove '8-K' from FORMS_TO_STORE |
| `lib/search/lazy-ingestion.ts` | Add Step 8: ingest recent 8-Ks after finalizing |
| `lib/ingestion/filing-ingestion.ts` | Export `ingestRecent8Ks` or ensure `ingestRecentFilings` supports 8-K |
| `app/api/ingest/route.ts` | Add `limit` param for batch 8-K ingest |
| `docs/8K_INGESTION_PLAN.md` | This document |

---

## Verification

1. **Unit**: Run `ingestLatestFiling(cik, '8-K')` for a company with recent 8-K — should create filing, corporate_events, and optionally stock_splits / metrics
2. **Integration**: Trigger lazy ingest for NVDA → verify recent 8-Ks appear in filings, corporate_events
3. **Idempotency**: Re-run ingest for same accession → "Filing already exists"

---

## References

- [SEC Form 8-K](https://www.sec.gov/files/form8-k.pdf)
- [SEC Item 2.02 — Results of Operations](https://www.sec.gov/files/form8-k.pdf)
- Existing: `lib/ingestion/form8k-parser.ts`, `form8k-item202-parser.ts`, `filing-ingestion.ts` (Phase A/B)
