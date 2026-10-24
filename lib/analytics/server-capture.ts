/**
 * Server-side events to PostHog's capture API with a plain fetch: no SDK, no
 * cookies, and no person profile, so they say nothing about any visitor.
 * Used by instrumentation.ts (server errors) and lib/cron/report.ts (cron
 * runs). Production only, best-effort, and never slower than two seconds.
 */

/** BullPen's PostHog project lives in the US region. */
const CAPTURE_URL = 'https://us.i.posthog.com/i/v0/e/';

export async function captureServerEvent(event: string, properties: Record<string, unknown>): Promise<void> {
  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!token || process.env.NODE_ENV !== 'production') return;
  try {
    await fetch(CAPTURE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: token,
        event,
        // One shared id: these are not tied to a visitor on purpose.
        distinct_id: 'server',
        properties: {
          $process_person_profile: false,
          environment: process.env.VERCEL_ENV ?? 'production',
          ...properties,
        },
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Best-effort: the runtime log still has whatever happened.
  }
}
