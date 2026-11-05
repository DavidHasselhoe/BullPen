/**
 * Web Push sender. Never throws: a missing or malformed VAPID config or a failed send comes back
 * as `{ error }` so one bad device cannot stop the dispatch run, and the caller can report why.
 */
import webpush from 'web-push';

export interface StoredSubscription { id: string; endpoint: string; p256dh: string; auth: string }

// null = not tried yet, '' = configured, otherwise why it failed.
let configError: string | null = null;

// Configured lazily so a missing env var only affects sending, not importing this module.
function configure(): string {
  if (configError !== null) return configError;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  try {
    if (!pub || !priv || !subject) throw new Error('VAPID env vars are not set');
    webpush.setVapidDetails(subject, pub, priv);
    configError = '';
  } catch (err) {
    configError = `VAPID not configured: ${err instanceof Error ? err.message : String(err)}`;
    console.error('[push-send]', configError);
  }
  return configError;
}

export async function sendPush(
  sub: StoredSubscription,
  payload: { title: string; body: string; url: string; tag: string },
): Promise<'sent' | 'gone' | { error: string }> {
  const configErr = configure();
  if (configErr) return { error: configErr };
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600 },
    );
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number; body?: string }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    const detail = status ? `${status} ${String((err as { body?: string }).body ?? '').slice(0, 120)}` : err instanceof Error ? err.message : String(err);
    console.error('[push-send] send failed:', detail);
    // Never new URL() here: a malformed endpoint would throw out of the never-throws path.
    const host = sub.endpoint.split('/')[2] ?? 'unknown host';
    return { error: `send failed (${host}): ${detail}` };
  }
}
