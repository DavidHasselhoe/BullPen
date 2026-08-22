/**
 * Instagram Manual Publish-By-Id
 * GET /api/instagram/publish-by-id?id=<postId>
 *
 * Remote-triggerable counterpart to `npm run instagram-publish -- --id=<postId>`
 * (scripts/publish-instagram.ts). That script only works where
 * INSTAGRAM_ACCESS_TOKEN/INSTAGRAM_USER_ID are actually set in the shell's
 * environment — locally that's whatever's in .env.local, which deliberately
 * doesn't carry real Meta credentials (see docs/instagram-setup.md). This
 * route runs inside Vercel's own runtime instead, where those (Sensitive,
 * write-only) env vars are actually injected, so a real publish can be
 * triggered without ever needing the secret values outside Vercel.
 *
 * Not a scheduled job — CRON_SECRET-gated like the cron routes (same bearer
 * check, same reason: keep it out of reach of anyone without the secret),
 * but on-demand only, so it deliberately lives outside app/api/cron/ rather
 * than needing a workflow scheduler (see scripts/test-cron-coverage.ts).
 * Unlike instagram-earnings-publish (the Monday auto-publish cron, scoped to
 * content_type 'earnings_calendar' + the current ISO week), this takes an
 * explicit post id and works for any content_type/period_key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { publishStagedPost } from '@/lib/instagram/publish';

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/instagram/publish-by-id' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, error: 'missing_id' }, { status: 400 });
  }

  const result = await publishStagedPost(id);

  if (result.outcome === 'published') {
    return NextResponse.json({ success: true, postId: id, mediaId: result.mediaId, permalink: result.permalink });
  }
  if (result.outcome === 'dry_run') {
    return NextResponse.json({ success: true, postId: id, dryRun: true });
  }
  if (result.outcome === 'not_found') {
    return NextResponse.json({ success: false, postId: id, error: 'not_found' }, { status: 404 });
  }
  if (result.outcome === 'not_ready') {
    return NextResponse.json({ success: false, postId: id, error: 'not_ready', status: result.status }, { status: 409 });
  }

  return NextResponse.json({ success: false, postId: id, error: result.error }, { status: 500 });
}
