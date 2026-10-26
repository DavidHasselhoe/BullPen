-- When the morning alert email last went to this account (lib/email/alert-email.ts).
-- The email now also goes out on days with only a watchlist update, which marks
-- no notification row, so this is what tells a returning reader from a first one
-- and keeps a retried run from sending the same morning twice.
alter table public.users add column if not exists alert_email_sent_at timestamptz;
