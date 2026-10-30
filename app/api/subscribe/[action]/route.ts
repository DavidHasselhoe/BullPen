/**
 * GET /api/subscribe/confirm?token=…      the link in the confirm email
 * GET /api/subscribe/unsubscribe?token=…  the link in every results email
 * POST /api/subscribe/{confirm,unsubscribe}?token=…
 *
 * GET changes nothing: mail link scanners (Safe Links, Mimecast) open every
 * link, which would confirm sign-ups nobody clicked and unsubscribe people who
 * didn't ask. It lands on the company's page, where a button POSTs
 * (EarningsEmailLanding). Mail providers POST unsubscribe directly (RFC 8058
 * one-click, exempt from the middleware origin check).
 */

import { NextRequest, NextResponse } from 'next/server';
import { confirmSubscription, symbolForToken, unsubscribe } from '@/lib/email/results-subscriptions';
import { slugToAssetPath } from '@/lib/assets/asset-type';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['confirm', 'unsubscribe']);

function tokenOf(request: NextRequest): string | null {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  return UUID_RE.test(token) ? token : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const token = tokenOf(request);
  const symbol = token && ACTIONS.has(action) ? await symbolForToken(token) : null;
  const url = new URL(symbol ? slugToAssetPath(symbol) : '/', request.nextUrl.origin);
  if (symbol && token) {
    url.searchParams.set('email', action);
    url.searchParams.set('token', token);
  }
  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const token = tokenOf(request);
  if (!token || !ACTIONS.has(action)) return NextResponse.json({ ok: false }, { status: 404 });
  const symbol = action === 'confirm' ? await confirmSubscription(token) : await unsubscribe(token);
  return NextResponse.json({ ok: !!symbol }, { status: symbol ? 200 : 404 });
}
