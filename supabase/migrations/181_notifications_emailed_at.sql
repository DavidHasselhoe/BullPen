-- Morning alert email (app/api/cron/send-alert-email): marks the notifications
-- a user has already been emailed, so an alert is never sent twice and the
-- first email can say "this is new". Additive and nullable: safe for main.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

COMMENT ON COLUMN public.notifications.emailed_at IS
  'When this notification went out in the morning alert email. NULL = not emailed.';
