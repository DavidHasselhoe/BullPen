import { NextRequest, NextResponse } from 'next/server';
import { addSecurityHeaders, withRateLimit } from '@/lib/security/api-security';
import { reportFailedLogin, clearLoginFailures } from '@/lib/security/login-lockout';
import { logSecurityEvent } from '@/lib/security/security-events';

/**
 * Records the outcome of a login attempt for the soft-lockout mechanism (see
 * lib/security/login-lockout.ts). Called from lib/auth/auth.ts's signIn()
 * right after Supabase returns success/failure — this app's login flow calls
 * the Supabase SDK directly from the browser, so this is the only place the
 * server learns whether an attempt actually succeeded, not just that one was
 * made (which /api/auth/rate-limit-check already throttles regardless of
 * outcome).
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
  const outcome = body?.outcome === 'success' ? 'success' : body?.outcome === 'failure' ? 'failure' : null;

  if (!identifier || !outcome) {
    return addSecurityHeaders(NextResponse.json({ error: 'Invalid request' }, { status: 400 }));
  }

  if (outcome === 'success') {
    await clearLoginFailures(identifier);
  } else {
    const justLockedOut = await reportFailedLogin(identifier);
    if (justLockedOut) {
      logSecurityEvent('account_lockout', { identifier, path: '/api/auth/report-failed-login' });
    }
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const POST = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30, scope: 'report-failed-login' });
