import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

interface RouteContext {
  params: Promise<{ listId: string }>;
}

type SupabaseClient = ReturnType<typeof createServerClient>;

/** Verify list belongs to user. Returns the list row or null. */
async function verifyListOwnership(
  supabase: SupabaseClient,
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

/** POST /api/watchlist/lists/[listId]/items — add symbol to specific list */
async function postHandler(
  req: NextRequest,
  ctx: RouteContext,
  session: { userId: string }
): Promise<NextResponse> {
  const { listId } = await ctx.params;
  const body = await req.json().catch(() => null);

  const symbol = (body?.symbol as string | undefined)?.toUpperCase().trim();
  const company_name = (body?.company_name as string | undefined)?.trim() || symbol;

  if (!symbol || symbol.length > 12 || !/^[A-Z0-9.^-]+$/.test(symbol)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid symbol' }, { status: 400 })
    );
  }

  const supabase = createServerClient();

  const list = await verifyListOwnership(supabase, listId, session.userId);
  if (!list) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'List not found' }, { status: 404 })
    );
  }

  // Upsert with conflict on (user_id, symbol); update list_id to point to the new list
  const { data, error } = await supabase
    .from('user_watchlist')
    .upsert(
      { user_id: session.userId, symbol, company_name, list_id: listId },
      { onConflict: 'user_id,symbol', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to add item to list' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, item: data }, { status: 201 }));
}

/** DELETE /api/watchlist/lists/[listId]/items?symbol=AAPL — remove symbol from specific list */
async function deleteHandler(
  req: NextRequest,
  ctx: RouteContext,
  session: { userId: string }
): Promise<NextResponse> {
  const { listId } = await ctx.params;
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim();

  if (!symbol) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'symbol query param is required' }, { status: 400 })
    );
  }

  const supabase = createServerClient();

  const list = await verifyListOwnership(supabase, listId, session.userId);
  if (!list) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'List not found' }, { status: 404 })
    );
  }

  const { error } = await supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', session.userId)
    .eq('symbol', symbol)
    .eq('list_id', listId);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to remove item from list' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
