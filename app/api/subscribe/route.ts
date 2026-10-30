/**
 * POST /api/subscribe { email, symbol }
 * A signed-out visitor asks for a company's earnings results by email.
 * Sends the double opt-in confirm email (lib/email/results-subscriptions.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/security/rate-limiter';
import { subscribe } from '@/lib/email/results-subscriptions';

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(`subscribe:${getClientIdentifier(request)}`, { windowMs: 10 * 60 * 1000, maxRequests: 5 });
  if (!limit.allowed) return NextResponse.json({ status: 'limited' }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { email?: unknown; symbol?: unknown } | null;
  if (typeof body?.email !== 'string' || typeof body?.symbol !== 'string') {
    return NextResponse.json({ status: 'invalid' }, { status: 400 });
  }
  try {
    const status = await subscribe(body.email, body.symbol);
    return NextResponse.json({ status }, { status: status === 'invalid' ? 400 : status === 'limited' ? 429 : 200 });
  } catch (error) {
    console.error('[subscribe] failed', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
