import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getSessionForApiRoute, withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

/**
 * Revokes every session for the calling user except the one making this
 * request. Called right after a password change so a stolen refresh token
 * on another device doesn't survive the user rotating their password.
 * Supabase's admin signOut takes the current access token (not a userId) and
 * scopes the revocation to "every other session tied to that token's user".
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionForApiRoute();
  if (!session) {
    return addSecurityHeaders(NextResponse.json({ error: 'Authentication required' }, { status: 401 }));
  }

  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : null;
  if (!accessToken) {
    return addSecurityHeaders(NextResponse.json({ error: 'Missing access token' }, { status: 400 }));
  }

  const supabase = createServerClient();
  const { error } = await supabase.auth.admin.signOut(accessToken, 'others');

  if (error) {
    // Not fatal to the password-change flow itself — the new password is
    // already set. Log and report failure so the client can inform the user.
    console.error('[invalidate-other-sessions] signOut failed:', error.message);
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const POST = withRateLimit(handler, { windowMs: 60_000, maxRequests: 10, scope: 'invalidate-other-sessions' });
