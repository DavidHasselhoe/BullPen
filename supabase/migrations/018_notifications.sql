-- Notifications Migration
-- Creates notifications table for user notifications system
-- Supports on-page, push, and email notifications (future-proof)

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
-- Stores user notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                         -- price_move | earnings | ai_insight | market
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT NULL,                      -- stock | portfolio | market
  entity_id TEXT NULL,                        -- ticker symbol, etc.
  severity TEXT NOT NULL DEFAULT 'info',      -- info | warning | critical
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON public.notifications(entity_type, entity_id);

-- Comments for documentation
COMMENT ON TABLE public.notifications IS 'User notifications system - supports on-page, push, and email (future-proof)';
COMMENT ON COLUMN public.notifications.user_id IS 'References auth.users.id - recipient of the notification';
COMMENT ON COLUMN public.notifications.type IS 'Notification type: price_move, earnings, ai_insight, market';
COMMENT ON COLUMN public.notifications.entity_type IS 'Entity type: stock, portfolio, market';
COMMENT ON COLUMN public.notifications.entity_id IS 'Entity identifier (e.g., ticker symbol for stocks)';
COMMENT ON COLUMN public.notifications.severity IS 'Severity level: info, warning, critical';
COMMENT ON COLUMN public.notifications.is_read IS 'Whether the notification has been read by the user';

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can read their own notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Users can update their own notifications (mark as read)
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Inserts are only allowed via server actions (no direct client inserts)
-- This is enforced at the application level, not via RLS
-- RLS policy blocks all client-side inserts
DROP POLICY IF EXISTS "No client inserts" ON public.notifications;
-- Intentionally no INSERT policy - inserts must be done via server actions with service role
