import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function makeSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
}

interface RouteContext {
  params: Promise<{ listId: string }>;
}

/** Verify list belongs to user. Returns the list row or null. */
async function verifyListOwnership(
  supabase: ReturnType<typeof makeSupabase>,
  listId: string,
  userId: string
) {
  const { data } = await supabase
    .from('watchlist_lists')
    .select('id')
    .eq('id', listId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

/** GET /api/watchlist/lists/[listId] — return items in this list */
async function getHandler(
  _req: NextRequest,
  ctx: RouteContext,
  session: { userId: string }
): Promise<NextResponse> {
  const { listId } = await ctx.params;

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const list = await verifyListOwnership(supabase, listId, session.userId);
  if (!list) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'List not found' }, { status: 404 })
    );
  }

  const { data, error } = await supabase
    .from('user_watchlist')
    .select('id, symbol, company_name, added_at, list_id')
    .eq('user_id', session.userId)
    .eq('list_id', listId)
    .order('added_at', { ascending: false });

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch items' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, items: data ?? [] }));
}

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** PATCH /api/watchlist/lists/[listId] — rename / recolor the list */
async function patchHandler(
  req: NextRequest,
  ctx: RouteContext,
  session: { userId: string }
): Promise<NextResponse> {
  const { listId } = await ctx.params;
  const body = await req.json().catch(() => null);

  const name = body?.name !== undefined ? (body.name as string)?.trim() : undefined;
  // color can be null (to clear), a string, or undefined (not provided)
  const color = body?.color !== undefined ? (body.color as string | null) : undefined;

  if (name === undefined && color === undefined) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'At least one of name or color is required' }, { status: 400 })
    );
  }

  if (name !== undefined && (name.length < 1 || name.length > 60)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'name must be 1–60 characters' }, { status: 400 })
    );
  }

  if (color !== undefined && color !== null && !COLOR_RE.test(color)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'color must be a valid hex color (e.g. #FF5733)' }, { status: 400 })
    );
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const list = await verifyListOwnership(supabase, listId, session.userId);
  if (!list) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'List not found' }, { status: 404 })
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (color !== undefined) updates.color = color;

  const { data, error } = await supabase
    .from('watchlist_lists')
    .update(updates)
    .eq('id', listId)
    .eq('user_id', session.userId)
    .select()
    .single();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to update list' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, list: data }));
}

/** DELETE /api/watchlist/lists/[listId] — delete the list (cascades items) */
async function deleteHandler(
  _req: NextRequest,
  ctx: RouteContext,
  session: { userId: string }
): Promise<NextResponse> {
  const { listId } = await ctx.params;

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const list = await verifyListOwnership(supabase, listId, session.userId);
  if (!list) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'List not found' }, { status: 404 })
    );
  }

  const { error } = await supabase
    .from('watchlist_lists')
    .delete()
    .eq('id', listId)
    .eq('user_id', session.userId);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to delete list' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
