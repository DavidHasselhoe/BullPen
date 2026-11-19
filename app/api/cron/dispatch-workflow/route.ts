/**
 * Start a GitHub Actions batch workflow on time
 * GET /api/cron/dispatch-workflow?workflow=cron-prefetch-market-data.yml
 *
 * GitHub's own `schedule:` trigger starts these 4-10 hours late every day
 * (measured 11-10 to 11-19), which pushed the overnight credit loops into US
 * market hours, on top of each other: batches failed against live traffic and
 * Prefetch Financials ran into its 5h50m timeout ("cancelled"). The loops still
 * need a runner that lives for hours, which a Vercel function (800s max) is not,
 * so Vercel's cron only starts them: a `workflow_dispatch` begins within
 * seconds. Each workflow keeps its `schedule:` as a fallback whose gate job
 * skips the run when a dispatch already happened in the last 20 hours.
 *
 * Needs GITHUB_DISPATCH_TOKEN: a fine-grained PAT on the BullPen repo with
 * Actions read and write.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';

export const maxDuration = 30;

const REPO = 'DavidHasselhoe/BullPen';

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/dispatch-workflow' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workflow = request.nextUrl.searchParams.get('workflow') ?? '';
  if (!/^cron-[a-z0-9-]+\.yml$/.test(workflow)) {
    return NextResponse.json({ error: 'workflow must be a cron-*.yml file name' }, { status: 400 });
  }
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    // 500 so the "failed" PostHog alert fires; GitHub's late schedule still runs the job.
    return NextResponse.json({ error: 'GITHUB_DISPATCH_TOKEN is not set', workflow }, { status: 500 });
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `GitHub ${res.status}: ${(await res.text()).slice(0, 300)}`, workflow }, { status: 502 });
  }
  return NextResponse.json({ dispatched: true, workflow });
}

export const GET = withCronReport('dispatch-workflow', handleGET);
