-- Performance indexes for BullPen
-- Derived from audit of all observed query patterns.
-- Safe to run multiple times (IF NOT EXISTS).

-- notifications: filtered by user_id + is_read, ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_date
  ON notifications(user_id, is_read, created_at DESC);

-- filings: filtered by company_id + processing_status, ordered by filing_date DESC
-- Covers getRecentFilings, getCompaniesToWatch, and status route queries
CREATE INDEX IF NOT EXISTS idx_filings_company_status_date
  ON filings(company_id, processing_status, filing_date DESC);

-- trends: filtered by company_id, ordered by strength DESC
-- Covers getRecentFundamentalChanges and getCompaniesToWatch
CREATE INDEX IF NOT EXISTS idx_trends_company_strength
  ON trends(company_id, strength DESC);

-- financial_metrics: filtered by company_id (status route COUNT query)
CREATE INDEX IF NOT EXISTS idx_financial_metrics_company
  ON financial_metrics(company_id);

-- user_holdings: filtered by user_id, ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_user_holdings_user_date
  ON user_holdings(user_id, created_at DESC);

-- company_index: ilike prefix search on normalized_ticker
-- varchar_pattern_ops enables B-tree prefix matching for ILIKE 'abc%'
CREATE INDEX IF NOT EXISTS idx_company_index_normalized_ticker
  ON company_index(normalized_ticker varchar_pattern_ops);

-- company_index: ilike contains search on normalized_name
-- varchar_pattern_ops helps for ILIKE '%abc%' only at prefix; for full contains
-- a GIN trigram index is more effective if pg_trgm is available
CREATE INDEX IF NOT EXISTS idx_company_index_normalized_name
  ON company_index(normalized_name varchar_pattern_ops);

-- ai_insights: filtered by filing_id (getRecentFilings insight count query)
CREATE INDEX IF NOT EXISTS idx_ai_insights_filing_id
  ON ai_insights(filing_id);
