-- Form 8-K Support Migration
-- Purpose: Add support for Form 8-K filings as event-driven disclosures
-- Supports stock splits, earnings releases, and material corporate actions

-- =====================================================
-- FILINGS: Add 8-K specific fields
-- =====================================================
-- Add items array to store 8-K item numbers (e.g., ["2.02", "3.02"])
-- Add accepted_date to track when filing was accepted by SEC

ALTER TABLE filings
ADD COLUMN IF NOT EXISTS items TEXT[] DEFAULT '{}';

ALTER TABLE filings
ADD COLUMN IF NOT EXISTS accepted_date DATE;

-- Add index for querying by items
CREATE INDEX IF NOT EXISTS idx_filings_items ON filings USING GIN(items);

-- Add index for accepted_date
CREATE INDEX IF NOT EXISTS idx_filings_accepted_date ON filings(accepted_date DESC);

COMMENT ON COLUMN filings.items IS '8-K item numbers (e.g., ["2.02", "3.02", "8.01"])';
COMMENT ON COLUMN filings.accepted_date IS 'Date when filing was accepted by SEC (for 8-K filings)';

-- =====================================================
-- CORPORATE_EVENTS TABLE
-- =====================================================
-- Store non-metric corporate events from 8-K filings
-- Events include: stock splits, M&A, executive changes, etc.

CREATE TYPE corporate_event_type AS ENUM (
  'stock_split',
  'stock_dividend',
  'merger_acquisition',
  'executive_change',
  'delisting',
  'material_agreement',
  'other'
);

CREATE TABLE IF NOT EXISTS corporate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  filing_id UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  event_type corporate_event_type NOT NULL,
  event_date DATE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_corporate_events_company_id ON corporate_events(company_id);
CREATE INDEX idx_corporate_events_filing_id ON corporate_events(filing_id);
CREATE INDEX idx_corporate_events_event_type ON corporate_events(event_type);
CREATE INDEX idx_corporate_events_event_date ON corporate_events(event_date DESC);
CREATE INDEX idx_corporate_events_company_date ON corporate_events(company_id, event_date DESC);

COMMENT ON TABLE corporate_events IS 'Non-metric corporate events from 8-K filings (stock splits, M&A, executive changes, etc.)';
COMMENT ON COLUMN corporate_events.event_date IS 'Date when event occurred (may differ from filing_date)';
