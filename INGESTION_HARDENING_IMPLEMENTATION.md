# SEC Ingestion Pipeline Hardening - Implementation Status

## Overview

Comprehensive hardening of the SEC ingestion pipeline to ensure only economically valid quarterly EPS exists, legacy misclassified metrics are impossible, and full historical re-ingestion produces clean, fiscal-correct, split-correct datasets.

---

## Phase 1 — Destructive Reset ✅ COMPLETE

### Implementation
- ✅ Migration `021_ingestion_hardening.sql`:
  - Added `ingested_at` timestamp to `financial_metrics`
  - Created `stock_splits` table (for Phase 4)
  - Added unique constraint for EPS per quarter
- ✅ `lib/metrics/hard-reset.ts`:
  - `hardResetCompany()` - Delete all filings/metrics for a company
  - `hardResetCompanies()` - Delete for multiple companies
  - `hardResetByTickers()` - Delete by ticker symbols
- ✅ `lib/metrics/ingestion-constants.ts`:
  - `FISCAL_REFACTOR_RELEASE_DATE` constant
  - `isReIngestedMetric()` helper
- ✅ Updated chart queries to gate behind re-ingested data:
  - `lib/metrics/metrics-ui.ts` - Added `.gte('ingested_at', FISCAL_REFACTOR_RELEASE_DATE)`
- ✅ Updated types:
  - `lib/types/database.ts` - Added `ingested_at` to `FinancialMetric`

**Status**: ✅ Complete

---

## Phase 2 — Filing → Metric Contract ✅ COMPLETE

### Implementation
- ✅ `lib/metrics/filing-contracts.ts`:
  - `FILING_CONTRACTS` - Contract definitions for 10-Q, 10-K, 20-F, 6-K
  - `validateFilingContract()` - Validates period_type against filing type
  - `getAllowedPeriodTypes()` - Gets allowed period types

### Contracts Defined:
- **10-Q**: May only produce quarterly metrics, requires fiscal_quarter
- **10-K/20-F**: May only produce annual metrics, must NOT have fiscal_quarter
- **6-K**: Conditional - quarterly only if explicitly states "Quarter Ended", otherwise YTD (non-chartable)

**Status**: ✅ Complete - Needs integration into metrics orchestrator

---

## Phase 3 — EPS-Specific Invariants ✅ COMPLETE

### Implementation
- ✅ `lib/metrics/eps-invariants.ts`:
  - `validateQuarterlyEPS()` - Upper bound check (default: <= 1.25)
  - `validateEPSSplitAdjusted()` - Ensures EPS is split-adjusted
- ✅ Database unique constraint:
  - `UNIQUE(company_id, fiscal_year, fiscal_quarter, accounting_basis)` for EPS metrics
  - Implemented in migration `021_ingestion_hardening.sql`

**Status**: ✅ Complete - Needs integration into metrics orchestrator

---

## Phase 4 — Stock Split Authority 🔄 IN PROGRESS

### Implementation
- ✅ `stock_splits` table created in migration
- ✅ `lib/metrics/stock-splits.ts` - Utilities exist (from fiscal calendar refactor)
- ⏳ Need: Split ingestion from SEC filings (8-K / 6-K)
- ⏳ Need: Integration into metrics orchestrator (block EPS if splits missing)

**Status**: 🔄 Partially Complete - Split utilities exist, ingestion needed

---

## Phase 5 — Re-Ingestion Strategy ⏳ PENDING

### Required
- ⏳ Script to reset and re-ingest S&P 500 companies
- ⏳ Reconciliation reporting
- ⏳ Logging of rejected metrics, ambiguous 6-Ks, EPS validation failures

**Status**: ⏳ Pending

---

## Phase 6 — Chart Safety Layer ⏳ PENDING

### Required
- ⏳ Create `safe_quarterly_eps` view
- ⏳ Update UI components to query view instead of base table
- ⏳ Ensure no direct table queries

**Status**: ⏳ Pending

---

## Next Steps

1. **Integrate Phase 2 & 3 into metrics orchestrator**:
   - Add filing contract validation before metric storage
   - Add EPS invariant validation
   - Integrate with existing validation

2. **Complete Phase 4**:
   - Implement split ingestion from SEC filings
   - Block EPS ingestion if splits missing

3. **Implement Phase 5**:
   - Create re-ingestion script
   - Add reconciliation reporting

4. **Implement Phase 6**:
   - Create safe views
   - Update chart queries

---

## Files Created

- `supabase/migrations/021_ingestion_hardening.sql` - Migration
- `lib/metrics/hard-reset.ts` - Hard reset utilities
- `lib/metrics/ingestion-constants.ts` - Constants
- `lib/metrics/filing-contracts.ts` - Filing contract validation
- `lib/metrics/eps-invariants.ts` - EPS invariant validation
- `INGESTION_HARDENING_PLAN.md` - Implementation plan
- `INGESTION_HARDENING_IMPLEMENTATION.md` - This file

## Files Modified

- `lib/types/database.ts` - Added `ingested_at` to `FinancialMetric`
- `lib/metrics/metrics-ui.ts` - Added gating for re-ingested data
