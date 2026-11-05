-- 189_import_replace_portfolio.sql
-- "Start from scratch" import mode: clear every MANUAL holding, lot, sale
-- and activity row, then rebuild the portfolio from the file.
--
-- The replay itself still runs through lib/import/execute-replay.ts (one
-- source of truth for weighted-average cost), so it can't share a single
-- transaction with the clear. Instead the clear stores what it removed on
-- the import row, and the restore puts it back. Each of those two steps is
-- one transaction, so a failed replay rolls back to exactly the portfolio
-- the user had, and the same restore is what Undo uses.
--
-- SnapTrade-synced holdings are never touched, nor are sales or activity
-- for a symbol the user holds through SnapTrade.

alter table public.holdings_imports add column if not exists replaced_snapshot jsonb;

comment on column public.holdings_imports.replaced_snapshot is
  'Set only by a whole-portfolio replace: the manual holdings, lots, sales and activity the import cleared, as JSON row arrays. import_restore_manual_portfolio puts them back on failure or undo.';

create or replace function public.import_clear_manual_portfolio(p_user_id uuid, p_import_id uuid)
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
    'holdings', coalesce((select jsonb_agg(to_jsonb(h)) from user_holdings h
                          where h.user_id = p_user_id and h.source = 'manual'), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(p)) from holding_purchases p
                           join user_holdings h on h.id = p.holding_id
                           where p.user_id = p_user_id and h.source = 'manual'), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(to_jsonb(s)) from holding_sales s
                       where s.user_id = p_user_id and not (s.symbol = any(v_synced))), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(to_jsonb(a)) from portfolio_activity a
                          where a.user_id = p_user_id and not (a.symbol = any(v_synced))), '[]'::jsonb)
  ) into v_snapshot;

  -- committed_at here is the start of the replay: the recent-import route
  -- uses it to spot a replay that died mid-way (function timeout) so the
  -- user can still restore from the banner.
  update holdings_imports
    set replaced_snapshot = v_snapshot, status = 'committing', committed_at = now()
    where id = p_import_id;

  delete from holding_sales where user_id = p_user_id and not (symbol = any(v_synced));
  delete from portfolio_activity where user_id = p_user_id and not (symbol = any(v_synced));
  delete from user_holdings where user_id = p_user_id and source = 'manual'; -- lots cascade

  return jsonb_build_object(
    'holdings', jsonb_array_length(v_snapshot->'holdings'),
    'sales', jsonb_array_length(v_snapshot->'sales')
  );
end;
$$;

-- p_reset_to_draft = true: the replay failed; roll back and hand the draft
-- back to the review grid so the user can fix it and save again.
-- p_reset_to_draft = false: Undo. Refuses (nothing changes) if the manual
-- portfolio holds anything this import didn't write, because restoring the
-- snapshot would delete it.
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
  v_synced text[];
  v_events integer;
begin
  select replaced_snapshot into v_snapshot from holdings_imports
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
    ) then
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

revoke execute on function public.import_clear_manual_portfolio(uuid, uuid) from public, anon, authenticated;
grant execute on function public.import_clear_manual_portfolio(uuid, uuid) to service_role;
revoke execute on function public.import_restore_manual_portfolio(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.import_restore_manual_portfolio(uuid, uuid, boolean) to service_role;
