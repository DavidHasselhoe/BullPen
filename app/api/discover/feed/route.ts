/**
 * GET /api/discover/feed
 *
 * Everything the Discover page needs on load; built by buildDiscoverFeed()
 * (lib/discover/feed.ts), which the page also calls on the server so the
 * first screen arrives in the HTML. The browser only calls this when that
 * prefetch failed or the cached copy went stale.
 */
import { NextResponse } from 'next/server';
import { getSessionForApiRoute, addSecurityHeaders } from '@/lib/security/api-security';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { buildDiscoverFeed } from '@/lib/discover/feed';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const session = await getSessionForApiRoute();
  const userId = session?.userId ?? null;

  try {
    const feed = await buildDiscoverFeed(userId);
    const response = NextResponse.json({ success: true, feed });
    // The personalized branch makes the payload user-specific; only the signed-out
    // shape is safe to share at the CDN edge.
    response.headers.set(
      'Cache-Control',
      userId ? 'private, max-age=60' : 'public, s-maxage=60, stale-while-revalidate=120',
    );
    return addSecurityHeaders(response);
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    console.error('[discover/feed] failed:', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load the feed' }, { status: 500 })
    );
  }
}
