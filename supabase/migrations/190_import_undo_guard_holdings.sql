-- 190_import_undo_guard_holdings.sql
-- Undo of a whole-portfolio replace (migration 189) refused only when a lot
-- or sale existed that the import didn't write. A holding added or edited
-- afterwards without a lot (no avg price, a quantity edit) or new activity
-- passed that check and was silently deleted by the restore. For a finished
-- import, anything in the manual portfolio touched after it finished now
-- blocks Undo too. The minute of grace covers app-vs-database clock drift
-- (committed_at is written by the app, row defaults by the database).
-- Failed or stuck imports keep the lot/sale check alone: their committed_at
-- is the start of the replay, so the import's own writes come after it.

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
  v_events integer;
begin
  select replaced_snapshot, status, committed_at into v_snapshot, v_status, v_committed_at from holdings_imports
    where id = p_import_id and user_id = p_user_id
    for update;
  if v_snapshot is null then
    raise exception 'no_snapshot';
  end if;

  select coalesce(array_agg(distinct symbol), '{}') into v_synced
    from user_holdings where user_id = p_user_id and source <> 'manual';

  select count(*) into v_events from holdings_import_events where import_id = p_import_id;

  if not p_reset_to_draft then
    if exists (
      select 1 from holding_purchases p
      join user_holdings h on h.id = p.holding_id
      where p.user_id = p_user_id and h.source = 'manual'
        and not exists (select 1 from holdings_import_events e
                        where e.import_id = p_import_id and e.entity_id = p.id)
    ) or exists (
      select 1 from holding_sales s
      where s.user_id = p_user_id and not (s.symbol = any(v_synced))
        and not exists (select 1 from holdings_import_events e
                        where e.import_id = p_import_id and e.entity_id = s.id)
    ) or (v_status = 'done' and v_committed_at is not null and (
      exists (
        select 1 from user_holdings h
        where h.user_id = p_user_id and h.source = 'manual'
          and greatest(h.created_at, h.updated_at) > v_committed_at + interval '1 minute'
      ) or exists (
        select 1 from portfolio_activity a
        where a.user_id = p_user_id and not (a.symbol = any(v_synced))
          and a.created_at > v_committed_at + interval '1 minute'
      )
    )) then
      raise exception 'changed_since_import';
    end if;
  end if;

  delete from holding_sales where user_id = p_user_id and not (symbol = any(v_synced));
  delete from portfolio_activity where user_id = p_user_id and not (symbol = any(v_synced));
  delete from user_holdings where user_id = p_user_id and source = 'manual';

  insert into user_holdings
    select * from jsonb_populate_recordset(null::user_holdings, v_snapshot->'holdings');
  insert into holding_purchases
    select * from jsonb_populate_recordset(null::holding_purchases, v_snapshot->'purchases');
  insert into holding_sales
    select * from jsonb_populate_recordset(null::holding_sales, v_snapshot->'sales');
  insert into portfolio_activity
    select * from jsonb_populate_recordset(null::portfolio_activity, v_snapshot->'activity');

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

-- create or replace keeps 189's grants (service_role only); restated so this file stands alone.
revoke execute on function public.import_restore_manual_portfolio(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.import_restore_manual_portfolio(uuid, uuid, boolean) to service_role;
