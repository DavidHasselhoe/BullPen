-- 118_holdings_mic_code.sql
-- Adds exchange disambiguation to user_holdings. Confirmed live: a bare
-- symbol is genuinely ambiguous across exchanges (TwelveData's /quote for a
-- bare "NOKIA" returns the Prague listing in CZK, not Helsinki in EUR; bare
-- "KOG" returns The Kroger Co. in EUR, not Kongsberg Gruppen). The AI
-- transaction importer (lib/import/resolve-security.ts) already resolves
-- and verifies a specific mic_code + exchange per security — without a
-- column to persist that, every later quote re-fetch has to guess again
-- and can silently drift to a different listing than the one that was
-- actually verified at import time.

ALTER TABLE public.user_holdings
  ADD COLUMN IF NOT EXISTS mic_code TEXT,
  ADD COLUMN IF NOT EXISTS exchange TEXT;

COMMENT ON COLUMN public.user_holdings.mic_code IS
  'ISO 10383 market identifier code for the specific listing this holding was resolved to (e.g. XNGS, XSTU). NULL = no specific listing pinned; quote fetches fall back to a bare-symbol lookup, which is ambiguous for some non-US names.';
COMMENT ON COLUMN public.user_holdings.exchange IS
  'Human-readable exchange name paired with mic_code (e.g. "NASDAQ", "Stuttgart"), for display only — mic_code is the value actually sent back to TwelveData.';
