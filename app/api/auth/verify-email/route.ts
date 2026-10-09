import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/security/api-security';
import { getVerificationState, sendVerificationEmail } from '@/lib/auth/email-verification';

/**
 * GET  → { verified, email }  (polled by VerifyEmailNotice)
 * POST → sends the verification email unless already verified.
 */
export const GET = withAuth(async (_req: NextRequest, _ctx: unknown, { userId }) => {
  return NextResponse.json(await getVerificationState(userId));
}, { rateLimit: { windowMs: 60_000, maxRequests: 30 } });

export const POST = withAuth(async (_req: NextRequest, _ctx: unknown, { userId }) => {
  const state = await getVerificationState(userId);
  if (state.verified) return NextResponse.json({ verified: true });
  if (!state.email) return NextResponse.json({ error: 'no_email' }, { status: 400 });
  try {
    await sendVerificationEmail(userId, state.email);
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error('[auth/verify-email] send failed', err);
    return NextResponse.json({ error: 'send_failed' }, { status: 502 });
  }
}, { rateLimit: { windowMs: 10 * 60_000, maxRequests: 5 } });
