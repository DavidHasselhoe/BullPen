// Browser side of web push. Call only from the client.
import { savePushSubscription } from '@/app/actions/push';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** iOS only delivers push to a Home Screen app: Safari tabs have no PushManager. */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !isPushSupported() && !isStandalone();
}

export function getPermission(): NotificationPermission | 'unsupported' {
  return isPushSupported() ? Notification.permission : 'unsupported';
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The person closed or refused the browser permission prompt (as opposed to push being unavailable). */
export class PushPermissionError extends Error {}

export async function subscribeThisDevice(): Promise<PushSubscriptionJSON> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error('Push is not configured');
  if (!isPushSupported()) throw new Error('Push is not supported on this device');
  if ((await Notification.requestPermission()) !== 'granted') throw new PushPermissionError('Notifications are blocked for BullPen');
  const reg = (await navigator.serviceWorker.getRegistration('/sw.js')) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  return sub.toJSON();
}

/** Drops this device's browser subscription. Returns the endpoint it removed, or null if there was none. */
export async function unsubscribeThisDevice(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

/** Subscribes this device and saves it for the signed-in user. Throws if either step fails; a failed save leaves no browser subscription behind. */
export async function enablePushOnThisDevice(): Promise<void> {
  const sub = await subscribeThisDevice();
  const res = await savePushSubscription(sub, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.userAgent);
  if (!res.success) {
    await unsubscribeThisDevice().catch(() => null);
    throw new Error(res.error ?? 'save failed');
  }
}
