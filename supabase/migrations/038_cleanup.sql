-- Cleanup Migration: Remove SEC ingestion pipeline tables
-- These tables were populated by the SEC/XBRL/AI ingestion pipeline
-- which is being replaced by direct TwelveData API calls.

DROP TABLE IF EXISTS financial_metrics CASCADE;
DROP TABLE IF EXISTS trends CASCADE;
DROP TABLE IF EXISTS ai_insights CASCADE;
DROP TABLE IF EXISTS signals CASCADE;
DROP TABLE IF EXISTS filing_sections CASCADE;
DROP TABLE IF EXISTS corporate_events CASCADE;
DROP TABLE IF EXISTS company_sankey_diagrams CASCADE;
DROP TABLE IF EXISTS company_revenue_segments CASCADE;
DROP TABLE IF EXISTS ai_extraction_cache CASCADE;
DROP TABLE IF EXISTS sec_document_embeddings CASCADE;
DROP TABLE IF EXISTS stock_splits CASCADE;
DROP TABLE IF EXISTS filings CASCADE;
