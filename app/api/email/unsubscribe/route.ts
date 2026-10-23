/**
 * POST /api/email/unsubscribe?t=<token>
 *
 * Turns the morning alert email off. Two callers: a mail client's own
 * Unsubscribe button (RFC 8058 one-click, from the List-Unsubscribe header),
 * which needs a plain 200, and the confirm button on /email/unsubscribe, which
 * sends `from=page` and is redirected back to see the result. POST only: a
 * GET would let link scanners in mail filters unsubscribe people.
 */

import { NextRequest, NextResponse } from 'next/server';
import { disableAlertEmail, readUnsubscribeToken } from '@/lib/email/alert-email';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const userId = readUnsubscribeToken(token);
  const ok = userId ? await disableAlertEmail(userId) : false;

  const form = await request.formData().catch(() => null);
  if (form?.get('from') === 'page') {
    const back = new URL('/email/unsubscribe', request.nextUrl.origin);
    back.searchParams.set(ok ? 'done' : 'failed', '1');
    return NextResponse.redirect(back, 303);
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
