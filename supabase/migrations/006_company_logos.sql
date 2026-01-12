-- Company Logos Migration
-- Adds logo storage fields to companies table

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS logo_source VARCHAR(20) CHECK (logo_source IN ('brand', 'wikipedia', 'manual')),
ADD COLUMN IF NOT EXISTS logo_updated_at TIMESTAMPTZ;

-- Add index for logo queries
CREATE INDEX IF NOT EXISTS idx_companies_logo_url ON companies(logo_url) WHERE logo_url IS NOT NULL;

-- Add comments
COMMENT ON COLUMN companies.logo_url IS 'URL to company logo in Supabase Storage (company-logos bucket)';
COMMENT ON COLUMN companies.logo_source IS 'Source of logo: brand, wikipedia, or manual upload';
COMMENT ON COLUMN companies.logo_updated_at IS 'Timestamp when logo was last fetched/updated';
