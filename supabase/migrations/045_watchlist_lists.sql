create table if not exists public.watchlist_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  color       text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.watchlist_lists enable row level security;

create policy "Users manage own watchlist lists"
  on public.watchlist_lists
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_watchlist_lists_user_id
  on public.watchlist_lists (user_id);

-- Add nullable FK to existing items (nullable during migration window)
alter table public.user_watchlist
  add column if not exists list_id uuid references public.watchlist_lists(id) on delete cascade;

create index if not exists idx_user_watchlist_list_id
  on public.user_watchlist (list_id);
