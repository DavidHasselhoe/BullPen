/**
 * GET /api/institutions/follows
 *
 * Every fund the signed-in user follows, as slugs. One request for the whole
 * Discover grid: asking per fund would be fifteen round trips to render one
 * section, and the answer is small enough that fetching all of it is cheaper
 * than fetching any of it individually.
 *
 * Deliberately NOT folded into GET /api/institutions, which caches its
 * response globally for an hour in market_data_cache — per-user state in a
 * shared cache is how one account ends up seeing another's follows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

interface FollowRow {
  institutional_investors: { slug: string } | null;
}

async function handler(
  _request: NextRequest,
  _context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('user_institution_follows')
    .select('institutional_investors(slug)')
    .eq('user_id', session.userId);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load follows' }, { status: 500 })
    );
  }

  const slugs = ((data as unknown as FollowRow[] | null) ?? [])
    .map((row) => row.institutional_investors?.slug)
    .filter((s): s is string => !!s);

  return addSecurityHeaders(NextResponse.json({ success: true, slugs }));
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 60 } });
