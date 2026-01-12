-- Foreign Issuer Filings Migration
-- Adds support for 20-F (annual) and 6-K (quarterly/current) filings
-- Foreign private issuers use these forms instead of 10-K/10-Q

-- Step 1: Extend filing_type enum to include foreign issuer forms
-- These must be done as separate statements to commit before using them
ALTER TYPE filing_type ADD VALUE IF NOT EXISTS '20-F';
ALTER TYPE filing_type ADD VALUE IF NOT EXISTS '6-K';

-- Step 2: Add period_type column to filings table if it doesn't exist
-- This allows us to classify filings as annual/quarterly regardless of form type
-- Note: This is in a separate transaction from enum additions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'filings' 
    AND column_name = 'period_type'
  ) THEN
    ALTER TABLE filings 
    ADD COLUMN period_type period_type;
    
    COMMENT ON COLUMN filings.period_type IS 'Classification of reporting period: annual, quarterly, ttm, or ytd';
  END IF;
END $$;

-- Step 3: Set period_type based on existing filing_type for backwards compatibility
-- This must be after the enum values are committed (in a separate transaction)
-- Use string comparison to avoid enum type checking issues
UPDATE filings 
SET period_type = CASE 
  WHEN filing_type::text IN ('10-K', '20-F') THEN 'annual'::period_type
  WHEN filing_type::text IN ('10-Q', '6-K') THEN 'quarterly'::period_type
  ELSE NULL
END
WHERE period_type IS NULL;

-- Step 4: Add index for period_type queries
CREATE INDEX IF NOT EXISTS idx_filings_period_type ON filings(period_type) WHERE period_type IS NOT NULL;

-- Step 5: Update metadata JSONB structure documentation
COMMENT ON COLUMN filings.metadata IS 'Additional filing metadata including original_form_type, exhibit_numbers, classification_confidence, etc.';
