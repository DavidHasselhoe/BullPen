-- Screener statistics cache
-- Populated by /api/screener/refresh from TwelveData /statistics endpoint
-- Acts as the data layer for the stock screener; avoids repeated expensive API calls.

CREATE TABLE IF NOT EXISTS screener_stats (
  ticker              TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  sector              TEXT,
  industry            TEXT,
  logo_url            TEXT,
  exchange            TEXT,
  currency            TEXT DEFAULT 'USD',

  -- Valuation
  market_cap          BIGINT,
  pe_ratio            REAL,
  forward_pe          REAL,
  pb_ratio            REAL,
  ps_ratio            REAL,
  ev_to_ebitda        REAL,

  -- Growth & profitability
  eps_ttm             REAL,
  revenue_ttm         BIGINT,
  profit_margin       REAL,
  revenue_growth_yoy  REAL,
  earnings_growth_yoy REAL,

  -- Risk & income
  beta                REAL,
  dividend_yield      REAL,
  payout_ratio        REAL,

  -- Price
  week52_high         REAL,
  week52_low          REAL,
  day50_ma            REAL,
  day200_ma           REAL,

  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow all authenticated users to read; only the service-role key (backend) can write
ALTER TABLE screener_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'screener_stats' AND policyname = 'screener_stats_read'
  ) THEN
    CREATE POLICY "screener_stats_read" ON screener_stats
      FOR SELECT USING (true);
  END IF;
END $$;

-- Index for common filter patterns
CREATE INDEX IF NOT EXISTS screener_stats_sector_idx ON screener_stats (sector);
CREATE INDEX IF NOT EXISTS screener_stats_market_cap  ON screener_stats (market_cap DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS screener_stats_updated_at  ON screener_stats (updated_at);
