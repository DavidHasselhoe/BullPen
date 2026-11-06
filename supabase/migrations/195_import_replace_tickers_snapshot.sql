-- 195_import_replace_tickers_snapshot.sql
-- "Replace these tickers" import mode deleted the user's manual holdings,
-- sales and activity in the imported tickers straight from the commit route,
-- with no copy kept, so Undo removed the imported trades but could never
-- bring back what the replace deleted (and a failed replay lost them).
--
-- The whole-portfolio clear/restore pair (189-191) now takes an optional
-- ticker list. With p_symbols, import_clear_manual_portfolio snapshots and
-- clears only those tickers and stores the list in the snapshot; the restore
-- reads it back and touches only those tickers. NULL keeps today's
-- whole-portfolio behavior. Same guards as 191: restored rows must belong to
-- the caller and holdings must be manual.

drop function if exists public.import_clear_manual_portfolio(uuid, uuid);

create or replace function public.import_clear_manual_portfolio(
  p_user_id uuid,
  p_import_id uuid,
  p_symbols text[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_synced text[];
  v_snapshot jsonb;
begin
  -- Claim the draft. A second Save from another tab waits on the lock, then
  -- finds it no longer a draft and clears nothing.
  perform 1 from holdings_imports
    where id = p_import_id and user_id = p_user_id and status = 'draft'
    for update;
  if not found then
    raise exception 'import_not_draft';
  end if;

  select coalesce(array_agg(distinct symbol), '{}') into v_synced
    from user_holdings where user_id = p_user_id and source <> 'manual';

  select jsonb_build_object(
    'symbols', to_jsonb(p_symbols),
    'holdings', coalesce((select jsonb_agg(to_jsonb(h)) from user_holdings h
                          where h.user_id = p_user_id and h.source = 'manual'
                            and (p_symbols is null or h.symbol = any(p_symbols))), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(p)) from holding_purchases p
                           join user_holdings h on h.id = p.holding_id
                           where p.user_id = p_user_id and h.source = 'manual'
                             and (p_symbols is null or h.symbol = any(p_symbols))), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(to_jsonb(s)) from holding_sales s
                       where s.user_id = p_user_id and not (s.symbol = any(v_synced))
                         and (p_symbols is null or s.symbol = any(p_symbols))), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(to_jsonb(a)) from portfolio_activity a
                          where a.user_id = p_user_id and not (a.symbol = any(v_synced))
                            and (p_symbols is null or a.symbol = any(p_symbols))), '[]'::jsonb)
  ) into v_snapshot;

  -- committed_at here is the start of the replay: the recent-import route
  -- uses it to spot a replay that died mid-way (function timeout) so the
  -- user can still restore from the banner.
  update holdings_imports
    set replaced_snapshot = v_snapshot, status = 'committing', committed_at = now()
    where id = p_import_id;

  delete from holding_sales where user_id = p_user_id and not (symbol = any(v_synced))
    and (p_symbols is null or symbol = any(p_symbols));
  delete from portfolio_activity where user_id = p_user_id and not (symbol = any(v_synced))
    and (p_symbols is null or symbol = any(p_symbols));
  delete from user_holdings where user_id = p_user_id and source = 'manual'
    and (p_symbols is null or symbol = any(p_symbols)); -- lots cascade

  return jsonb_build_object(
    'holdings', jsonb_array_length(v_snapshot->'holdings'),
    'sales', jsonb_array_length(v_snapshot->'sales')
  );
end;
$$;

