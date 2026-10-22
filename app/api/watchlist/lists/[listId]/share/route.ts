import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

interface RouteContext {
  params: Promise<{ listId: string }>;
}

async function ownList(listId: string, userId: string) {
  const { data } = await createServerClient()
    .from('watchlist_lists')
    .select('id, share_token')
    .eq('id', listId)
    .eq('user_id', userId)
    .maybeSingle();
  return data as { id: string; share_token: string | null } | null;
}

/**
 * POST /api/watchlist/lists/[listId]/share: turn on the public read-only page
 * (/lists/<token>, migration 179). Idempotent: a shared list keeps its link.
 */
async function post(_req: NextRequest, ctx: RouteContext, session: { userId: string }): Promise<NextResponse> {
  const { listId } = await ctx.params;
  const list = await ownList(listId, session.userId);
  if (!list) return addSecurityHeaders(NextResponse.json({ success: false, error: 'List not found' }, { status: 404 }));
  if (list.share_token) return addSecurityHeaders(NextResponse.json({ success: true, token: list.share_token }));

  // 12 random bytes: 16 url-safe characters, unguessable.
  const token = randomBytes(12).toString('base64url');
  const { error } = await createServerClient()
    .from('watchlist_lists')
    .update({ share_token: token, shared_at: new Date().toISOString() } as never)
    .eq('id', listId)
    .eq('user_id', session.userId);
  if (error) return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to share list' }, { status: 500 }));
  return addSecurityHeaders(NextResponse.json({ success: true, token }));
}

/**
 * DELETE: stop sharing. The token is cleared, so the old link 404s for good
 * (sharing again makes a new one), and the cached page is purged at once
 * instead of living out its revalidate window.
 */
async function del(_req: NextRequest, ctx: RouteContext, session: { userId: string }): Promise<NextResponse> {
  const { listId } = await ctx.params;
  const list = await ownList(listId, session.userId);
  if (!list) return addSecurityHeaders(NextResponse.json({ success: false, error: 'List not found' }, { status: 404 }));

  const { error } = await createServerClient()
    .from('watchlist_lists')
    .update({ share_token: null, shared_at: null } as never)
    .eq('id', listId)
    .eq('user_id', session.userId);
  if (error) return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to stop sharing' }, { status: 500 }));
  if (list.share_token) revalidatePath(`/lists/${list.share_token}`);
  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const POST = withAuth(post, { rateLimit: { windowMs: 60_000, maxRequests: 20 } });
export const DELETE = withAuth(del, { rateLimit: { windowMs: 60_000, maxRequests: 20 } });
