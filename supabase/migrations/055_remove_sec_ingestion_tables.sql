-- Remove SEC ingestion pipeline tables
-- These are no longer populated since switching to TwelveData as primary data source.
-- financial_metrics, signals, trends, and ai_insights are retained as they contain
-- historical data still used by the compare tool and discover page.

DROP TABLE IF EXISTS filing_sections CASCADE;
DROP TABLE IF EXISTS filings CASCADE;
DROP TABLE IF EXISTS corporate_events CASCADE;

ALTER TABLE company_index DROP COLUMN IF EXISTS has_data;
ALTER TABLE company_index DROP COLUMN IF EXISTS last_ingested_at;
