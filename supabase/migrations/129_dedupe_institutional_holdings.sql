-- Fix a data-integrity bug found while polishing the institutional holdings UI:
-- citadel-advisors' filing had every one of its 7166 holdings rows duplicated
-- (14332 actual rows, all exact duplicates) — total_positions on the filing
-- row was still correct (computed once from a correctly-aggregated `resolved`
-- array in the same ingestion run), but the insert itself landed twice.
--
-- parseInfoTable() already aggregates by CUSIP within a filing (see
-- lib/institutions/parse-13f-xml.ts), so a single correct ingestion run can
-- never produce more than one row per (filing_id, cusip). The only way to get
-- two is two overlapping executions of syncFund() for the same filing_id —
-- e.g. the weekly cron and a manual `?slug=` rerun (see
-- app/api/cron/sync-institutional-holdings/route.ts) racing on the
-- delete-then-insert step: both DELETEs can complete before either INSERT,
-- so neither insert clears the other's rows.
--
-- Dedupe the existing data, then add a unique constraint so this fails loudly
-- (an insert error, caught and marked parse_failed — retryable next run)
-- instead of silently duplicating every dollar figure shown to users.

DELETE FROM public.institutional_holdings h
USING (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY filing_id, cusip ORDER BY id) AS rn
  FROM public.institutional_holdings
) dupes
WHERE h.id = dupes.id AND dupes.rn > 1;

ALTER TABLE public.institutional_holdings
  ADD CONSTRAINT institutional_holdings_filing_cusip_unique UNIQUE (filing_id, cusip);
