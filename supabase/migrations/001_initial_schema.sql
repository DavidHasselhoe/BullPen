-- BullPen Initial Schema Migration
-- Purpose: Core tables for SEC filings analysis platform

-- =====================================================
-- COMPANIES TABLE
-- =====================================================
-- Stores public company information
-- ticker: Primary trading symbol (e.g., AAPL)
-- cik: SEC Central Index Key (unique company identifier)
-- sector/industry: For filtering and analysis
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  cik VARCHAR(10) NOT NULL UNIQUE,
  sector VARCHAR(100),
  industry VARCHAR(100),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_ticker ON companies(ticker);
CREATE INDEX idx_companies_cik ON companies(cik);
CREATE INDEX idx_companies_sector ON companies(sector);

COMMENT ON TABLE companies IS 'Public companies tracked in BullPen';
COMMENT ON COLUMN companies.cik IS 'SEC Central Index Key - unique identifier for company filings';
COMMENT ON COLUMN companies.metadata IS 'Flexible storage for market cap, founding date, headquarters, etc.';

-- =====================================================
-- FILINGS TABLE
-- =====================================================
-- Stores SEC filing documents (10-K, 10-Q, 8-K)
-- accession_number: Unique SEC filing identifier
-- filing_type: Type of filing (10-K, 10-Q, 8-K)
-- processing_status: Tracks ingestion pipeline progress
CREATE TYPE filing_type AS ENUM ('10-K', '10-Q', '8-K', 'S-1', 'DEF 14A', 'OTHER');
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  filing_type filing_type NOT NULL,
  accession_number VARCHAR(20) NOT NULL UNIQUE,
  filing_date DATE NOT NULL,
  period_end_date DATE,
  fiscal_year INTEGER,
  fiscal_quarter INTEGER,
  source_url TEXT NOT NULL,
  document_url TEXT,
  processing_status processing_status NOT NULL DEFAULT 'pending',
  processing_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_filings_company_id ON filings(company_id);
CREATE INDEX idx_filings_accession_number ON filings(accession_number);
CREATE INDEX idx_filings_filing_date ON filings(filing_date DESC);
CREATE INDEX idx_filings_type ON filings(filing_type);
CREATE INDEX idx_filings_status ON filings(processing_status);
CREATE INDEX idx_filings_company_date ON filings(company_id, filing_date DESC);

COMMENT ON TABLE filings IS 'SEC filing documents ingested from EDGAR';
COMMENT ON COLUMN filings.accession_number IS 'Unique SEC filing identifier (e.g., 0000320193-23-000077)';
COMMENT ON COLUMN filings.period_end_date IS 'End date of reporting period covered by filing';
COMMENT ON COLUMN filings.processing_status IS 'Tracks progress through ingestion and analysis pipeline';

-- =====================================================
-- FILING_SECTIONS TABLE
-- =====================================================
-- Stores parsed sections from SEC filings
-- section_type: Standardized section names (MD&A, Risk Factors, etc.)
-- content: Raw text content of the section
-- Used for targeted AI analysis of specific filing sections
CREATE TYPE section_type AS ENUM (
  'business_overview',
  'risk_factors',
  'legal_proceedings',
  'management_discussion_analysis',
  'financial_statements',
  'notes_to_financials',
  'controls_procedures',
  'other'
);

CREATE TABLE filing_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  section_type section_type NOT NULL,
  section_name VARCHAR(255),
  content TEXT NOT NULL,
  content_length INTEGER NOT NULL,
  section_order INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_filing_sections_filing_id ON filing_sections(filing_id);
CREATE INDEX idx_filing_sections_type ON filing_sections(section_type);
CREATE INDEX idx_filing_sections_order ON filing_sections(filing_id, section_order);

COMMENT ON TABLE filing_sections IS 'Parsed sections extracted from SEC filings for targeted analysis';
COMMENT ON COLUMN filing_sections.content_length IS 'Character count for processing estimation';
COMMENT ON COLUMN filing_sections.section_order IS 'Original order in filing document';

-- =====================================================
-- FINANCIAL_METRICS TABLE
-- =====================================================
-- Stores structured financial data extracted from filings
-- Normalized table for time-series financial analysis
-- metric_type: Standardized metric names (revenue, net_income, etc.)
-- value: Numeric value with unit specification
CREATE TYPE metric_type AS ENUM (
  'revenue',
  'cost_of_revenue',
  'gross_profit',
  'operating_income',
  'net_income',
  'eps_basic',
  'eps_diluted',
  'total_assets',
  'total_liabilities',
  'shareholders_equity',
  'operating_cash_flow',
  'free_cash_flow',
  'shares_outstanding',
  'other'
);

CREATE TYPE period_type AS ENUM ('annual', 'quarterly', 'ttm', 'ytd');

CREATE TABLE financial_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metric_type metric_type NOT NULL,
  value NUMERIC(20, 4) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'USD',
  period_type period_type NOT NULL,
  period_start_date DATE,
  period_end_date DATE NOT NULL,
  is_restated BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(filing_id, metric_type, period_end_date)
);

