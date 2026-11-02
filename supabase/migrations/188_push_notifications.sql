-- Web push (PWA): marks which notification rows may be pushed to a phone and
-- stores each browser's push subscription. push_kind is set by the producer,
-- pushed_at / push_opened_at by the sender. Additive and nullable: safe on main
-- before the code that writes them ships.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_kind text,
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_opened_at timestamptz;

-- The sender's scan: rows marked pushable that have not gone out yet.
CREATE INDEX IF NOT EXISTS notifications_push_pending_idx
  ON public.notifications (user_id)
  WHERE push_kind IS NOT NULL AND pushed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  time_zone text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

-- A user may see and remove their own devices. No insert or update policy:
-- writes go through the service role.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (user_id = auth.uid());
