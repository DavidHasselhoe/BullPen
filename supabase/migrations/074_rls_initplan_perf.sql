-- 074_rls_initplan_perf.sql
-- Performance: fix the Supabase "Auth RLS Initialization Plan" advisor findings.
--
-- Policies that call auth.uid() bare re-evaluate it once PER ROW. Wrapping it as
-- (select auth.uid()) lets Postgres evaluate it a single time per query (an
-- InitPlan), which is materially faster on large tables (holdings, alerts,
-- notifications, watchlist, etc.).
--
-- This uses ALTER POLICY, which changes ONLY the USING / WITH CHECK expressions
-- and preserves each policy's command, roles, and permissive/restrictive flag.
-- The wrap is idempotent: policies already wrapped are skipped. Every affected
-- policy here uses auth.uid() only (verified against pg_policies).

do $$
declare
  r record;
  q text;
  c text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '')       ~ 'auth\.(uid|jwt|role)\(\)' or
        coalesce(with_check, '') ~ 'auth\.(uid|jwt|role)\(\)'
      )
      -- skip anything already wrapped, so re-running is a no-op (case-insensitive:
      -- Postgres stores the wrapped form as "( SELECT auth.uid() ...)")
      and coalesce(qual, '') || coalesce(with_check, '') !~* '\(\s*select\s+auth\.'
  loop
    q := r.qual;
    c := r.with_check;
    if q is not null then
      q := regexp_replace(q, 'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
    end if;
    if c is not null then
      c := regexp_replace(c, 'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
    end if;

    if q is not null and c is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s);',
                     r.policyname, r.tablename, q, c);
    elsif q is not null then
      execute format('alter policy %I on public.%I using (%s);',
                     r.policyname, r.tablename, q);
    elsif c is not null then
      execute format('alter policy %I on public.%I with check (%s);',
                     r.policyname, r.tablename, c);
    end if;
  end loop;
end $$;
