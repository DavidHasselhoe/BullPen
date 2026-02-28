-- Create company_sankey_diagrams table
-- Stores cached Sankey diagram data per company per fiscal period
-- =====================================================

CREATE TABLE IF NOT EXISTS company_sankey_diagrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  fiscal_period TEXT NOT NULL,              -- e.g. "Q2 2026" or "FY 2025"
  data JSONB NOT NULL,                       -- Sankey nodes + links structure
  confidence TEXT NOT NULL,                  -- 'high' | 'medium' | 'low'
  source TEXT NOT NULL,                       -- 'xbrl' | 'xbrl+ai'
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (symbol, fiscal_period)
);

-- Indexes for fast lookups
CREATE INDEX idx_sankey_symbol ON company_sankey_diagrams(symbol);
CREATE INDEX idx_sankey_symbol_period ON company_sankey_diagrams(symbol, fiscal_period);
CREATE INDEX idx_sankey_generated_at ON company_sankey_diagrams(generated_at DESC);

-- Add constraint for confidence values
ALTER TABLE company_sankey_diagrams
ADD CONSTRAINT sankey_confidence_check
CHECK (confidence IN ('high', 'medium', 'low'));

-- Add constraint for source values
ALTER TABLE company_sankey_diagrams
ADD CONSTRAINT sankey_source_check
CHECK (source IN ('xbrl', 'xbrl+ai'));

-- Comments
COMMENT ON TABLE company_sankey_diagrams IS 'Cached Sankey diagram data showing revenue flow to costs and profit per company per fiscal period';
COMMENT ON COLUMN company_sankey_diagrams.data IS 'JSON structure with nodes and links for D3.js Sankey visualization';
COMMENT ON COLUMN company_sankey_diagrams.confidence IS 'Confidence level: high (XBRL only), medium (XBRL + validated AI), low (fallback)';
COMMENT ON COLUMN company_sankey_diagrams.source IS 'Data source: xbrl (deterministic) or xbrl+ai (with AI segmentation)';
