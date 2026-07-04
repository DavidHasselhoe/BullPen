-- 075_consolidate_permissive_policies.sql
-- Perf: resolve the "Multiple Permissive Policies" advisor findings for SELECT.
-- Permissive policies for the same role+command are OR'd together and each is
-- evaluated per query, so collapsing them to one policy per command is faster.
--
-- Semantics are preserved exactly:
--  * ai_usage / user_holdings / users: two SELECT policies → one OR'd policy.
--  * stock_theses / stock_thesis_replies / user_follows: an ALL policy overlapped
--    a SELECT "readable by authenticated" policy. Split the ALL into explicit
--    INSERT/UPDATE/DELETE (owner-only) so SELECT is governed by a single policy;
--    reads for the owner still pass via the kept "readable by authenticated" one.
--
-- Ordering is create-new-then-drop-old, so SELECT access is never removed even
-- if a later statement were to fail.

-- ── ai_usage: own OR admin (single SELECT policy) ────────────────────────────
create policy "Read own or admin ai_usage" on public.ai_usage
  for select to public
  using (
    ((select auth.uid()) = user_id)
    or exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.role = 'admin'
    )
  );
drop policy "Admins read all ai_usage" on public.ai_usage;
drop policy "Users read own ai_usage" on public.ai_usage;

-- ── user_holdings: own OR any authenticated (single SELECT policy) ───────────
create policy "Read holdings" on public.user_holdings
  for select to public
  using (
    ((select auth.uid()) is not null)
    or ((select auth.uid()) = user_id)
  );
drop policy "Authenticated users can view public holdings" on public.user_holdings;
drop policy "Users can read own holdings" on public.user_holdings;

-- ── users: own OR any authenticated (single SELECT policy) ───────────────────
create policy "Read profiles" on public.users
  for select to public
  using (
    ((select auth.uid()) is not null)
    or ((select auth.uid()) = id)
  );
drop policy "Authenticated users can view public profiles" on public.users;
drop policy "Users can read own profile" on public.users;

-- ── stock_theses: split ALL → per-command write policies ─────────────────────
create policy "Insert own theses" on public.stock_theses
  for insert to public with check ((select auth.uid()) = user_id);
create policy "Update own theses" on public.stock_theses
  for update to public using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own theses" on public.stock_theses
  for delete to public using ((select auth.uid()) = user_id);
drop policy "Authors manage own theses" on public.stock_theses;

-- ── stock_thesis_replies: split ALL → per-command write policies ─────────────
create policy "Insert own replies" on public.stock_thesis_replies
  for insert to public with check ((select auth.uid()) = user_id);
create policy "Update own replies" on public.stock_thesis_replies
  for update to public using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own replies" on public.stock_thesis_replies
  for delete to public using ((select auth.uid()) = user_id);
drop policy "Authors manage own replies" on public.stock_thesis_replies;

-- ── user_follows: split ALL → per-command write policies ─────────────────────
create policy "Insert own follows" on public.user_follows
  for insert to public with check ((select auth.uid()) = follower_id);
create policy "Update own follows" on public.user_follows
  for update to public using ((select auth.uid()) = follower_id) with check ((select auth.uid()) = follower_id);
create policy "Delete own follows" on public.user_follows
  for delete to public using ((select auth.uid()) = follower_id);
drop policy "Users manage own follows" on public.user_follows;
