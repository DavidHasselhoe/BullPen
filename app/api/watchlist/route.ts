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

/** GET /api/watchlist — list current user's watchlist */
async function getHandler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const { data, error } = await supabase
    .from('user_watchlist')
    .select('id, symbol, company_name, alerts_enabled, added_at')
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

  if (!symbol || symbol.length > 12 || !/^[A-Z0-9.^-]+$/.test(symbol)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid symbol' }, { status: 400 })
    );
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const { data, error } = await supabase
    .from('user_watchlist')
    .upsert(
      { user_id: session.userId, symbol, company_name },
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

/** DELETE /api/watchlist?symbol=AAPL — remove a symbol */
async function deleteHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim();
  if (!symbol) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'symbol is required' }, { status: 400 })
    );
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const { error } = await supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', session.userId)
    .eq('symbol', symbol);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to remove from watchlist' }, { status: 500 })
    );
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

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

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
