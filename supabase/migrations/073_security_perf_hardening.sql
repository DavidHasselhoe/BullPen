-- 073_security_perf_hardening.sql
-- Addresses Supabase advisor findings (safe subset). Bigger items (auth RLS
-- initplan rewrites, multiple-permissive-policy consolidation, unused-index
-- pruning) are deferred to a dedicated reviewed pass.
--
--  1. SECURITY (ERROR): enable RLS on 5 exposed public reference tables, with a
--     read-only policy so existing reads keep working. Writes happen only via the
--     service-role client (crons/ingestion), which bypasses RLS.
--  2. PERF: add covering indexes for 5 unindexed foreign keys.
--  3. SECURITY (WARN): pin search_path on flagged functions; lock the new-user
--     trigger function from being called directly over the REST RPC API.

-- ── 1. RLS on exposed reference tables (read-only) ───────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'exchanges', 'exchange_holidays', 'company_index',
    'currency_exchange_rates', 'ticker_sectors'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "Public read" on public.%I;', t);
    execute format('create policy "Public read" on public.%I for select using (true);', t);
  end loop;
end $$;

-- ── 2. Covering indexes for unindexed foreign keys ───────────────────────────
create index if not exists idx_academy_user_course_progress_course_id
  on public.academy_user_course_progress (course_id);
create index if not exists idx_academy_user_course_progress_last_lesson_id
  on public.academy_user_course_progress (last_lesson_id);
create index if not exists idx_academy_user_daily_challenge_challenge_id
  on public.academy_user_daily_challenge (challenge_id);
create index if not exists idx_academy_user_lesson_progress_lesson_id
  on public.academy_user_lesson_progress (lesson_id);
create index if not exists idx_stock_thesis_replies_user_id
  on public.stock_thesis_replies (user_id);

-- ── 3. Pin function search_path (fixes role-mutable search_path) ──────────────
do $$
declare r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'update_updated_at_column', 'update_company_index_updated_at',
        'handle_new_user', 'get_hot_picks', 'get_exchange_rate',
        'update_embeddings_updated_at', 'match_document_embeddings',
        'get_screener_data', 'screener_active_rows'
      )
  loop
    execute format('alter function public.%I(%s) set search_path = public;', r.proname, r.args);
  end loop;
end $$;

-- ── 4. Lock the new-user trigger function from direct RPC execution ──────────
-- It runs from an auth trigger, never as a client RPC call. Functions grant
-- EXECUTE to PUBLIC by default, so revoke that too (not just anon/authenticated).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
