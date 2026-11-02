/**
 * Web Push sender. Never throws: a missing VAPID config or a failed send is reported as 'error'
 * so one bad device cannot stop the dispatch run.
 */
import webpush from 'web-push';

export interface StoredSubscription { id: string; endpoint: string; p256dh: string; auth: string }

let configured: boolean | null = null;

// Configured lazily so a missing env var only affects sending, not importing this module.
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  try {
    if (!pub || !priv || !subject) throw new Error('VAPID env vars are not set');
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  } catch (err) {
    console.error('[push-send] VAPID not configured:', err instanceof Error ? err.message : err);
    configured = false;
  }
  return configured;
}

export async function sendPush(
  sub: StoredSubscription,
  payload: { title: string; body: string; url: string; tag: string },
): Promise<'sent' | 'gone' | 'error'> {
  if (!configure()) return 'error';
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600 },
    );
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    console.error('[push-send] send failed:', status ?? (err instanceof Error ? err.message : err));
    return 'error';
  }
}
