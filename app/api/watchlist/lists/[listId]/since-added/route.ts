import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { BENCHMARK, getSinceAddedEntries } from '@/lib/watchlist/since-added';

interface RouteContext {
  params: Promise<{ listId: string }>;
}

/**
 * GET /api/watchlist/lists/[listId]/since-added
 *
 * The anchors for the list scorecard (lib/watchlist/since-added.ts). The
 * client measures from there to the live price, so the numbers tick with the
 * cards.
 */
async function handler(
  _req: NextRequest,
  ctx: RouteContext,
  session: { userId: string }
): Promise<NextResponse> {
  const { listId } = await ctx.params;

  const { data: list } = await createServerClient()
    .from('watchlist_lists')
    .select('id')
    .eq('id', listId)
    .eq('user_id', session.userId)
    .maybeSingle();
  if (!list) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'List not found' }, { status: 404 }));
  }

  try {
    const entries = await getSinceAddedEntries(session.userId, listId);
    // No browser caching: an add, remove or Undo refetches this and must see the change.
    return addSecurityHeaders(NextResponse.json({ success: true, benchmark: BENCHMARK, entries }));
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    throw error;
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 60 } });
