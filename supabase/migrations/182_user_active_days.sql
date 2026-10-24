-- Return-visit tracking that does not depend on cookie consent: one row per
-- account per UTC day it loaded a page while signed in. middleware.ts calls
-- touch_active_day() in the background. Feeds the retention tile on the
-- PostHog drop-off dashboard (synced through the Supabase warehouse source).
-- Additive: safe for main before the code that writes it ships.
CREATE TABLE IF NOT EXISTS public.user_active_days (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- No policies: only the definer function below and the service role touch it.
ALTER TABLE public.user_active_days ENABLE ROW LEVEL SECURITY;

-- Takes no arguments, so a caller can only ever stamp their own account, today.
CREATE OR REPLACE FUNCTION public.touch_active_day()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.user_active_days (user_id, day)
  SELECT auth.uid(), (now() AT TIME ZONE 'utc')::date
  WHERE auth.uid() IS NOT NULL
  ON CONFLICT DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.touch_active_day() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.touch_active_day() TO authenticated;

COMMENT ON TABLE public.user_active_days IS
  'One row per account per UTC day it was active (signed-in page load). Written by touch_active_day() from middleware.';
