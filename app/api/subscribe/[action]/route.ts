/**
 * GET /api/subscribe/confirm?token=…     the link in the confirm email
 * GET /api/subscribe/unsubscribe?token=… the link in every results email
 * POST /api/subscribe/unsubscribe?token=… one-click unsubscribe (RFC 8058)
 *
 * Both land back on the company's page, where the signup card says what happened.
 */

import { NextRequest, NextResponse } from 'next/server';
import { confirmSubscription, unsubscribe } from '@/lib/email/results-subscriptions';
import { slugToAssetPath } from '@/lib/assets/asset-type';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run(request: NextRequest, action: string): Promise<string | null> {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!UUID_RE.test(token)) return null;
  if (action === 'confirm') return confirmSubscription(token);
  if (action === 'unsubscribe') return unsubscribe(token);
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const symbol = await run(request, action);
  const url = new URL(symbol ? slugToAssetPath(symbol) : '/', request.nextUrl.origin);
  if (symbol) url.searchParams.set('email', action === 'confirm' ? 'confirmed' : 'unsubscribed');
  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== 'unsubscribe') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const symbol = await run(request, action);
  return NextResponse.json({ ok: !!symbol }, { status: symbol ? 200 : 404 });
}
