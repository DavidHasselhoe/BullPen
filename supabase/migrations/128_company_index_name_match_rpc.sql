-- 128_company_index_name_match_rpc.sql
-- Small RPC wrapping company_index's existing trigram index
-- (idx_company_index_normalized_name_trgm, 004_company_index_table.sql) for
-- fuzzy name matching -- used by lib/institutions/resolve-cusip.ts as the
-- free (no TwelveData credits) first-pass tier for resolving a 13F filing's
-- issuer name to a ticker, before falling back to a paid ISIN search.
-- Read-only, SECURITY INVOKER (default) is fine -- company_index is public
-- reference data with no RLS restrictions to bypass.

-- company_index.normalized_name is stored lowercase (verified live: 'chs
-- inc', 'truist financial corp' -- corporate suffixes are KEPT, not
-- stripped), so the query side must match that exact casing convention or
-- the trigram similarity score is needlessly diluted.
CREATE OR REPLACE FUNCTION public.match_company_index_by_name(query_name TEXT, min_similarity REAL DEFAULT 0.5)
RETURNS TABLE (ticker TEXT, name TEXT, similarity REAL)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ci.ticker, ci.name, similarity(ci.normalized_name, lower(query_name)) AS similarity
  FROM public.company_index ci
  -- The `%` operator uses pg_trgm's session-level similarity_threshold GUC
  -- (default 0.3) to pick candidates via the trigram index cheaply; the
  -- explicit similarity(...) >= min_similarity re-filters to the caller's
  -- actual requested threshold, which may be stricter than the GUC default.
  WHERE ci.normalized_name % lower(query_name)
    AND similarity(ci.normalized_name, lower(query_name)) >= min_similarity
  ORDER BY similarity DESC
  LIMIT 3;
$$;

REVOKE ALL ON FUNCTION public.match_company_index_by_name(TEXT, REAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_company_index_by_name(TEXT, REAL) TO service_role;
