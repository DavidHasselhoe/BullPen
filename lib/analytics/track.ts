/**
 * The one door to posthog-js. The library (~240KB, the biggest script on
 * every page) is imported on demand: PostHogProvider calls loadPostHog() only
 * once analytics consent is on file, so a visitor who hasn't accepted (every
 * first visit, every crawler) never downloads it.
 *
 * trackEvent() never needs a consent check from its callers. Before PostHog
 * is initialized it queues the event, and PostHogProvider flushes the queue
 * right after init: with the library loading on demand, events fired by a
 * page's mount effects would otherwise land before it and vanish. Only events
 * from a visitor whose consent is already on file are queued: an action taken
 * before accepting is never sent later.
 */
import type { CaptureOptions, PostHog } from 'posthog-js';
import { getStoredConsent } from '@/lib/cookie-consent/storage';

let instance: PostHog | null = null;
let loading: Promise<PostHog> | null = null;

/** Capped, for a session where init never comes (no PostHog key, e.g. local dev). */
const MAX_PENDING = 50;
const pending: Array<[string, Record<string, unknown> | undefined, CaptureOptions | undefined]> = [];

export function loadPostHog(): Promise<PostHog> {
  loading ??= import('posthog-js').then((m) => (instance = m.default));
  return loading;
}

/** The initialized client, or null before consent/init. */
export function loadedPostHog(): PostHog | null {
  return instance?.__loaded ? instance : null;
}

/** Sends what was tracked before init. PostHogProvider calls it after init. */
export function flushPendingEvents(posthog: PostHog): void {
  for (const [name, properties, options] of pending.splice(0)) posthog.capture(name, properties, options);
}

export function trackEvent(name: string, properties?: Record<string, unknown>, options?: CaptureOptions): void {
  const posthog = loadedPostHog();
  if (posthog) posthog.capture(name, properties, options);
  else if (pending.length < MAX_PENDING && getStoredConsent() === 'accepted') pending.push([name, properties, options]);
}
