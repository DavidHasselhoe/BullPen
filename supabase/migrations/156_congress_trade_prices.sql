-- ---------------------------------------------------------------------------
-- Closing price on the trade date and on the disclosure date, per trade.
--
-- Disclosed Capitol has always sent these (price_on_trade_date,
-- price_on_disclosure) in the trades response we already pay for; they were
-- dropped at ingest. Together they answer the question a reader actually has:
-- how much had the stock already moved by the time the trade was public?
-- Example that prompted this: Pelosi bought BE at $166.84 on 2026-07-28; it
-- was disclosed 2026-08-21 at $201.45, +20.7% before anyone could know.
--
-- Both are real closes, never estimated. NULL when the vendor has none (it
-- has none for Trump's rows, since it never resolved their tickers).
-- ---------------------------------------------------------------------------

ALTER TABLE public.congress_trades
  ADD COLUMN IF NOT EXISTS price_at_trade      numeric,
  ADD COLUMN IF NOT EXISTS price_at_disclosure numeric;
