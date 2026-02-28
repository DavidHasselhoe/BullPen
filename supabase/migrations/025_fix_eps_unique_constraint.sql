-- Migration: Fix EPS Unique Constraint
-- Fixes the unique_eps_per_quarter constraint to allow both eps_basic and eps_diluted
-- per quarter by including metric_type in the constraint columns

BEGIN;

-- Drop existing unique constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'unique_eps_per_quarter'
  ) THEN
    DROP INDEX IF EXISTS unique_eps_per_quarter;
  END IF;
END $$;

-- Add corrected unique constraint that includes metric_type
-- This allows both eps_basic and eps_diluted for the same fiscal period
CREATE UNIQUE INDEX unique_eps_per_quarter ON financial_metrics(company_id, metric_type, fiscal_year, fiscal_quarter, accounting_basis)
WHERE metric_type IN ('eps_basic', 'eps_diluted') 
  AND period_type = 'quarterly'
  AND fiscal_quarter IS NOT NULL;

COMMENT ON INDEX unique_eps_per_quarter IS 'Ensures one EPS per (company, metric_type, fiscal_year, fiscal_quarter, accounting_basis) - allows both basic and diluted EPS per quarter';

COMMIT;
