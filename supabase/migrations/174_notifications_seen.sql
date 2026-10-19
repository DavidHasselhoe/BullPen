-- Seen vs read for notifications.
--
-- Opening the bell used to mark every notification read, so one glance at the
-- dropdown wiped the unread state the /notifications page is built around.
-- Now opening the bell (or the page) only marks rows seen, which clears the
-- badge; a row is read once it is clicked or "Mark all read" is pressed.
--
-- The badge counts rows that are neither read nor seen, so code that only
-- writes is_read (the production build at the time of this migration) stays
-- correct alongside it.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_seen boolean NOT NULL DEFAULT false;

UPDATE public.notifications SET is_seen = true WHERE is_read AND NOT is_seen;