create or replace function public.import_restore_manual_portfolio(
  p_user_id uuid,
  p_import_id uuid,
  p_reset_to_draft boolean
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_status text;
  v_committed_at timestamptz;
  v_synced text[];
  v_scope text[];
  v_events integer;
begin
  select replaced_snapshot, status, committed_at into v_snapshot, v_status, v_committed_at from holdings_imports
    where id = p_import_id and user_id = p_user_id
    for update;
  if v_snapshot is null then
    raise exception 'no_snapshot';
  end if;

  -- NULL = the whole manual portfolio (a "Start from scratch" import).
  if jsonb_typeof(v_snapshot->'symbols') = 'array' then
    v_scope := array(select jsonb_array_elements_text(v_snapshot->'symbols'));
  end if;

  select coalesce(array_agg(distinct symbol), '{}') into v_synced
    from user_holdings where user_id = p_user_id and source <> 'manual';

  select count(*) into v_events from holdings_import_events where import_id = p_import_id;

  if not p_reset_to_draft then
    if exists (
      select 1 from holding_purchases p
      join user_holdings h on h.id = p.holding_id
      where p.user_id = p_user_id and h.source = 'manual'
        and (v_scope is null or h.symbol = any(v_scope))
        and not exists (select 1 from holdings_import_events e
                        where e.import_id = p_import_id and e.entity_id = p.id)
    ) or exists (
      select 1 from holding_sales s
      where s.user_id = p_user_id and not (s.symbol = any(v_synced))
        and (v_scope is null or s.symbol = any(v_scope))
        and not exists (select 1 from holdings_import_events e
                        where e.import_id = p_import_id and e.entity_id = s.id)
    ) or (v_status = 'done' and v_committed_at is not null and (
      exists (
        select 1 from user_holdings h
        where h.user_id = p_user_id and h.source = 'manual'
          and (v_scope is null or h.symbol = any(v_scope))
          and greatest(h.created_at, h.updated_at) > v_committed_at + interval '1 minute'
      ) or exists (
        select 1 from portfolio_activity a
        where a.user_id = p_user_id and not (a.symbol = any(v_synced))
          and (v_scope is null or a.symbol = any(v_scope))
          and a.created_at > v_committed_at + interval '1 minute'
      )
    )) then
      raise exception 'changed_since_import';
    end if;
  end if;

  delete from holding_sales where user_id = p_user_id and not (symbol = any(v_synced))
    and (v_scope is null or symbol = any(v_scope));
  delete from portfolio_activity where user_id = p_user_id and not (symbol = any(v_synced))
    and (v_scope is null or symbol = any(v_scope));
  delete from user_holdings where user_id = p_user_id and source = 'manual'
    and (v_scope is null or symbol = any(v_scope));

  insert into user_holdings
    select * from jsonb_populate_recordset(null::user_holdings, v_snapshot->'holdings') r
    where r.user_id = p_user_id and r.source = 'manual'
      and (v_scope is null or r.symbol = any(v_scope));
  insert into holding_purchases
    select * from jsonb_populate_recordset(null::holding_purchases, v_snapshot->'purchases') r
    where r.user_id = p_user_id
      and r.holding_id in (select id from user_holdings where user_id = p_user_id and source = 'manual'
                             and (v_scope is null or symbol = any(v_scope)));
  insert into holding_sales
    select * from jsonb_populate_recordset(null::holding_sales, v_snapshot->'sales') r
    where r.user_id = p_user_id
      and (v_scope is null or r.symbol = any(v_scope))
      and (r.original_holding_id is null
           or r.original_holding_id in (select id from user_holdings where user_id = p_user_id));
  insert into portfolio_activity
    select * from jsonb_populate_recordset(null::portfolio_activity, v_snapshot->'activity') r
    where r.user_id = p_user_id
      and (v_scope is null or r.symbol = any(v_scope));

  delete from holdings_import_events where import_id = p_import_id;

  update holdings_imports
    set replaced_snapshot = null,
        applied_count = 0,
        status = case when p_reset_to_draft then 'draft' else 'undone' end,
        committed_at = case when p_reset_to_draft then null else committed_at end
    where id = p_import_id;

  return v_events;
end;
$$;

revoke execute on function public.import_clear_manual_portfolio(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.import_clear_manual_portfolio(uuid, uuid, text[]) to service_role;
revoke execute on function public.import_restore_manual_portfolio(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.import_restore_manual_portfolio(uuid, uuid, boolean) to service_role;
