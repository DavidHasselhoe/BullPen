-- Opt-in sharing of one watchlist list as a read-only public page,
-- /lists/<share_token>. Null means not shared; turning sharing off clears the
-- token, so an old link stops working rather than coming back on re-share.
--
-- The public page reads with the service role (no auth.uid() for a visitor),
-- so no anonymous RLS policy is added: the owner policy from migration 045
-- still covers every client read and write.

alter table public.watchlist_lists
  add column if not exists share_token text,
  add column if not exists shared_at timestamptz;

create unique index if not exists idx_watchlist_lists_share_token
  on public.watchlist_lists (share_token)
  where share_token is not null;
