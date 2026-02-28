-- SEC Document Embeddings Table
-- Stores vector embeddings for semantic search of SEC filing content
-- Uses pgvector extension for similarity search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table
CREATE TABLE IF NOT EXISTS sec_document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  section_id UUID REFERENCES filing_sections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Embedding vector (1536 dimensions for OpenAI text-embedding-3-small)
  embedding vector(1536) NOT NULL,
  
  -- Source content metadata
  content_type TEXT NOT NULL CHECK (content_type IN ('filing_section', 'filing_full')),
  content_text TEXT NOT NULL, -- Original text that was embedded
  content_length INTEGER NOT NULL, -- Character count
  
  -- Section metadata (if from filing_sections)
  section_type TEXT, -- Matches filing_sections.section_type
  section_name TEXT, -- Matches filing_sections.section_name
  
  -- Filing metadata for filtering
  filing_type TEXT NOT NULL, -- 10-K, 10-Q, etc.
  period_end_date DATE, -- For filtering by fiscal period
  fiscal_year INTEGER,
  fiscal_quarter INTEGER,
  
  -- Embedding metadata
  model_name TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT check_section_or_filing CHECK (
    (section_id IS NOT NULL AND content_type = 'filing_section') OR
    (section_id IS NULL AND content_type = 'filing_full')
  )
);

-- Indexes for performance
CREATE INDEX idx_embeddings_filing_id ON sec_document_embeddings(filing_id);
CREATE INDEX idx_embeddings_company_id ON sec_document_embeddings(company_id);
CREATE INDEX idx_embeddings_section_id ON sec_document_embeddings(section_id);
CREATE INDEX idx_embeddings_content_type ON sec_document_embeddings(content_type);
CREATE INDEX idx_embeddings_period ON sec_document_embeddings(company_id, period_end_date DESC);
CREATE INDEX idx_embeddings_fiscal ON sec_document_embeddings(company_id, fiscal_year, fiscal_quarter);

-- Vector similarity search index (HNSW for fast approximate nearest neighbor)
CREATE INDEX idx_embeddings_vector ON sec_document_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_update_embeddings_updated_at
  BEFORE UPDATE ON sec_document_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_embeddings_updated_at();

COMMENT ON TABLE sec_document_embeddings IS 'Vector embeddings for semantic search of SEC filing content';
COMMENT ON COLUMN sec_document_embeddings.embedding IS '1536-dimensional vector embedding from OpenAI text-embedding-3-small';
COMMENT ON COLUMN sec_document_embeddings.content_type IS 'Whether embedding is from a filing section or full filing';
COMMENT ON COLUMN sec_document_embeddings.model_name IS 'Embedding model used (text-embedding-3-small, text-embedding-3-large, etc.)';
