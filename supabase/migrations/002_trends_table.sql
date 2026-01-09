-- BullPen Trends Table Migration
-- Purpose: Store deterministic trend analysis from time-series financial metrics

-- =====================================================
-- TRENDS TABLE
-- =====================================================
-- Stores trend analysis results from financial metrics time-series
-- Trends are deterministic calculations based on metric values over time
CREATE TYPE trend_type AS ENUM (
  'sustained_growth',
  'sustained_decline',
  'acceleration',
  'deceleration',
  'volatility_increase',
  'divergence'
);

CREATE TYPE trend_direction AS ENUM ('positive', 'negative', 'neutral');

CREATE TABLE trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,
  trend_type trend_type NOT NULL,
  direction trend_direction NOT NULL,
  strength INTEGER NOT NULL CHECK (strength >= 0 AND strength <= 100),
  explanation TEXT NOT NULL,
  periods_analyzed INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one trend per (company, metric_type, trend_type) combination
  -- Update existing trend if it already exists for same combination
  CONSTRAINT unique_company_metric_trend UNIQUE (company_id, metric_type, trend_type)
);

CREATE INDEX idx_trends_company_id ON trends(company_id);
CREATE INDEX idx_trends_metric_type ON trends(metric_type);
CREATE INDEX idx_trends_trend_type ON trends(trend_type);
CREATE INDEX idx_trends_direction ON trends(direction);
CREATE INDEX idx_trends_strength ON trends(strength DESC);
CREATE INDEX idx_trends_created ON trends(created_at DESC);

COMMENT ON TABLE trends IS 'Deterministic trend analysis from time-series financial metrics';
COMMENT ON COLUMN trends.strength IS 'Trend strength from 0 (weak) to 100 (strong)';
COMMENT ON COLUMN trends.periods_analyzed IS 'Number of periods used in trend calculation';
COMMENT ON COLUMN trends.metadata IS 'Values, deltas, and calculations used to generate trend (for reproducibility)';
COMMENT ON COLUMN trends.explanation IS 'Concise one-sentence explanation of the trend';

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_trends_updated_at
  BEFORE UPDATE ON trends
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
