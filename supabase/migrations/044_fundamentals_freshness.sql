-- Migration 044: Add fundamentals freshness tracking columns to companies
--
-- These columns enable the smart cache-invalidation system that uses
-- TwelveData's /fundamentals/last_changes endpoint (1 credit) to check
-- whether fundamental data has actually changed before spending 50–100
-- credits on a full re-fetch.
--
-- fundamentals_last_change: the most recent last_change date we've seen
--   from TwelveData across all data types (profile, statistics, income, etc.)
-- fundamentals_checked_at: when we last called the last_changes endpoint
--   for this company (used to throttle: max 1 check per hour per company)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS fundamentals_last_change DATE,
  ADD COLUMN IF NOT EXISTS fundamentals_checked_at TIMESTAMPTZ;

-- Index for the batch-refresh admin route to efficiently find companies
-- that haven't been checked recently
CREATE INDEX IF NOT EXISTS idx_companies_fundamentals_checked_at
  ON companies (fundamentals_checked_at ASC NULLS FIRST);
