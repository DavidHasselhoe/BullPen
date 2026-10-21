/**
 * The one door to posthog-js. The library (~240KB, the biggest script on
 * every page) is imported on demand: PostHogProvider calls loadPostHog() only
 * once analytics consent is on file, so a visitor who hasn't accepted (every
 * first visit, every crawler) never downloads it.
 *
 * trackEvent() is a safe no-op until PostHog is loaded and initialized, the
 * same guard PostHogProvider uses, so callers never need to check consent or
 * configuration themselves.
 */
import type { CaptureOptions, PostHog } from 'posthog-js';

let instance: PostHog | null = null;
let loading: Promise<PostHog> | null = null;

export function loadPostHog(): Promise<PostHog> {
  loading ??= import('posthog-js').then((m) => (instance = m.default));
  return loading;
}

/** The initialized client, or null before consent/init. */
export function loadedPostHog(): PostHog | null {
  return instance?.__loaded ? instance : null;
}

export function trackEvent(name: string, properties?: Record<string, unknown>, options?: CaptureOptions): void {
  loadedPostHog()?.capture(name, properties, options);
}
