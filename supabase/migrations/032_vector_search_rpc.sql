-- Vector Search RPC Function
-- Enables efficient cosine similarity search on document embeddings

-- Function to match document embeddings by vector similarity
CREATE OR REPLACE FUNCTION match_document_embeddings(
  query_embedding vector(1536),
  company_id_param UUID,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  fiscal_year_param int DEFAULT NULL,
  fiscal_quarter_param int DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  filing_id UUID,
  section_id UUID,
  content_text TEXT,
  section_type TEXT,
  section_name TEXT,
  filing_type TEXT,
  fiscal_year INTEGER,
  fiscal_quarter INTEGER,
  period_end_date DATE,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.filing_id,
    e.section_id,
    e.content_text,
    e.section_type,
    e.section_name,
    e.filing_type,
    e.fiscal_year,
    e.fiscal_quarter,
    e.period_end_date,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM sec_document_embeddings e
  WHERE
    e.company_id = company_id_param
    AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
    AND (fiscal_year_param IS NULL OR e.fiscal_year = fiscal_year_param)
    AND (fiscal_quarter_param IS NULL OR e.fiscal_quarter = fiscal_quarter_param)
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_document_embeddings IS 'Performs cosine similarity search on document embeddings for a specific company, optionally filtered by fiscal period';
