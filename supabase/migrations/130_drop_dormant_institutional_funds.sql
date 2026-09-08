-- ---------------------------------------------------------------------------
-- Drop three funds seeded in migration 127 that no longer file 13F-HR under
-- the CIK we track, so their card was permanently stamped "Outdated" on
-- Discover and their detail page showed holdings years out of date.
--
-- Verified against SEC EDGAR (data.sec.gov/submissions) on 2026-09-08 --
-- in each case the CIK is correct for the named entity, it has simply
-- stopped filing:
--   scion-asset-mgmt   CIK 1649339  last 13F-HR 2025-11-03, period 2025-09-30
--   greenlight-capital CIK 1079114  last 13F-HR 2024-02-14, period 2023-12-31
--   appaloosa          CIK 1006438  last 13F-HR 2016-02-12, period 2015-12-31
--
-- Note on Appaloosa: the manager is still active, it re-registered as
-- "Appaloosa LP" under CIK 1656456 (filed period 2026-06-30 on 2026-08-14).
-- Re-adding it is a seed row with that CIK, not a code change -- 1006438 is
-- the retired entity and will never file again.
--
-- institutional_filings.investor_id and institutional_holdings.filing_id are
-- both ON DELETE CASCADE (migration 127), so this drops their filings and
-- holdings rows with them.
-- ---------------------------------------------------------------------------

DELETE FROM public.institutional_investors
WHERE slug IN ('scion-asset-mgmt', 'greenlight-capital', 'appaloosa');
