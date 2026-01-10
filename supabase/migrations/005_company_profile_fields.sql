-- Company Profile Fields Migration
-- Adds company profile fields for v1 implementation

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS sic_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS incorporation_location VARCHAR(255),
ADD COLUMN IF NOT EXISTS fiscal_year_end VARCHAR(10), -- Format: "12-31" (MM-DD)
ADD COLUMN IF NOT EXISTS employee_count INTEGER,
ADD COLUMN IF NOT EXISTS employee_count_is_estimated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS shares_outstanding NUMERIC(20, 0); -- Can be very large

-- Add index on sic_code for sector/industry lookups
CREATE INDEX IF NOT EXISTS idx_companies_sic_code ON companies(sic_code);

-- Add comment
COMMENT ON COLUMN companies.sic_code IS 'Standard Industrial Classification code from SEC';
COMMENT ON COLUMN companies.incorporation_location IS 'State or country of incorporation';
COMMENT ON COLUMN companies.fiscal_year_end IS 'Fiscal year end date (MM-DD format)';
COMMENT ON COLUMN companies.employee_count IS 'Number of employees (may be estimated)';
COMMENT ON COLUMN companies.employee_count_is_estimated IS 'Whether employee count is an estimate from text extraction';
COMMENT ON COLUMN companies.shares_outstanding IS 'Common shares outstanding from XBRL';
