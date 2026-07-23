-- 090_notifications_realtime.sql
-- Enables Supabase Realtime replication for the `notifications` table.
--
-- hooks/use-notifications.ts has subscribed to postgres_changes INSERT events
-- on this table since it was introduced, with a comment promising the unread
-- badge updates "within ~1s" of a server-side insert. That subscription has
-- never actually fired: the table was never added to the supabase_realtime
-- publication, so every insert silently fell back to the 5-minute poll. This
-- also blocks the new "your Deep Dive/Portfolio Build is ready" toast
-- (NotificationToastListener), which depends on the same live subscription to
-- surface a notification the moment it's created, not just on next page load.

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
