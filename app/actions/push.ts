'use server';

import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { safeTimeZone } from '@/lib/notifications/push-plan';

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
  if (!endpoint || !endpoint.startsWith('https://') || endpoint.length > 1000 || !p256dh || !auth) {
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
    .eq('user_id', userId);
  if (error) console.error('[push] record open:', error.message);
}
