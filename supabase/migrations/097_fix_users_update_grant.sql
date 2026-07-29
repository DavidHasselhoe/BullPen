-- 097_fix_users_update_grant.sql
-- Corrects 096_security_hardening.sql: `REVOKE UPDATE (role, account_tier, ...)
-- FROM authenticated` had no effect, because Supabase grants UPDATE at the
-- TABLE level by default (`GRANT ALL ON ALL TABLES IN SCHEMA public TO
-- authenticated`), and Postgres does not let a column-level REVOKE narrow a
-- table-level grant — the table-level grant already covers every column
-- regardless of column-level entries. Confirmed via
-- information_schema.column_privileges after applying 096: `authenticated`
-- still had UPDATE on role/account_tier/stripe_*.
--
-- The only way to actually restrict which columns a role can UPDATE is to
-- remove the table-level grant entirely and re-grant UPDATE only on the
-- specific columns that should be writable — every column except
-- role/account_tier/stripe_customer_id/stripe_subscription_id/stripe_status,
-- which are only ever legitimately written by the service-role client
-- (webhook, admin scripts) and must never be reachable by a user's own
-- session, however the row-level RLS check is satisfied.

REVOKE UPDATE ON public.users FROM authenticated;

GRANT UPDATE (
  email, username, full_name, avatar_url, created_at, updated_at,
  last_login_at, bio, experience_level, market_focus, risk_profile, settings
) ON public.users TO authenticated;
