'use client';

import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/hooks/use-notifications';
import { useAuth } from '@/hooks/use-auth';
import { NotificationToast } from './NotificationToast';
import type { Notification } from '@/lib/notifications/notifications-db';

// A toast says "this just happened". Anything older belongs in the bell only,
// however it reached the client (account switch, laptop waking from sleep).
const TOAST_MAX_AGE_MS = 10 * 60 * 1000;

function shouldToast(n: Notification): boolean {
  if (Date.now() - new Date(n.created_at).getTime() > TOAST_MAX_AGE_MS) return false;
  return n.severity === 'warning' || n.severity === 'critical' || n.type === 'ai_insight' || n.type === 'referral';
}

/**
 * Mounted once at the app root. Watches the same notifications list the bell
 * already polls/subscribes to (useNotifications' Realtime channel), and pops
 * a toast the moment a new one worth interrupting for arrives — e.g. "Your
 * AAPL deep dive is ready" — wherever the user currently is in the app, not
 * just when they happen to open the bell.
 */
export function NotificationToastListener() {
  // The bell's limit, so both read one cache entry: a limit of its own cost a second fetch on every page load.
  const { data: notifications } = useNotifications(50);
  const { user } = useAuth();
  const [active, setActive] = useState<Notification | null>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const seenFor = useRef<string | null>(null);

  useEffect(() => {
    if (!notifications) return;

    // Signing into another account in the same tab: its whole list is history
    // to this listener, not news.
    if (seenFor.current !== (user?.id ?? null)) {
      seenFor.current = user?.id ?? null;
      seenIds.current = null;
    }

    if (seenIds.current === null) {
      // First load — these already existed, don't toast historical ones.
      seenIds.current = new Set(notifications.map((n) => n.id));
      return;
    }

    const fresh = notifications.find((n) => !seenIds.current!.has(n.id) && shouldToast(n));
    for (const n of notifications) seenIds.current.add(n.id);
    if (fresh) setActive(fresh);
  }, [notifications, user?.id]);

  if (!active) return null;
  return <NotificationToast notification={active} onDismiss={() => setActive(null)} />;
}
