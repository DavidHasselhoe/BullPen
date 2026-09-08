/**
 * POST / DELETE / GET /api/institutions/[slug]/follow
 *
 * Follow or unfollow a tracked 13F fund. Following is what puts a user on the
 * fan-out list when the weekly sync ingests that fund's next filing (see
 * notifyInstitutionFilingChange).
 *
 * Not Pro-gated, unlike the holdings route: the fund cards on Discover are
 * free, and so is being told the fund filed. The gate stays on the holdings
 * themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { isInstitutionalFundSlug } from '@/lib/institutions/fund-list';

async function resolveInvestorId(
  supabase: ReturnType<typeof createServerClient>,
  slug: string
): Promise<string | null> {
  const { data } = await supabase
    .from('institutional_investors')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;
  if (!isInstitutionalFundSlug(slug)) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
  }

  const supabase = createServerClient();
  const investorId = await resolveInvestorId(supabase, slug);
  if (!investorId) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
  }

  if (request.method === 'GET') {
    const { data } = await supabase
      .from('user_institution_follows')
      .select('id')
      .eq('user_id', session.userId)
      .eq('investor_id', investorId)
      .maybeSingle<{ id: string }>();
    return addSecurityHeaders(NextResponse.json({ success: true, following: !!data }));
  }

  if (request.method === 'DELETE') {
    const { error } = await supabase
      .from('user_institution_follows')
      .delete()
      .eq('user_id', session.userId)
      .eq('investor_id', investorId);
    if (error) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'unfollow_failed' }, { status: 500 }));
    }
    return addSecurityHeaders(NextResponse.json({ success: true, following: false }));
  }

  // Upsert rather than insert so a double-tap is a no-op instead of a 409.
  const { error } = await supabase
    .from('user_institution_follows')
    .upsert(
      { user_id: session.userId, investor_id: investorId } as never,
      { onConflict: 'user_id,investor_id', ignoreDuplicates: false }
    );
  if (error) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'follow_failed' }, { status: 500 }));
  }
  return addSecurityHeaders(NextResponse.json({ success: true, following: true }));
}

const options = { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } };

export const GET = withAuth(handler, options);
export const POST = withAuth(handler, options);
export const DELETE = withAuth(handler, options);
