-- Fiscal Calendar Refactor Migration
-- Makes all financial data fiscal-calendar-correct, period-explicit, and chart-safe
-- Eliminates calendar-based inference and EPS-type ambiguity

-- =====================================================
-- COMPANIES TABLE: Add fiscal year end month/day
-- =====================================================
-- Split fiscal_year_end (MM-DD string) into separate month and day columns
-- This allows proper fiscal quarter calculation

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS fiscal_year_end_month INTEGER,
ADD COLUMN IF NOT EXISTS fiscal_year_end_day INTEGER;

-- Migrate existing fiscal_year_end (MM-DD format) to month/day columns
UPDATE companies
SET 
  fiscal_year_end_month = CASE 
    WHEN fiscal_year_end IS NOT NULL AND LENGTH(fiscal_year_end) >= 5 THEN
      CAST(SUBSTRING(fiscal_year_end, 1, 2) AS INTEGER)
    ELSE NULL
  END,
  fiscal_year_end_day = CASE 
    WHEN fiscal_year_end IS NOT NULL AND LENGTH(fiscal_year_end) >= 5 THEN
      CAST(SUBSTRING(fiscal_year_end, 4, 2) AS INTEGER)
    ELSE NULL
  END
WHERE fiscal_year_end IS NOT NULL;

-- Add constraints
ALTER TABLE companies
ADD CONSTRAINT check_fiscal_year_end_month CHECK (fiscal_year_end_month IS NULL OR (fiscal_year_end_month >= 1 AND fiscal_year_end_month <= 12)),
ADD CONSTRAINT check_fiscal_year_end_day CHECK (fiscal_year_end_day IS NULL OR (fiscal_year_end_day >= 1 AND fiscal_year_end_day <= 31));

-- Add index for fiscal year end lookups
CREATE INDEX IF NOT EXISTS idx_companies_fiscal_year_end ON companies(fiscal_year_end_month, fiscal_year_end_day);

COMMENT ON COLUMN companies.fiscal_year_end_month IS 'Fiscal year end month (1-12), canonical company-level field';
COMMENT ON COLUMN companies.fiscal_year_end_day IS 'Fiscal year end day (1-31), canonical company-level field';

-- =====================================================
-- FINANCIAL_METRICS TABLE: Add fiscal period fields
-- =====================================================

-- Add fiscal period fields
ALTER TABLE financial_metrics
ADD COLUMN IF NOT EXISTS fiscal_year INTEGER,
ADD COLUMN IF NOT EXISTS fiscal_quarter INTEGER CHECK (fiscal_quarter IS NULL OR (fiscal_quarter >= 1 AND fiscal_quarter <= 4)),
ADD COLUMN IF NOT EXISTS accounting_basis VARCHAR(20) DEFAULT 'gaap' CHECK (accounting_basis IN ('gaap', 'non-gaap', 'ifrs')),
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS split_adjusted BOOLEAN DEFAULT FALSE;

-- Add index for fiscal period queries
CREATE INDEX IF NOT EXISTS idx_financial_metrics_fiscal_period ON financial_metrics(company_id, fiscal_year, fiscal_quarter);
CREATE INDEX IF NOT EXISTS idx_financial_metrics_accounting_basis ON financial_metrics(accounting_basis);

-- Add comments
COMMENT ON COLUMN financial_metrics.fiscal_year IS 'Fiscal year (e.g., 2025). Required for all metrics.';
COMMENT ON COLUMN financial_metrics.fiscal_quarter IS 'Fiscal quarter (1-4). Required for quarterly metrics, NULL for annual/TTM.';
COMMENT ON COLUMN financial_metrics.accounting_basis IS 'Accounting basis: gaap, non-gaap, or ifrs. Never mix in same chart.';
COMMENT ON COLUMN financial_metrics.currency IS 'Currency code (USD, EUR, etc.). Separate from unit (shares, etc.).';
COMMENT ON COLUMN financial_metrics.split_adjusted IS 'TRUE if value has been adjusted for stock splits at ingest time.';

-- =====================================================
-- VALIDATION CONSTRAINTS
-- =====================================================

-- Note: fiscal_year NOT NULL constraint is enforced in application logic
-- Existing rows may have NULL fiscal_year until backfilled
-- New metrics from ingestion pipeline will always have fiscal_year set

-- Add check constraint: fiscal_quarter must be 1-4 if not null
-- (Already added in column definition above)

-- Note: We don't add a NOT NULL constraint on fiscal_year here because:
-- 1. Existing rows don't have fiscal_year values yet (need backfill)
-- 2. Application logic enforces fiscal_year requirement for new metrics
-- 3. Backfill script will populate fiscal_year for existing rows

-- =====================================================
-- UPDATE PERIOD_TYPE ENUM
-- =====================================================
-- Ensure period_type enum includes all required values
-- Note: 'forward' is not in current enum, but we'll handle it in application logic
-- The enum is: 'annual', 'quarterly', 'ttm', 'ytd'

-- =====================================================
-- MIGRATION NOTES
-- =====================================================
-- Existing metrics will need to be backfilled with fiscal_year and fiscal_quarter
-- This should be done via application logic after migration
-- Use company fiscal_year_end_month/day + period_end_date to calculate fiscal_quarter
