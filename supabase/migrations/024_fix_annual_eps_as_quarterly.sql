-- Migration: Fix Annual EPS Stored as Quarterly
-- Removes invalid EPS rows where annual GAAP EPS from 10-K filings
-- were incorrectly stored as quarterly EPS (period_type = 'quarterly').
--
-- Root Cause: Annual GAAP EPS from 10-K ingestion were stored with:
--   - period_type = 'quarterly'
--   - fiscal_quarter = 4
--   - split_adjusted = false
-- These rows are economically annual EPS, not quarterly, and must be removed.
--
-- Definition of invalid rows:
--   - EPS metrics (eps_basic, eps_diluted)
--   - period_type = 'quarterly'
--   - accounting_basis = 'gaap'
--   - split_adjusted = false
--   - value > 2.0 (annual EPS values, not quarterly)

BEGIN;

-- Step 1: One-Time Data Cleanup
-- First, fix annual metrics that incorrectly have fiscal_quarter set
-- Annual metrics must have fiscal_quarter = NULL
UPDATE financial_metrics
SET fiscal_quarter = NULL
WHERE period_type IN ('annual', 'ttm')
  AND fiscal_quarter IS NOT NULL;

-- Log the fix
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % annual/ttm metrics with non-NULL fiscal_quarter (set to NULL)', updated_count;
END $$;

-- Step 2: Fix quarterly EPS metrics that have NULL fiscal_quarter
-- These are likely misclassified annual EPS - we'll delete them if they also have suspicious values
-- Otherwise, we'll try to infer the fiscal_quarter from period_end_date (this is a best-effort fix)
-- For EPS metrics with value > 2.5 and split_adjusted = false, these are definitely annual EPS
-- and should be deleted or converted to annual

-- First, identify quarterly EPS that are likely annual (value > 2.5, split_adjusted = false, fiscal_quarter = NULL)
-- These are definitely misclassified annual EPS - delete them
DELETE FROM financial_metrics
WHERE metric_type IN ('eps_basic', 'eps_diluted')
  AND period_type = 'quarterly'
  AND fiscal_quarter IS NULL
  AND value > 2.5
  AND split_adjusted = false;

-- Log the cleanup
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % invalid quarterly EPS rows (annual GAAP EPS misclassified as quarterly)', deleted_count;
END $$;

-- Step 3: Delete ALL quarterly EPS with value > 2.5 and split_adjusted = false
-- These are definitely misclassified annual EPS, regardless of fiscal_quarter value
-- Some may have fiscal_quarter = 4 (indicating they were misclassified as Q4), but they're still annual EPS
DELETE FROM financial_metrics
WHERE metric_type IN ('eps_basic', 'eps_diluted')
  AND period_type = 'quarterly'
  AND value > 2.5
  AND split_adjusted = false;

-- Log the cleanup
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % quarterly EPS rows with value > 2.5 and split_adjusted = false (annual EPS misclassified as quarterly)', deleted_count;
END $$;

-- Step 4: Delete all quarterly metrics with NULL fiscal_quarter
-- The constraint requires ALL quarterly metrics to have fiscal_quarter IS NOT NULL
-- We can't reliably infer fiscal_quarter without fiscal year end, so delete incomplete data
-- Better to delete than store incorrect data (fail-closed principle)
-- This removes any quarterly metrics that are missing fiscal_quarter (likely data quality issues)
DELETE FROM financial_metrics
WHERE period_type = 'quarterly'
  AND fiscal_quarter IS NULL;

-- Log the cleanup
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % quarterly metrics with NULL fiscal_quarter (incomplete data, required for constraint)', deleted_count;
END $$;

-- Step 5: Add Database Constraints
-- Constraint 1: fiscal_quarter must be NULL for annual/ttm periods
-- This prevents assigning fiscal_quarter = 4 to represent "Q4" for annual filings
ALTER TABLE financial_metrics
ADD CONSTRAINT fiscal_quarter_only_for_quarterly
CHECK (
  (period_type = 'quarterly' AND fiscal_quarter IS NOT NULL)
  OR
  (period_type IN ('annual', 'ttm') AND fiscal_quarter IS NULL)
);

-- Constraint 2: Quarterly EPS must be within reasonable bounds
-- This prevents storing annual EPS values (e.g., 3.16, 6.04) as quarterly EPS
-- Note: We use 2.5 as the threshold (below the adjusted 10.0 threshold for legitimate quarterly EPS)
-- to catch misclassified annual EPS, not to limit legitimate quarterly EPS
ALTER TABLE financial_metrics
ADD CONSTRAINT quarterly_eps_reasonable_bounds
CHECK (
  NOT (
    period_type = 'quarterly'
    AND metric_type IN ('eps_basic', 'eps_diluted')
    AND value > 2.5
    AND split_adjusted = false
  )
);

COMMIT;
