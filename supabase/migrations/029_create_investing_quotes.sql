-- Create investing_quotes table
-- Stores inspirational investing quotes for display on the main page
-- =====================================================

CREATE TABLE IF NOT EXISTS investing_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_text TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT,                    -- 'risk', 'patience', 'market_behavior', 'value_investing', 'strategy', etc.
  source_url TEXT,                  -- URL where quote was found
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for random selection
CREATE INDEX idx_investing_quotes_category ON investing_quotes(category);

-- Add RLS policy (public read access)
ALTER TABLE investing_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to investing quotes" ON investing_quotes
  FOR SELECT USING (true);

-- Comments
COMMENT ON TABLE investing_quotes IS 'Inspirational investing quotes for display on the main page';
COMMENT ON COLUMN investing_quotes.category IS 'Quote category: risk, patience, market_behavior, value_investing, strategy, wealth_building';
