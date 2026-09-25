-- Supabase advisor auth_rls_initplan on migration 153's policy: a bare
-- auth.uid() is re-evaluated per row; wrapped in a scalar subquery it is
-- evaluated once per statement. Same fix the other user_* tables already have.

ALTER POLICY "Users manage own politician follows"
  ON public.user_politician_follows
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
