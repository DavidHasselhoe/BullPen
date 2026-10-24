/**
 * Server errors to PostHog error tracking (Next.js calls onRequestError for
 * every uncaught error in a page render, route handler, server action or
 * proxy). Sent straight to the capture API with fetch: no SDK, no cookies,
 * and no person profile, so it covers every visitor, including the ones who
 * declined analytics. Only the error and the route go out: no headers, no
 * query string, no user id.
 *
 * Browser errors are captured by posthog-js itself (PostHogProvider's
 * capture_exceptions), for consenting visitors only.
 */

import type { Instrumentation } from 'next';

/** BullPen's PostHog project lives in the US region. */
const CAPTURE_URL = 'https://us.i.posthog.com/i/v0/e/';

/** "    at handler (/var/task/.next/server/app/api/x/route.js:12:34)" → a PostHog raw frame. */
function parseStack(stack: string | undefined) {
  return (stack ?? '')
    .split('\n')
    .map((line) => line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(([, fn, file, line, col]) => ({
      platform: 'node:javascript' as const,
      function: fn,
      filename: file,
      lineno: Number(line),
      colno: Number(col),
      in_app: !file.includes('node_modules') && !file.startsWith('node:'),
    }))
    // PostHog wants the outermost call first, a V8 stack lists it last.
    .reverse();
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!token || process.env.NODE_ENV !== 'production') return;

  const error = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined;
  try {
    await fetch(CAPTURE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: token,
        event: '$exception',
        // One shared id: these are not tied to a visitor on purpose.
        distinct_id: 'server',
        properties: {
          $process_person_profile: false,
          $exception_level: 'error',
          $exception_list: [
            {
              type: error.name,
              value: error.message,
              mechanism: { handled: false, type: 'middleware', synthetic: false },
              stacktrace: { type: 'raw', frames: parseStack(error.stack) },
            },
          ],
          digest,
          method: request.method,
          // The route file, not the URL: "/app/stock/[ticker]" groups every ticker,
          // and a path's query string can carry tokens.
          route: context.routePath,
          route_type: context.routeType,
          render_source: context.renderSource,
          runtime: process.env.NEXT_RUNTIME,
          environment: process.env.VERCEL_ENV ?? 'production',
        },
      }),
      // A slow PostHog must not hold the response.
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Reporting is best-effort; the error itself is already in the runtime log.
  }
};
