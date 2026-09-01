/**
 * Thin wrapper around posthog-js for one-off event capture outside
 * PostHogProvider (which only handles automatic $pageview). Guards on
 * `posthog.__loaded` the same way PostHogProvider does, so a call here is a
 * safe no-op whenever PostHog isn't configured or the user hasn't consented
 * to analytics — callers never need to check that themselves.
 */
import posthog from 'posthog-js';

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (posthog.__loaded) posthog.capture(name, properties);
}
