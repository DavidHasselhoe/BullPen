-- 126_enforce_alert_watchlist_limits_rls.sql
-- The free-tier caps on active alerts (FREE_ACTIVE_ALERT_LIMIT = 5 distinct
-- symbols, types/alerts.ts) and watchlists (MAX_FREE_WATCHLISTS = 3,
-- lib/billing/entitlements.ts) were enforced only in their API routes
-- (app/api/alerts, app/api/watchlist/lists) -- a direct
-- supabase.from(...).insert() bypassed both caps entirely. Same shape as the
-- Pro-gating RLS gaps fixed in 124/125, just for a free-tier soft limit
-- instead of a paywall.

-- ---------------------------------------------------------------------------
-- user_alerts: cap at 5 distinct active symbols per user (mirrors the
-- "isNewSymbol && activeSymbols.size >= FREE_ACTIVE_ALERT_LIMIT" check in
-- app/api/alerts/route.ts and lib/ai/tools.ts's createAlertTool).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users insert own alerts" ON user_alerts;
CREATE POLICY "Users insert own alerts"
  ON user_alerts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      NOT is_active
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > NOW()))
      )
      OR EXISTS (
        SELECT 1 FROM user_alerts existing
        WHERE existing.user_id = auth.uid() AND existing.symbol = symbol AND existing.is_active
      )
      OR (
        SELECT COUNT(DISTINCT existing.symbol) FROM user_alerts existing
        WHERE existing.user_id = auth.uid() AND existing.is_active
      ) < 5
    )
  );

DROP POLICY IF EXISTS "Users update own alerts" ON user_alerts;
CREATE POLICY "Users update own alerts"
  ON user_alerts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      NOT is_active
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > NOW()))
      )
      OR EXISTS (
        SELECT 1 FROM user_alerts existing
        WHERE existing.user_id = auth.uid() AND existing.symbol = symbol AND existing.is_active AND existing.id <> id
      )
      OR (
        SELECT COUNT(DISTINCT existing.symbol) FROM user_alerts existing
        WHERE existing.user_id = auth.uid() AND existing.is_active AND existing.id <> id
      ) < 5
    )
  );

-- ---------------------------------------------------------------------------
-- watchlist_lists: cap at 3 lists per user (mirrors canCreateWatchlist() in
-- lib/watchlist/limits.ts). The existing single combined policy (no FOR
-- clause -- applies to every command) is split into per-command policies so
-- the count check only constrains INSERT, not SELECT/UPDATE/DELETE.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users manage own watchlist lists" ON public.watchlist_lists;

CREATE POLICY "Users read own watchlist lists"
  ON public.watchlist_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own watchlist lists"
  ON public.watchlist_lists FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > NOW()))
      )
      OR (SELECT COUNT(*) FROM public.watchlist_lists existing WHERE existing.user_id = auth.uid()) < 3
    )
  );

CREATE POLICY "Users update own watchlist lists"
  ON public.watchlist_lists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own watchlist lists"
  ON public.watchlist_lists FOR DELETE
  USING (auth.uid() = user_id);
