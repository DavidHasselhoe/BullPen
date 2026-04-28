-- Idempotent backfill: every user with unscoped watchlist items gets a default "My Watchlist" list.
do $$ declare
  r   record;
  lid uuid;
begin
  for r in
    select distinct user_id from public.user_watchlist where list_id is null
  loop
    insert into public.watchlist_lists (user_id, name, position)
    values (r.user_id, 'My Watchlist', 0)
    on conflict (user_id, name) do nothing;

    select id into lid
    from public.watchlist_lists
    where user_id = r.user_id and name = 'My Watchlist';

    update public.user_watchlist
    set list_id = lid
    where user_id = r.user_id and list_id is null;
  end loop;
end $$;
