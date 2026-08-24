import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { canCreateWatchlist } from '@/lib/watchlist/limits';

/** GET /api/watchlist/lists — return all user's lists with item counts */
async function getHandler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  const { data: lists, error: listsError } = await supabase
    .from('watchlist_lists')
    .select('id, name, color, position, created_at')
    .eq('user_id', session.userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (listsError) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch lists' }, { status: 500 })
    );
  }

  if (!lists || lists.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, lists: [] }));
  }

  // Fetch item counts per list
  const listIds = lists.map((l) => l.id);
  const { data: countRows, error: countError } = await supabase
    .from('user_watchlist')
    .select('list_id')
    .eq('user_id', session.userId)
    .in('list_id', listIds);

  if (countError) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch item counts' }, { status: 500 })
    );
  }

  const countMap: Record<string, number> = {};
  for (const row of countRows ?? []) {
    if (row.list_id) {
      countMap[row.list_id] = (countMap[row.list_id] ?? 0) + 1;
    }
  }

  const result = lists.map((l) => ({
    ...l,
    item_count: countMap[l.id] ?? 0,
  }));

  return addSecurityHeaders(NextResponse.json({ success: true, lists: result }));
}

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** POST /api/watchlist/lists — create a new list (paywall-guarded) */
async function postHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const name = (body?.name as string | undefined)?.trim();
  const color = (body?.color as string | undefined)?.trim() || null;

  if (!name || name.length < 1 || name.length > 60) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'name must be 1–60 characters' }, { status: 400 })
    );
  }

  if (color && !COLOR_RE.test(color)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'color must be a valid hex color (e.g. #FF5733)' }, { status: 400 })
    );
  }

  const supabase = createServerClient();

  // Fetch tier and existing list count in parallel
  const [{ data: userRow }, { count, error: countError }] = await Promise.all([
    supabase.from('users').select('account_tier, pro_bonus_until').eq('id', session.userId).maybeSingle(),
    supabase.from('watchlist_lists').select('id', { count: 'exact', head: true }).eq('user_id', session.userId),
  ]);

  const tier = (userRow?.account_tier as number | null) ?? null;
  const proBonusUntil = (userRow as { pro_bonus_until?: string | null } | null)?.pro_bonus_until ?? null;

  if (countError) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to check list count' }, { status: 500 })
    );
  }

  if (!canCreateWatchlist(count ?? 0, tier, proBonusUntil)) {
    return addSecurityHeaders(
      NextResponse.json(
        { error: 'upgrade_required' },
        { status: 403 }
      )
    );
  }

  const { data, error } = await supabase
    .from('watchlist_lists')
    .insert({ user_id: session.userId, name, color, position: count ?? 0 })
    .select()
    .single();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to create list' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, list: data }, { status: 201 }));
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
