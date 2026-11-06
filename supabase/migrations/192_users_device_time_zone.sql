-- The time zone of the device a user last opened BullPen on (IANA name),
-- written by ClockSync through app/actions/device-time-zone.ts. Read by the
-- morning alert email to send it in the reader's morning: settings.time_zone
-- is 'auto' for most users, which says nothing server-side.
alter table public.users add column if not exists device_time_zone text;
