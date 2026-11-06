-- Saved screens with new-match alerts (Pro idea #5, 2026-11-06).
--
-- Builds on screener_filter_presets (120) rather than a new table: a "saved
-- screen" is exactly a named filter preset. What it gains:
--   scope          the universe the daily alert checks (the view the screen
--                  was saved on, or the S&P 500 when it was saved on a ticker
--                  list view). Reopening a screen still leaves the view alone.
--   alert_enabled  Pro only, enforced by the API and re-checked by the cron.
--   last_matches   tickers that matched at the last check. NULL = never
--                  checked; the next check only records a baseline.
--   checked_at     when last_matches was written.
--
-- Free accounts keep 1 saved screen. The API enforces it through
-- canCreateSavedScreen (lib/screener/saved-screen-limits.ts); the INSERT
-- policy below enforces the same limit for direct PostgREST writes.

ALTER TABLE public.screener_filter_presets
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'sp500'
    CHECK (scope IN ('sp500', 'nasdaq100', 'dow30', 'all')),
  ADD COLUMN IF NOT EXISTS alert_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_matches text[],
  ADD COLUMN IF NOT EXISTS checked_at timestamptz;

-- The cron reads only screens with alerts on.
CREATE INDEX IF NOT EXISTS screener_filter_presets_alert_idx
  ON public.screener_filter_presets (user_id) WHERE alert_enabled;

-- A policy must not count its own table (42P17 recursion): count through a
-- SECURITY DEFINER function that only sees the caller's rows.
CREATE OR REPLACE FUNCTION public.my_screener_preset_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.screener_filter_presets WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_screener_preset_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_screener_preset_count() TO authenticated;

-- Split the FOR ALL policy so INSERT can carry the free limit.
DROP POLICY IF EXISTS "Users manage own screener filter presets" ON public.screener_filter_presets;

CREATE POLICY "Users read own screener filter presets"
  ON public.screener_filter_presets FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users insert own screener filter presets"
  ON public.screener_filter_presets FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND ((select public.i_am_pro()) OR public.my_screener_preset_count() < 1)
  );

CREATE POLICY "Users update own screener filter presets"
  ON public.screener_filter_presets FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users delete own screener filter presets"
  ON public.screener_filter_presets FOR DELETE
  USING ((select auth.uid()) = user_id);
