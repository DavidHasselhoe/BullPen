-- A stock taken out of a watchlist list, with the dates it was in.
--
-- The watchlist scorecard ("your picks since you added them") counts removed
-- picks up to the day they left. Without this, removing a row is a hard delete
-- and a user who drops the losers gets a scorecard that only ever looks good.
--
-- Written by the app on remove (both DELETE routes), not by a trigger: a
-- trigger would also fire on the cascades from deleting a list or an account,
-- where an insert referencing the row being deleted fails.
-- Undo deletes the row again and restores the original added_at.

create table if not exists public.watchlist_removals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  list_id     uuid not null references public.watchlist_lists(id) on delete cascade,
  symbol      text not null,
  added_at    timestamptz not null,
  removed_at  timestamptz not null default now()
);

create index if not exists idx_watchlist_removals_list
  on public.watchlist_removals (list_id, symbol);

alter table public.watchlist_removals enable row level security;

create policy "Users read own watchlist removals"
  on public.watchlist_removals
  for select
  using (auth.uid() = user_id);
