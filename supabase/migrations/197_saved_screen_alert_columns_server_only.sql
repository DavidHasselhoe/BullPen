-- 197_saved_screen_alert_columns_server_only.sql
-- Follow-up to 196. Its policies check ownership only, so a Free account could
-- turn alert_enabled on (or rewrite last_matches) straight through PostgREST,
-- around the Pro check in /api/screener/filter-presets. The app writes these
-- tables through the service role, so signed-in users keep direct writes to
-- the screen itself only; the alert columns are server-written.
revoke insert, update on public.screener_filter_presets from anon, authenticated;
grant insert (user_id, name, filters, position, scope) on public.screener_filter_presets to authenticated;
grant update (name, filters, position, scope, updated_at) on public.screener_filter_presets to authenticated;
