-- Add per-stock alert opt-out to watchlist and holdings.
-- Default true — all existing tracked stocks get smart alerts automatically.
-- Users can toggle individual stocks off from the watchlist/holdings UI.

ALTER TABLE public.user_watchlist
  ADD COLUMN IF NOT EXISTS alerts_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_holdings
  ADD COLUMN IF NOT EXISTS alerts_enabled BOOLEAN NOT NULL DEFAULT true;

-- Index for efficient cron queries: "give me all users + symbols that want alerts"
CREATE INDEX IF NOT EXISTS idx_watchlist_alerts_enabled
  ON public.user_watchlist (user_id, symbol)
  WHERE alerts_enabled = true;

CREATE INDEX IF NOT EXISTS idx_holdings_alerts_enabled
  ON public.user_holdings (user_id, symbol)
  WHERE alerts_enabled = true;
