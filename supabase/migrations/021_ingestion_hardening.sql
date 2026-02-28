-- Ingestion Hardening Migration
-- Phase 1: Add ingested_at timestamp and prepare for hard reset

-- =====================================================
-- FINANCIAL_METRICS: Add ingested_at timestamp
-- =====================================================
-- Track when metrics were ingested to gate charts behind re-ingested data only

ALTER TABLE financial_metrics
ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ DEFAULT NOW();

-- Set ingested_at for existing metrics to created_at (legacy data marker)
UPDATE financial_metrics
SET ingested_at = created_at
WHERE ingested_at IS NULL;

-- Add index for filtering by ingestion date
CREATE INDEX IF NOT EXISTS idx_financial_metrics_ingested_at ON financial_metrics(ingested_at DESC);

COMMENT ON COLUMN financial_metrics.ingested_at IS 'Timestamp when metric was ingested. Used to gate charts behind re-ingested data only.';

-- =====================================================
-- STOCK_SPLITS TABLE
-- =====================================================
-- Phase 4: Persist stock splits for split adjustment

CREATE TABLE IF NOT EXISTS stock_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  split_ratio NUMERIC(10, 4) NOT NULL CHECK (split_ratio > 0),
  effective_date DATE NOT NULL,
  source VARCHAR(50) NOT NULL, -- 'sec_filing', 'market_data_api', etc.
  source_reference TEXT, -- Accession number, API ID, etc.
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, effective_date, split_ratio)
);

CREATE INDEX idx_stock_splits_company_id ON stock_splits(company_id);
CREATE INDEX idx_stock_splits_effective_date ON stock_splits(effective_date DESC);
CREATE INDEX idx_stock_splits_company_date ON stock_splits(company_id, effective_date DESC);

COMMENT ON TABLE stock_splits IS 'Stock splits for split adjustment. Must be ingested before EPS metrics.';
COMMENT ON COLUMN stock_splits.split_ratio IS 'Split ratio (e.g., 2.0 for 2-for-1 split, 0.5 for 1-for-2 reverse split)';
COMMENT ON COLUMN stock_splits.effective_date IS 'Date when split becomes effective';
COMMENT ON COLUMN stock_splits.source IS 'Source of split data: sec_filing, market_data_api, etc.';

-- =====================================================
-- UNIQUE CONSTRAINT: One EPS per quarter
-- =====================================================
-- Phase 3: Enforce one EPS per (company, fiscal_year, fiscal_quarter, accounting_basis)

-- Drop existing unique constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_eps_per_quarter'
  ) THEN
    ALTER TABLE financial_metrics DROP CONSTRAINT unique_eps_per_quarter;
  END IF;
END $$;

-- Add new unique constraint for EPS metrics
-- Allows both eps_basic and eps_diluted per quarter by including metric_type in the constraint
CREATE UNIQUE INDEX unique_eps_per_quarter ON financial_metrics(company_id, metric_type, fiscal_year, fiscal_quarter, accounting_basis)
WHERE metric_type IN ('eps_basic', 'eps_diluted') 
  AND period_type = 'quarterly'
  AND fiscal_quarter IS NOT NULL;

COMMENT ON INDEX unique_eps_per_quarter IS 'Ensures one EPS per (company, metric_type, fiscal_year, fiscal_quarter, accounting_basis) - allows both basic and diluted';

-- =====================================================
-- FISCAL_REFACTOR_RELEASE_DATE
-- =====================================================
-- Timestamp when fiscal refactor was released (for gating charts)

-- Store as a constant in application code:
-- export const FISCAL_REFACTOR_RELEASE_DATE = '2025-01-15T00:00:00Z';

-- =====================================================
-- MIGRATION NOTES
-- =====================================================
-- 1. Existing metrics have ingested_at = created_at (legacy data)
-- 2. New metrics will have ingested_at = NOW() (re-ingested data)
-- 3. Charts must filter: WHERE ingested_at >= '2025-01-15T00:00:00Z'
-- 4. Stock splits table is created but needs data ingestion (Phase 4)
-- 5. EPS unique constraint prevents duplicate quarterly EPS per company/quarter/accounting_basis
