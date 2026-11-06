-- 194_holdings_imports_server_writes_only.sql
-- Defense in depth after 191. Every write to holdings_imports and
-- holdings_import_events goes through the server (service role): the parse,
-- commit and undo routes. The "Users manage own ..." policies still let a
-- signed-in user write their own rows straight through PostgREST, including
-- holdings_imports.replaced_snapshot (what Undo restores) and the journal
-- Undo walks. Nothing in the app needs that, so signed-in and anonymous
-- users keep read access only.
revoke insert, update, delete, truncate on public.holdings_imports from anon, authenticated;
revoke insert, update, delete, truncate on public.holdings_import_events from anon, authenticated;
