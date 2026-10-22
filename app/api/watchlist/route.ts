import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getLogoUrlsForTickers } from '@/lib/logos/logos-db';
import { addWatchlistItem } from '@/lib/watchlist/add-item';
import { removeWatchlistItems } from '@/lib/watchlist/remove-item';
import { getDisplayNames } from '@/lib/market-data/display-names';

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

  const rows = data ?? [];
  const symbols = rows.map((r) => r.symbol);
  const [logoUrls, displayNames] = await Promise.all([getLogoUrlsForTickers(symbols), getDisplayNames(symbols)]);
  const watchlist = rows.map((row) => ({
    ...row,
    logo_url: logoUrls.get(row.symbol) ?? null,
    display_name: displayNames.get(row.symbol.toUpperCase()) ?? null,
  }));

  return addSecurityHeaders(NextResponse.json({ success: true, watchlist }));
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
  let list_id = (body?.list_id as string | undefined) ?? null;

  if (!symbol || symbol.length > 12 || !/^[A-Z0-9.^-]+$/.test(symbol)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid symbol' }, { status: 400 })
    );
  }

  const supabase = createServerClient();

  if (list_id) {
    // A list_id was provided — verify it belongs to the calling user.
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
  } else {
    // user_watchlist.list_id has been NOT NULL since migration 047, so every
    // insert needs a real list — resolve to the caller's first list, or
    // create a default one if they have none yet. Mirrors the client-side
    // fallback app/watchlist/page.tsx's handleAdd already uses for the same
    // reason; doing it here means every caller gets it for free instead of
    // each one having to duplicate the resolve-or-create dance.
    const { data: firstList } = await supabase
      .from('watchlist_lists')
      .select('id')
      .eq('user_id', session.userId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstList) {
      list_id = firstList.id;
    } else {
      const { data: newList } = await supabase
        .from('watchlist_lists')
        .insert({ user_id: session.userId, name: 'Watchlist 1' })
        .select('id')
        .single();
      // Two first adds at once both find no list and both insert; UNIQUE
      // (user_id, name) rejects the second. Seen on production when the
      // onboarding flush ran twice at sign-in. Use the list the winner made.
      const { data: resolved } = newList
        ? { data: newList }
        : await supabase
            .from('watchlist_lists')
            .select('id')
            .eq('user_id', session.userId)
            .order('position', { ascending: true })
            .limit(1)
            .maybeSingle();
      if (!resolved) {
        return addSecurityHeaders(
          NextResponse.json({ success: false, error: 'Failed to create a default watchlist' }, { status: 500 })
        );
      }
      list_id = resolved.id;
    }
  }

  const { data, error } = await addWatchlistItem(supabase, {
    user_id: session.userId,
    symbol,
    company_name: company_name ?? symbol,
    // Set by both branches above: the caller's own list, or their first/new one.
    list_id: list_id as string,
  }, { restore: body?.restore === true });

  if (error || !data) {
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

  const { error } = await removeWatchlistItems(supabase, { user_id: session.userId, symbol, list_id });

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to remove from watchlist' }, { status: 500 })
    );
  }

  // Unwatched entirely, so its alerts are no longer relevant. Taken out of
  // one list while still in another, it is still watched and they stay.
  const { count: stillWatched } = await supabase
    .from('user_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.userId)
    .eq('symbol', symbol);
  if (!stillWatched) {
    // Fire-and-forget; a failure here is non-critical.
    supabase
      .from('user_alerts')
      .delete()
      .eq('user_id', session.userId)
      .eq('symbol', symbol)
      .then(({ error: alertErr }) => {
        if (alertErr) console.warn('[DELETE /api/watchlist] Failed to remove alerts for', symbol, alertErr);
      });
  }

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
