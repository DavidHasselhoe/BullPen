import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/security/rate-limiter';
import { addSecurityHeaders } from '@/lib/security/api-security';
import { logSecurityEvent } from '@/lib/security/security-events';

/**
 * Login/signup/password-reset all call the Supabase JS SDK directly from the
 * browser (lib/auth/auth.ts) — there's no server hop in that path today, so
 * nothing in this app could rate-limit them. This route is a throttle-only
 * gate the client checks first: it performs no auth action itself, just
 * counts attempts and returns 429 once a caller trips a limit. Two windows
 * per action — per-IP (catches one attacker cycling through many emails) and
 * per-identifier (catches distributed attempts against one account/email,
 * which matters most for password-reset to stop inbox-bombing a victim).
 */
const LIMITS: Record<string, { ip: { windowMs: number; maxRequests: number }; identifier: { windowMs: number; maxRequests: number } }> = {
  login: { ip: { windowMs: 5 * 60_000, maxRequests: 20 }, identifier: { windowMs: 5 * 60_000, maxRequests: 8 } },
  signup: { ip: { windowMs: 60 * 60_000, maxRequests: 8 }, identifier: { windowMs: 60 * 60_000, maxRequests: 3 } },
  reset: { ip: { windowMs: 60 * 60_000, maxRequests: 10 }, identifier: { windowMs: 60 * 60_000, maxRequests: 3 } },
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === 'string' ? body.action : '';
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';

  const limits = LIMITS[action];
  if (!limits || !identifier) {
    return addSecurityHeaders(NextResponse.json({ error: 'Invalid request' }, { status: 400 }));
  }

  const ip = getClientIdentifier(request);
  const [ipResult, identifierResult] = await Promise.all([
    checkRateLimit(`auth-throttle:${action}:ip:${ip}`, limits.ip),
    checkRateLimit(`auth-throttle:${action}:id:${identifier}`, limits.identifier),
  ]);

  if (!ipResult.allowed || !identifierResult.allowed) {
    const resetTime = Math.max(ipResult.resetTime, identifierResult.resetTime);
    logSecurityEvent('auth_rate_limited', {
      identifier,
      path: `/api/auth/rate-limit-check:${action}`,
      metadata: { ip, ipBlocked: !ipResult.allowed, identifierBlocked: !identifierResult.allowed },
    });
    return addSecurityHeaders(
      NextResponse.json(
        { allowed: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString() } }
      )
    );
  }

  return addSecurityHeaders(NextResponse.json({ allowed: true }));
}
