-- Atomic quota reservation for AI features that check before they call.
--
-- checkQuota counts ai_usage rows, and the row used to be written after the
-- model call, so parallel requests could all pass the check before any of
-- them was logged. This takes a per-user, per-feature lock, counts the window
-- and inserts the reservation row in one transaction: the Nth + 1 caller
-- waits for the Nth to commit and then sees its row.
--
-- Returns the reservation id (null when the limit is reached) and the count
-- of rows in the window BEFORE this call. p_limit null means no limit.
-- The caller backfills real token counts on the row (updateAiCallUsage) or
-- deletes it when the call never happened (release).

CREATE OR REPLACE FUNCTION public.reserve_ai_quota(
  p_user_id uuid,
  p_feature text,
  p_model text,
  p_limit integer,
  p_window_start timestamptz,
  p_metadata jsonb DEFAULT NULL
)
RETURNS TABLE (reservation_id uuid, used integer)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_feature, 0));

  SELECT count(*)::integer INTO v_used
  FROM ai_usage
  WHERE user_id = p_user_id
    AND feature = p_feature
    AND status = 'success'
    AND created_at >= p_window_start;

  IF p_limit IS NOT NULL AND v_used >= p_limit THEN
    RETURN QUERY SELECT NULL::uuid, v_used;
    RETURN;
  END IF;

  INSERT INTO ai_usage (user_id, feature, model, cost_usd, status, metadata)
  VALUES (p_user_id, p_feature, p_model, 0, 'success', p_metadata)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_used;
END;
$$;

-- Server only (service role). A signed-in user calling it directly could
-- burn their own quota at best, but there is no reason to expose it.
REVOKE ALL ON FUNCTION public.reserve_ai_quota(uuid, text, text, integer, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(uuid, text, text, integer, timestamptz, jsonb) TO service_role;
