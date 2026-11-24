-- One row per completed ISO week for the Monday Instagram summary
-- (app/api/cron/instagram-weekly-insights, lib/instagram/weekly-insights.ts).
-- Instagram only reports today's follower total, so the week-over-week
-- follower change needs last week's number kept here. `stats` keeps that
-- week's account totals and per-post numbers as a record.

CREATE TABLE IF NOT EXISTS public.instagram_weekly_stats (
  week_key    TEXT PRIMARY KEY,          -- ISO week, e.g. '2026-W48'
  followers   INTEGER NOT NULL,
  stats       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.instagram_weekly_stats ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.instagram_weekly_stats IS
  'Weekly Instagram follower count and stats for the Monday Discord summary. Service-role only.';
