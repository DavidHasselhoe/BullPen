/**
 * Cron health: every cron route's handler is wrapped in withCronReport, which
 * sends one `cron_completed` event to PostHog per authorised run, built from
 * the JSON the route already returns. PostHog alerts on it (to the Discord
 * error channel) catch the failure error tracking can't: a job that throws
 * nothing and quietly does nothing, like check-price-moves writing no alerts
 * from 2026-09-03 to 10-23.
 *
 * Properties: `job`, `status` (HTTP), `ok`, `duration_ms`, every top-level
 * number or boolean in the response (`sent`, `symbolsChecked`, `skipped`...),
 * `<key>_count` for every top-level array (`errors_count`), and the first
 * five `errors` strings as `errors_sample`.
 */

import type { NextRequest, NextResponse } from 'next/server';
import { captureServerEvent } from '@/lib/analytics/server-capture';

type Handler = (request: NextRequest) => Promise<NextResponse> | NextResponse;

export function withCronReport(job: string, handler: Handler): Handler {
  return async (request) => {
    const started = Date.now();
    const response = await handler(request);
    // A wrong or missing CRON_SECRET is a stranger probing the URL, not a run.
    if (response.status === 401) return response;

    const properties: Record<string, unknown> = {};
    try {
      const body = await response.clone().json();
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        for (const [key, value] of Object.entries(body)) {
          if (typeof value === 'number' || typeof value === 'boolean') properties[key] = value;
          else if (Array.isArray(value)) {
            properties[`${key}_count`] = value.length;
            // The text, not just the count: Vercel keeps runtime logs for an hour,
            // so by the time anyone looks this is the only record of what failed.
            if (key === 'errors' && value.length) properties.errors_sample = value.slice(0, 5).map((e) => (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 300));
          }
        }
      }
    } catch {
      // Not JSON: the status alone still says the job ran.
    }
    // Last, so a response field of the same name can't overwrite what the alerts filter on.
    Object.assign(properties, { job, status: response.status, ok: response.status < 400, duration_ms: Date.now() - started });
    await captureServerEvent('cron_completed', properties);
    return response;
  };
}
