-- Structured data for notifications the client words itself.
--
-- title and message are written once, in English, by the producer. A row that
-- also carries params is rendered from i18n keys in the reader's language,
-- with the stored text as the fallback for older rows and older builds.
-- First user: the earnings-today digest, which stores which tickers the user
-- owns and which they only watch.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS params jsonb;
