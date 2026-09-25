/**
 * POST / DELETE /api/congress/[slug]/follow
 *
 * Follow or unfollow a tracked politician. Following puts the user on the
 * fan-out list when the refresh cron stores new disclosed trades for that
 * member (see notifyPoliticianTrades). Mirrors /api/institutions/[slug]/follow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

async function handler(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;
  const supabase = createServerClient();

  const { data: member } = await supabase
    .from('congress_politicians')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle<{ id: string }>();
  if (!member) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
  }

  if (request.method === 'DELETE') {
    const { error } = await supabase
      .from('user_politician_follows')
      .delete()
      .eq('user_id', session.userId)
      .eq('politician_id', member.id);
    if (error) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'unfollow_failed' }, { status: 500 }));
    }
    return addSecurityHeaders(NextResponse.json({ success: true, following: false }));
  }

  // Upsert so a double-tap is a no-op instead of a 409.
  const { error } = await supabase
    .from('user_politician_follows')
    .upsert(
      { user_id: session.userId, politician_id: member.id } as never,
      { onConflict: 'user_id,politician_id', ignoreDuplicates: false }
    );
  if (error) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'follow_failed' }, { status: 500 }));
  }
  return addSecurityHeaders(NextResponse.json({ success: true, following: true }));
}

const options = { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } };

// Follow state is read in bulk from GET /api/congress/follows, not per member.
export const POST = withAuth(handler, options);
export const DELETE = withAuth(handler, options);