CREATE INDEX idx_financial_metrics_company_id ON financial_metrics(company_id);
CREATE INDEX idx_financial_metrics_filing_id ON financial_metrics(filing_id);
CREATE INDEX idx_financial_metrics_type ON financial_metrics(metric_type);
CREATE INDEX idx_financial_metrics_period ON financial_metrics(period_end_date DESC);
CREATE INDEX idx_financial_metrics_company_metric ON financial_metrics(company_id, metric_type, period_end_date DESC);

COMMENT ON TABLE financial_metrics IS 'Structured financial data extracted from filings';
COMMENT ON COLUMN financial_metrics.value IS 'Numeric value (e.g., 123450000.00 for $123.45M)';
COMMENT ON COLUMN financial_metrics.unit IS 'Currency or unit (USD, EUR, shares, etc.)';
COMMENT ON COLUMN financial_metrics.is_restated IS 'TRUE if metric was restated in a later filing';

-- =====================================================
-- AI_INSIGHTS TABLE
-- =====================================================
-- Stores AI-generated summaries, sentiment, and analysis
-- Deterministic and auditable with model versioning
-- insight_type: Category of AI-generated insight
-- content: Structured JSON output from AI models
CREATE TYPE insight_type AS ENUM (
  'executive_summary',
  'risk_analysis',
  'sentiment_analysis',
  'key_changes',
  'competitive_analysis',
  'guidance_extraction',
  'other'
);

CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  section_id UUID REFERENCES filing_sections(id) ON DELETE CASCADE,
  insight_type insight_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  summary TEXT,
  confidence_score NUMERIC(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  model_version VARCHAR(50) NOT NULL,
  model_parameters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_insights_filing_id ON ai_insights(filing_id);
CREATE INDEX idx_ai_insights_company_id ON ai_insights(company_id);
CREATE INDEX idx_ai_insights_section_id ON ai_insights(section_id);
CREATE INDEX idx_ai_insights_type ON ai_insights(insight_type);
CREATE INDEX idx_ai_insights_created ON ai_insights(created_at DESC);

COMMENT ON TABLE ai_insights IS 'AI-generated summaries and analysis of filings';
COMMENT ON COLUMN ai_insights.content IS 'Structured JSON output from AI models';
COMMENT ON COLUMN ai_insights.model_version IS 'AI model identifier for auditability (e.g., gpt-4-turbo-2024-04-09)';
COMMENT ON COLUMN ai_insights.confidence_score IS 'Model confidence between 0 and 1';

-- =====================================================
-- SIGNALS TABLE
-- =====================================================
-- Trading and analytical signals derived from filings and AI insights
-- direction: Bullish, bearish, or neutral market signal
-- strength: Normalized 0-100 signal strength score
-- expires_at: When signal is no longer relevant
CREATE TYPE signal_direction AS ENUM ('bullish', 'bearish', 'neutral');
CREATE TYPE signal_type AS ENUM (
  'earnings_surprise',
  'guidance_change',
  'risk_alert',
  'unusual_disclosure',
  'management_change',
  'legal_event',
  'competitive_threat',
  'growth_opportunity',
  'other'
);

CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  filing_id UUID REFERENCES filings(id) ON DELETE SET NULL,
  signal_type signal_type NOT NULL,
  direction signal_direction NOT NULL,
  strength INTEGER NOT NULL CHECK (strength >= 0 AND strength <= 100),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signals_company_id ON signals(company_id);
CREATE INDEX idx_signals_filing_id ON signals(filing_id);
CREATE INDEX idx_signals_type ON signals(signal_type);
CREATE INDEX idx_signals_direction ON signals(direction);
CREATE INDEX idx_signals_active ON signals(is_active, expires_at);
CREATE INDEX idx_signals_created ON signals(created_at DESC);
CREATE INDEX idx_signals_strength ON signals(strength DESC);

COMMENT ON TABLE signals IS 'Trading and analytical signals derived from SEC filings';
COMMENT ON COLUMN signals.strength IS 'Signal strength from 0 (weak) to 100 (strong)';
COMMENT ON COLUMN signals.evidence IS 'Structured data backing the signal (filing excerpts, metrics, etc.)';
COMMENT ON COLUMN signals.expires_at IS 'When signal becomes stale (NULL = no expiration)';

-- =====================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =====================================================
-- Automatically update updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_filings_updated_at BEFORE UPDATE ON filings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_filing_sections_updated_at BEFORE UPDATE ON filing_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_financial_metrics_updated_at BEFORE UPDATE ON financial_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_insights_updated_at BEFORE UPDATE ON ai_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signals_updated_at BEFORE UPDATE ON signals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) PLACEHOLDER
-- =====================================================
-- Enable RLS on all tables (policies to be defined based on auth requirements)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE filing_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

-- Example policy: Allow public read access (adjust based on your auth model)
-- CREATE POLICY "Allow public read access" ON companies FOR SELECT USING (true);
-- CREATE POLICY "Allow public read access" ON filings FOR SELECT USING (true);
-- etc.

-- For authenticated write access, you might use:
-- CREATE POLICY "Allow authenticated users to insert" ON filings FOR INSERT 
--   TO authenticated WITH CHECK (true);
