-- Company Index Table
-- Lightweight table for search and autocomplete
-- Independent of main companies table

-- Enable pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create company_index table
CREATE TABLE IF NOT EXISTS company_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  cik TEXT NOT NULL,
  normalized_ticker TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  has_data BOOLEAN NOT NULL DEFAULT false,
  last_ingested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_ticker UNIQUE (ticker),
  CONSTRAINT unique_cik UNIQUE (cik)
);

-- Create indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_company_index_normalized_ticker ON company_index (normalized_ticker);
CREATE INDEX IF NOT EXISTS idx_company_index_normalized_name_trgm ON company_index USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_company_index_has_data ON company_index (has_data);
CREATE INDEX IF NOT EXISTS idx_company_index_ticker_prefix ON company_index (ticker text_pattern_ops);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_company_index_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_update_company_index_updated_at
  BEFORE UPDATE ON company_index
  FOR EACH ROW
  EXECUTE FUNCTION update_company_index_updated_at();
