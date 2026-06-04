import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

/** GET /api/watchlist — list current user's watchlist */
async function getHandler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('user_watchlist')
    .select('id, symbol, company_name, alerts_enabled, added_at, list_id')
    .eq('user_id', session.userId)
    .order('added_at', { ascending: false });

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch watchlist' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, watchlist: data ?? [] }));
}

/** POST /api/watchlist — add a symbol */
async function postHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const symbol = (body?.symbol as string | undefined)?.toUpperCase().trim();
  const company_name = (body?.company_name as string | undefined)?.trim() || symbol;
  const list_id = (body?.list_id as string | undefined) ?? null;

  if (!symbol || symbol.length > 12 || !/^[A-Z0-9.^-]+$/.test(symbol)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid symbol' }, { status: 400 })
    );
  }

  const supabase = createServerClient();

  // If a list_id was provided, verify it belongs to the calling user
  if (list_id) {
    const { data: listRow } = await supabase
      .from('watchlist_lists')
      .select('id')
      .eq('id', list_id)
      .eq('user_id', session.userId)
      .maybeSingle();
    if (!listRow) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'List not found' }, { status: 404 })
      );
    }
  }

  const { data, error } = await supabase
    .from('user_watchlist')
    .upsert(
      { user_id: session.userId, symbol, company_name, ...(list_id ? { list_id } : {}) },
      { onConflict: 'user_id,symbol', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to add to watchlist' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, item: data }));
}

/** DELETE /api/watchlist?symbol=AAPL[&list_id=uuid] — remove a symbol */
async function deleteHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim();
  const list_id = req.nextUrl.searchParams.get('list_id') ?? null;

  if (!symbol) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'symbol is required' }, { status: 400 })
    );
  }

  const supabase = createServerClient();

  let query = supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', session.userId)
    .eq('symbol', symbol);

  if (list_id) {
    query = query.eq('list_id', list_id);
  }

  const { error } = await query;

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to remove from watchlist' }, { status: 500 })
    );
  }

  // Remove all alerts for this symbol — if the user is unwatching, alerts are no longer relevant.
  // Fire-and-forget; a failure here is non-critical.
  supabase
    .from('user_alerts')
    .delete()
    .eq('user_id', session.userId)
    .eq('symbol', symbol)
    .then(({ error: alertErr }) => {
      if (alertErr) console.warn('[DELETE /api/watchlist] Failed to remove alerts for', symbol, alertErr);
    });

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

/** PATCH /api/watchlist — toggle alerts_enabled for a symbol */
async function patchHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const symbol = (body?.symbol as string | undefined)?.toUpperCase().trim();
  const alerts_enabled = body?.alerts_enabled;

  if (!symbol || typeof alerts_enabled !== 'boolean') {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'symbol and alerts_enabled are required' }, { status: 400 })
    );
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from('user_watchlist')
    .update({ alerts_enabled })
    .eq('user_id', session.userId)
    .eq('symbol', symbol);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to update alert setting' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, alerts_enabled }));
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
