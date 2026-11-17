-- Business descriptions from TwelveData /profile, kept apart from market_data_cache
-- so they outlive its ~60-day profile TTL. Read by the AI watchlist theme picker
-- (lib/watchlist/ai-picks.ts), filled by scripts/backfill-company-descriptions.ts
-- and on demand. Server-only: RLS on, no policies, service role reads and writes.
CREATE TABLE IF NOT EXISTS company_descriptions (
  ticker       TEXT PRIMARY KEY,
  description  TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE company_descriptions ENABLE ROW LEVEL SECURITY;
