-- 079_lockdown_public_rls.sql
-- Security advisor cleanup: remove RLS/storage policies that grant public
-- write/list access nothing in the app actually relies on.
--
-- Verified before writing this migration (see session notes):
--  * search_metrics: no app code reads or writes it anymore (superseded by
--    stock_page_visits, migration 040). Fully orphaned — safe to lock down.
--  * stock_page_visits: only written via /api/stock/[ticker]/visit, which
--    uses the service-role client (bypasses RLS regardless of policy) and is
--    rate-limited at the app layer. The public INSERT/SELECT policies added
--    no capability the app needs, while letting anyone with the anon key
--    flood the table directly via PostgREST, or read every user_id + ticker +
--    timestamp (a browsing-history privacy leak — get_hot_picks is
--    SECURITY DEFINER and only returns aggregated ticker/count, so it never
--    needed the underlying table to be publicly SELECT-able).
--  * company-logos / user-avatars storage: public buckets serve object bytes
--    via the public URL endpoint without consulting storage.objects RLS, so
--    the broad SELECT policies here only enabled `.list()`-based enumeration
--    (all logos / all avatar filenames). The one place the app calls
--    `.list()` on these buckets (lib/logos/logos-storage.ts,
--    scripts/clear-logo-bucket.ts) uses the service-role client, which
--    bypasses RLS entirely. Dropping the policies removes enumeration with
--    zero functional impact.

-- ── search_metrics: orphaned table, deny public write + read ────────────────
drop policy if exists "Anyone can insert search metrics" on public.search_metrics;
drop policy if exists "Anyone can read search metrics" on public.search_metrics;

-- ── stock_page_visits: writes/reads only happen via service role ────────────
drop policy if exists "Anyone can insert stock page visits" on public.stock_page_visits;
drop policy if exists "Anyone can read stock page visits" on public.stock_page_visits;

-- ── storage: stop public listing on public-read buckets ─────────────────────
drop policy if exists "Allow public reads 1y3lpeg_0" on storage.objects;
drop policy if exists "Public avatar reads" on storage.objects;

-- ── get_hot_picks: defensive clamp on client-supplied limit_count ───────────
-- Not a live vulnerability (grouped by ticker, so result size is bounded by
-- ticker cardinality, not row count) but pins the public RPC to a sane cap.
create or replace function public.get_hot_picks(
  time_period_hours integer default 168,
  limit_count integer default 10
)
returns table (ticker text, click_count bigint, last_clicked_at timestamptz)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  week_start timestamptz;
begin
  week_start := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';

  return query
  select
    v.ticker,
    count(*)::bigint as click_count,
    max(v.visited_at) as last_clicked_at
  from public.stock_page_visits v
  where v.visited_at >= week_start
  group by v.ticker
  order by click_count desc, last_clicked_at desc
  limit least(greatest(limit_count, 1), 100);
end;
$$;
