-- AI Extraction Cache
-- Purpose: Cache AI table extraction results by table fingerprint to avoid redundant LLM calls
-- This enables idempotency and cost control

CREATE TABLE ai_extraction_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_fingerprint VARCHAR(64) NOT NULL UNIQUE,
  ai_output TEXT NOT NULL,
  extracted_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version VARCHAR(50) NOT NULL DEFAULT 'gpt-4o',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_extraction_cache_fingerprint ON ai_extraction_cache(table_fingerprint);
CREATE INDEX idx_ai_extraction_cache_created ON ai_extraction_cache(created_at DESC);

COMMENT ON TABLE ai_extraction_cache IS 'Cache for AI table extraction results by table fingerprint (SHA256)';
COMMENT ON COLUMN ai_extraction_cache.table_fingerprint IS 'SHA256 hash of normalized table structure for deduplication';
COMMENT ON COLUMN ai_extraction_cache.ai_output IS 'Raw JSON output from AI model';
COMMENT ON COLUMN ai_extraction_cache.extracted_metrics IS 'Parsed and validated metrics array';

-- Auto-update updated_at
CREATE TRIGGER update_ai_extraction_cache_updated_at
  BEFORE UPDATE ON ai_extraction_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
