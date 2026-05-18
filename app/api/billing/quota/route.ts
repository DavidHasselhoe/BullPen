import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { checkQuota, QUOTAS, type QuotaFeature } from '@/lib/billing/quotas';

/**
 * GET /api/billing/quota?feature=<name>
 *
 * Returns the current quota state for the authenticated user for the requested feature.
 * Used by the QuotaIndicator UI to render "2 / 3 builds this month" pills.
 */
async function handler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const feature = request.nextUrl.searchParams.get('feature') as QuotaFeature | null;

  if (!feature || !(feature in QUOTAS)) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'invalid_feature' }, { status: 400 })
    );
  }

  const state = await checkQuota(session.userId, feature);
  return addSecurityHeaders(
    NextResponse.json({ feature, ...state })
  );
}

export const GET = withAuth(handler);
