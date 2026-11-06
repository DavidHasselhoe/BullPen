import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { canCreateSavedScreen, isSavedScreenScope, PRESET_COLUMNS } from '@/lib/screener/saved-screen-limits';

export const dynamic = 'force-dynamic';

// GET /api/screener/filter-presets
async function getHandler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('screener_filter_presets')
    .select(PRESET_COLUMNS)
    .eq('user_id', session.userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  return addSecurityHeaders(NextResponse.json({ presets: data ?? [] }));
}

// POST /api/screener/filter-presets
async function postHandler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const body = await request.json().catch(() => ({}));

  const name = (body.name ?? '').toString().trim();
  const filters = (body.filters && typeof body.filters === 'object') ? body.filters : {};
  const scope = isSavedScreenScope(body.scope) ? body.scope : 'sp500';

  if (!name) return addSecurityHeaders(NextResponse.json({ error: 'Name is required' }, { status: 400 }));
  if (name.length > 60) return addSecurityHeaders(NextResponse.json({ error: 'Name too long' }, { status: 400 }));

  const [{ data: userRow }, { count, error: countError }] = await Promise.all([
    supabase.from('users').select('account_tier, role, pro_bonus_until').eq('id', session.userId).maybeSingle(),
    supabase.from('screener_filter_presets').select('id', { count: 'exact', head: true }).eq('user_id', session.userId),
  ]);
  if (countError) return addSecurityHeaders(NextResponse.json({ error: 'Failed to check saved screens' }, { status: 500 }));

  const u = userRow as { account_tier: number | null; role: string | null; pro_bonus_until: string | null } | null;
  if (!canCreateSavedScreen(count ?? 0, u?.account_tier ?? null, u?.role ?? null, u?.pro_bonus_until ?? null)) {
    return addSecurityHeaders(NextResponse.json({ error: 'upgrade_required' }, { status: 403 }));
  }

  // Generated Supabase types predate migration 196's scope column.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('screener_filter_presets')
    .insert({ user_id: session.userId, name, filters, scope, position: count ?? 0 })
    .select(PRESET_COLUMNS)
    .single();

  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  return addSecurityHeaders(NextResponse.json({ preset: data }, { status: 201 }));
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
