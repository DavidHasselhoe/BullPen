-- Index membership history and index weights, written by the weekly index sync
-- (scripts/sync-index-constituents.ts -> POST /api/cron/record-index-changes).
--
-- The sync runs weekly, so detected_on is the day a change was SEEN, not the day
-- it took effect. Copy reads it as "in the week of" (lib/market-data/index-events.ts),
-- never as an exact date. History starts 2026-10-20; nothing before it is known.

CREATE TABLE IF NOT EXISTS index_membership_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker      TEXT NOT NULL,
  index_id    TEXT NOT NULL CHECK (index_id IN ('sp500', 'nasdaq100', 'dow30')),
  change      TEXT NOT NULL CHECK (change IN ('added', 'removed')),
  detected_on DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A rerun of the same week's sync is a no-op.
  UNIQUE (ticker, index_id, change, detected_on)
);

-- Each holding's weight in the fund that tracks the index (SPY for the S&P 500,
-- DIA for the Dow), as of the holdings file's own date. Replaced every sync.
CREATE TABLE IF NOT EXISTS index_weights (
  ticker     TEXT NOT NULL,
  index_id   TEXT NOT NULL CHECK (index_id IN ('sp500', 'nasdaq100', 'dow30')),
  weight_pct NUMERIC NOT NULL,
  as_of      DATE NOT NULL,
  PRIMARY KEY (ticker, index_id)
);

-- Server-only (service role); no client reads these directly.
ALTER TABLE index_membership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_weights ENABLE ROW LEVEL SECURITY;
