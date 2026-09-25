/**
 * GET /api/congress/follows
 *
 * Every politician the signed-in user follows, as slugs, in one request for
 * the whole Discover grid. Kept out of GET /api/congress, which is cached
 * globally in market_data_cache: per-user state in a shared cache is how one
 * account ends up seeing another's follows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

interface FollowRow {
  congress_politicians: { slug: string } | null;
}

async function handler(
  _request: NextRequest,
  _context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('user_politician_follows')
    .select('congress_politicians(slug)')
    .eq('user_id', session.userId);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load follows' }, { status: 500 })
    );
  }

  const slugs = ((data as unknown as FollowRow[] | null) ?? [])
    .map((row) => row.congress_politicians?.slug)
    .filter((s): s is string => !!s);

  return addSecurityHeaders(NextResponse.json({ success: true, slugs }));
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 60 } });
