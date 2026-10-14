-- "New since your last visit" for the Washington Trading panel of the user's
-- own stocks (YourStocksInWashington, /api/congress/overlap).
--
-- Two columns, not one: a visit is a run of panel loads with no 2-hour gap.
-- congress_overlap_seen_at slides forward on every load; when a load comes
-- after a gap, the old value moves to congress_overlap_since and becomes the
-- line between "new" and "seen" for the whole visit. With one column a reload
-- would wipe the markers a minute after they appeared.
--
-- Compared against congress_trades.created_at (when we ingested a trade),
-- not its disclosure date: a trade filed Sunday and ingested Tuesday is new to
-- someone who last looked on Monday.
--
-- Written by the API route with the service role only; no RLS change.

alter table public.users
  add column if not exists congress_overlap_seen_at timestamptz,
  add column if not exists congress_overlap_since timestamptz;
