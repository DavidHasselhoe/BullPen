-- Create company_revenue_segments table
-- Stores revenue breakdown by business segment per company per fiscal period
-- =====================================================

CREATE TABLE IF NOT EXISTS company_revenue_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  fiscal_period TEXT NOT NULL,              -- e.g. "Q2 2026" or "FY 2025"
  segment_type TEXT NOT NULL,               -- 'business' | 'product' | 'geography'
  segment_name TEXT NOT NULL,
  revenue_value NUMERIC(20, 4) NOT NULL,    -- Revenue in millions (matches XBRL format)
  source TEXT NOT NULL,                     -- 'filing_table' | 'filing_text' | 'ai_extracted'
  confidence TEXT NOT NULL,                 -- 'high' | 'medium' | 'low'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (symbol, fiscal_period, segment_name)
);

-- Indexes for fast lookups
CREATE INDEX idx_revenue_segments_symbol ON company_revenue_segments(symbol);
CREATE INDEX idx_revenue_segments_symbol_period ON company_revenue_segments(symbol, fiscal_period);
CREATE INDEX idx_revenue_segments_confidence ON company_revenue_segments(confidence);

-- Add constraints
ALTER TABLE company_revenue_segments
ADD CONSTRAINT revenue_segments_confidence_check
CHECK (confidence IN ('high', 'medium', 'low'));

ALTER TABLE company_revenue_segments
ADD CONSTRAINT revenue_segments_source_check
CHECK (source IN ('filing_table', 'filing_text', 'ai_extracted'));

ALTER TABLE company_revenue_segments
ADD CONSTRAINT revenue_segments_type_check
CHECK (segment_type IN ('business', 'product', 'geography'));

ALTER TABLE company_revenue_segments
ADD CONSTRAINT revenue_segments_value_positive
CHECK (revenue_value >= 0);

-- Comments
COMMENT ON TABLE company_revenue_segments IS 'Revenue breakdown by business segment per company per fiscal period';
COMMENT ON COLUMN company_revenue_segments.segment_type IS 'Type of segmentation: business (e.g. Data Center, Gaming), product (e.g. iPhone, Services), geography (e.g. Americas, EMEA)';
COMMENT ON COLUMN company_revenue_segments.source IS 'Data source: filing_table (XBRL tables), filing_text (structured text), ai_extracted (AI parsing)';
COMMENT ON COLUMN company_revenue_segments.confidence IS 'Confidence level: high (XBRL tables), medium (structured text), low (AI extraction)';
