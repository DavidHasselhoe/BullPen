'use server';

import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { safeTimeZone } from '@/lib/notifications/push-plan';

// Our server POSTs to the endpoint, so only real push services are accepted.
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

/** Stores this device's push subscription for the signed-in user. A browser last used by someone else takes the endpoint over. */
export async function savePushSubscription(
  sub: PushSubscriptionJSON,
  timeZone: string,
  userAgent: string,
): Promise<{ success: boolean; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { success: false, error: 'Not authenticated' };

  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  const keyOk = (k: unknown): k is string => typeof k === 'string' && k.length > 0 && k.length <= 200;
  if (!isPushEndpoint(endpoint) || !keyOk(p256dh) || !keyOk(auth)) {
    return { success: false, error: 'Invalid subscription' };
  }

  const limit = await checkRateLimit(`push-sub:${userId}`, { windowMs: 60_000, maxRequests: 10 });
  if (!limit.allowed) return { success: false, error: 'Too many attempts. Try again in a minute.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createServerClient() as any).from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      time_zone: safeTimeZone(timeZone),
      user_agent: String(userAgent ?? '').slice(0, 300),
    },
    { onConflict: 'endpoint' },
  );
  if (error) {
    console.error('[push] save subscription:', error.message);
    return { success: false, error: 'Could not save this device' };
  }
  // Keep the caller's 5 newest devices. Cleanup failure is logged, not a failed save.
  const db = createServerClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: mine, error: listErr } = await db.from('push_subscriptions').select('id').eq('user_id', userId).order('created_at', { ascending: false });
  if (listErr) console.error('[push] list subscriptions:', listErr.message);
  else if (mine && mine.length > 5) {
    const { error: trimErr } = await db.from('push_subscriptions').delete().in('id', mine.slice(5).map((m: { id: string }) => m.id)).neq('endpoint', endpoint);
    if (trimErr) console.error('[push] trim subscriptions:', trimErr.message);
  }
  return { success: true };
}

export async function deletePushSubscription(endpoint: string): Promise<{ success: boolean }> {
  const userId = await getCurrentUserId();
  if (!userId || !endpoint) return { success: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createServerClient() as any).from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId);
  if (error) console.error('[push] delete subscription:', error.message);
  return { success: !error };
}

/** Measures that a push was opened, and clears it from the bell. */
export async function recordPushOpen(notificationId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId || !notificationId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createServerClient() as any)
    .from('notifications')
    .update({ push_opened_at: new Date().toISOString(), is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .is('push_opened_at', null)
    .not('pushed_at', 'is', null);
  if (error) console.error('[push] record open:', error.message);
}
