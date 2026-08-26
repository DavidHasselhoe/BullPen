/**
 * POST /api/instagram/publish
 *
 * Manual on-demand publish by post id, gated the same way every cron route
 * here is (CRON_SECRET bearer). Exists because `npm run instagram-publish`
 * only works from a machine whose .env.local has the real
 * INSTAGRAM_ACCESS_TOKEN/INSTAGRAM_USER_ID — this runs the same
 * publishStagedPost() server-side in whatever environment actually has
 * those configured (e.g. Vercel production, when local dev doesn't).
 */
import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { publishStagedPost } from '@/lib/instagram/publish';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/instagram/publish' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  }

  const result = await publishStagedPost(id);

  if (result.outcome === 'not_found') {
    return NextResponse.json({ success: false, ...result }, { status: 404 });
  }
  if (result.outcome === 'failed') {
    return NextResponse.json({ success: false, ...result }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result });
}
