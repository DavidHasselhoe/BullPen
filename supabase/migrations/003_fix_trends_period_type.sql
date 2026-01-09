-- Fix Trends Table: Add period_type column and update unique constraint
-- This allows the same trend type to exist for both annual and quarterly periods

-- Add period_type column
ALTER TABLE trends ADD COLUMN IF NOT EXISTS period_type VARCHAR(20);

-- Update existing rows to have a default period_type (if any exist)
UPDATE trends SET period_type = 'annual' WHERE period_type IS NULL;

-- Make period_type NOT NULL after setting defaults
ALTER TABLE trends ALTER COLUMN period_type SET NOT NULL;

-- Drop the old unique constraint (check both possible names)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_company_metric_trend') THEN
    ALTER TABLE trends DROP CONSTRAINT unique_company_metric_trend;
  END IF;
END $$;

-- Create new unique constraint that includes period_type
ALTER TABLE trends ADD CONSTRAINT unique_company_metric_trend_period 
  UNIQUE (company_id, metric_type, trend_type, period_type);

-- Add index for period_type queries
CREATE INDEX IF NOT EXISTS idx_trends_period_type ON trends(period_type);

COMMENT ON COLUMN trends.period_type IS 'Period type for the trend analysis: annual or quarterly';
