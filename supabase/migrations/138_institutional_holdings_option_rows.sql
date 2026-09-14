-- ---------------------------------------------------------------------------
-- Options get their own holdings row.
--
-- A 13F reports a put or call under the CUSIP of the stock it covers. The
-- parser summed rows by CUSIP and migration 129 made (filing_id, cusip)
-- unique, so a fund's puts on a stock were stored as more of that stock. In
-- the latest filings, options were 54% of Citadel's reported value.
--
-- Rows are now keyed by (cusip, put_call). NULLS NOT DISTINCT (Postgres 15+)
-- keeps exactly one shares row per cusip per filing, as 129 intended.
--
-- Filings already stored stay merged until re-parsed:
--   npx tsx scripts/backfill-institution-filings.ts --reingest
-- ---------------------------------------------------------------------------

ALTER TABLE public.institutional_holdings
  DROP CONSTRAINT institutional_holdings_filing_cusip_unique;

ALTER TABLE public.institutional_holdings
  ADD CONSTRAINT institutional_holdings_filing_cusip_put_call_unique
  UNIQUE NULLS NOT DISTINCT (filing_id, cusip, put_call);

-- The parser now writes 'PUT' / 'CALL'; older rows kept the filer's casing.
UPDATE public.institutional_holdings
SET put_call = UPPER(put_call)
WHERE put_call IS NOT NULL AND put_call <> UPPER(put_call);
