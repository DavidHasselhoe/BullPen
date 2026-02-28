# Fiscal Calendar Refactor - Implementation Summary

## Overview

This refactor makes all financial data **fiscal-calendar-correct, period-explicit, and chart-safe**, eliminating all calendar-based inference and EPS-type ambiguity.

## Core Principles (Non-Negotiable)

1. **Fiscal periods are authoritative** - Never infer quarters or years from calendar dates alone
2. **Period end date is the source of truth** - Charts, labels, and ordering derive from `period_end_date`
3. **Metric type must be explicit** - Quarterly ≠ TTM ≠ annual ≠ forward. Never mix EPS types in the same series

## Schema Changes

### Companies Table
- Added `fiscal_year_end_month` (INTEGER, 1-12)
- Added `fiscal_year_end_day` (INTEGER, 1-31)
- Migrated existing `fiscal_year_end` (MM-DD string) to separate month/day columns

### Financial Metrics Table
- Added `fiscal_year` (INTEGER, required) - e.g., 2025
- Added `fiscal_quarter` (INTEGER, 1-4, nullable) - Required for quarterly, NULL for annual/TTM
- Added `accounting_basis` (VARCHAR, default 'gaap') - 'gaap', 'non-gaap', or 'ifrs'
- Added `currency` (VARCHAR, default 'USD') - Separate from unit (shares, etc.)
- Added `split_adjusted` (BOOLEAN, default false) - TRUE if value adjusted for stock splits

## New Utilities

### `lib/metrics/fiscal-calendar.ts`
- `extractFiscalYearEndFromFiling()` - Extracts fiscal year end from filing content
- `calculateFiscalQuarter()` - Calculates fiscal quarter from period_end_date and fiscal year end
- `calculateFiscalYear()` - Calculates fiscal year from period_end_date and fiscal year end
- `getFiscalPeriod()` - Gets fiscal period (year and quarter) for a metric
- `formatFiscalPeriod()` - Formats as "Q{fiscal_quarter} FY{fiscal_year}" or "FY{fiscal_year}"

### `lib/metrics/stock-splits.ts`
- `applyStockSplit()` - Applies stock split to metric value (EPS: divide, shares: multiply)
- `applyAllSplits()` - Applies all applicable splits to a metric
- `fetchStockSplits()` - Fetches stock splits (TODO: implement data source)

### `lib/metrics/metrics-validation.ts`
- `validateFiscalQuarter()` - Ensures quarterly metrics have fiscal_quarter
- `validateEPSValue()` - Rejects quarterly EPS > threshold (default 2.0) post-split
- `validateFiscalYear()` - Ensures fiscal_year is present
- `validateAccountingBasisConsistency()` - Prevents mixing accounting_basis in charts
- `validateFinancialMetric()` - Comprehensive validation

## Updated Logic

### Metrics Extraction (`lib/metrics/metrics-orchestrator.ts`)
1. **Fiscal Calendar Resolution**: Gets company fiscal year end (from company record or filing)
2. **Fiscal Period Calculation**: Calculates fiscal_year and fiscal_quarter for each metric
3. **Stock Split Normalization**: Applies all applicable stock splits at ingest time
4. **Validation**: Validates all metrics before persistence
5. **Storage**: Stores metrics with fiscal fields

### Chart Formatting (`lib/metrics/metrics-formatting.ts`)
- Updated `formatChartDate()` to use fiscal periods: "Q{fiscal_quarter} FY{fiscal_year}"
- Updated `formatPeriodLabel()` to use fiscal periods
- **Removed** calendar-based quarter calculation (`getQuarterFromDate()`)

### Database Operations (`lib/metrics/metrics-db.ts`)
- Updated `createFinancialMetric()` to accept and store fiscal fields
- Updated `createFinancialMetrics()` to accept fiscal fields

## Validation Rules

1. **Reject quarterly EPS**: value > 2.0 post-split (configurable per stock)
2. **Reject metrics where**: `metric_type = quarterly AND fiscal_quarter IS NULL`
3. **Reject charts that mix**: Different `metric_type` or `accounting_basis`
4. **Require**: `fiscal_year` and `period_end_date` for all metrics

## Presentation Rules

Charts must:
- Use `period_end_date` for X-axis ordering
- Label points as: `Q{fiscal_quarter} FY{fiscal_year}` (quarterly) or `FY{fiscal_year}` (annual)
- Never show calendar months unless explicitly requested
- Never combine quarterly and TTM in one series

## Migration Steps

1. **Run Migration**: `supabase/migrations/020_fiscal_calendar_refactor.sql`
   - Adds fiscal fields to `companies` and `financial_metrics` tables
   - Migrates existing `fiscal_year_end` to month/day columns

2. **Backfill Existing Metrics** (TODO):
   - Calculate fiscal_year and fiscal_quarter for existing metrics
   - Use company fiscal_year_end_month/day + period_end_date
   - Script needed: `scripts/backfill-fiscal-periods.ts`

3. **Update Company Fiscal Year End**:
   - Ensure all companies have `fiscal_year_end_month` and `fiscal_year_end_day`
   - Extract from filings if missing

## Testing Requirements

Unit tests needed for:
- Non-calendar fiscal year (e.g., NVIDIA: Jan 31)
- Stock split case (2-for-1 split halves EPS)
- 6-K earnings release (quarterly earnings in 6-K)
- Fiscal quarter calculation edge cases

## Known Limitations

1. **Stock Split Data**: `fetchStockSplits()` returns empty array - needs implementation
2. **Fiscal Year End Extraction**: `extractFiscalYearEndFromFiling()` not yet integrated into ingestion pipeline
3. **Accounting Basis Detection**: Currently defaults to 'gaap' - needs XBRL taxonomy detection
4. **Backfill Script**: Not yet created for existing metrics

## Next Steps

1. Create backfill script for existing metrics
2. Integrate fiscal year end extraction into filing ingestion
3. Implement stock split data fetching
4. Add unit tests for fiscal calendar edge cases
5. Update chart components to use fiscal period formatting
6. Add validation to prevent mixing accounting_basis in queries

## Files Changed

- `supabase/migrations/020_fiscal_calendar_refactor.sql` - Schema migration
- `lib/types/database.ts` - Updated FinancialMetric interface
- `lib/metrics/fiscal-calendar.ts` - NEW: Fiscal calendar utilities
- `lib/metrics/stock-splits.ts` - NEW: Stock split normalization
- `lib/metrics/metrics-validation.ts` - NEW: Validation utilities
- `lib/metrics/metrics-orchestrator.ts` - Updated to use fiscal periods
- `lib/metrics/metrics-db.ts` - Updated to store fiscal fields
- `lib/metrics/metrics-formatting.ts` - Updated to use fiscal periods
- `lib/metrics/metrics-ui.ts` - Updated to include fiscal fields

## Expected Outcome

After this refactor:
- ✅ EPS charts align with actual reported quarters
- ✅ NVIDIA-style fiscal calendars render correctly
- ✅ FPIs (20-F / 6-K) no longer produce synthetic quarters
- ✅ Impossible EPS values are eliminated
- ✅ Charts become legally, analytically, and visually defensible
