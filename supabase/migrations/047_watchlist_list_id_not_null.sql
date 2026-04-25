-- Enforce list_id is always set on watchlist items.
-- Safe to apply only after confirming: SELECT count(*) FROM user_watchlist WHERE list_id IS NULL = 0
ALTER TABLE public.user_watchlist ALTER COLUMN list_id SET NOT NULL;
