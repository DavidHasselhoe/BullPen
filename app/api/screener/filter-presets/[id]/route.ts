import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { canUseScreenAlerts, isSavedScreenScope, PRESET_COLUMNS, type SavedScreenScope } from '@/lib/screener/saved-screen-limits';
import { screenMatches } from '@/lib/screener/saved-screen-alerts';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/screener/filter-presets/[id]
async function patchHandler(
  request: NextRequest,
  context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const { id } = await (context as RouteContext).params;
  const body = await request.json().catch(() => ({}));

  // Generated Supabase types predate migration 196's columns.
  const { data: current, error: readErr } = (await supabase
    .from('screener_filter_presets')
    .select('filters, scope, alert_enabled')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle()) as unknown as {
      data: { filters: Record<string, unknown> | null; scope: SavedScreenScope; alert_enabled: boolean } | null;
      error: { message: string } | null;
    };
  if (readErr) return addSecurityHeaders(NextResponse.json({ error: readErr.message }, { status: 500 }));
  if (!current) return addSecurityHeaders(NextResponse.json({ error: 'Not found' }, { status: 404 }));

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = body.name.toString().trim();
    if (!name) return addSecurityHeaders(NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 }));
    if (name.length > 60) return addSecurityHeaders(NextResponse.json({ error: 'Name too long' }, { status: 400 }));
    updates.name = name;
  }

  if (body.filters !== undefined && body.filters && typeof body.filters === 'object') {
    updates.filters = body.filters;
  }
  if (body.scope !== undefined) {
    if (!isSavedScreenScope(body.scope)) return addSecurityHeaders(NextResponse.json({ error: 'Invalid scope' }, { status: 400 }));
    updates.scope = body.scope;
  }

  if (body.alert_enabled !== undefined) {
    if (typeof body.alert_enabled !== 'boolean') return addSecurityHeaders(NextResponse.json({ error: 'Invalid alert_enabled' }, { status: 400 }));
    if (body.alert_enabled) {
      const { data: u } = await supabase.from('users').select('account_tier, role, pro_bonus_until').eq('id', session.userId).maybeSingle();
      const row = u as { account_tier: number | null; role: string | null; pro_bonus_until: string | null } | null;
      if (!canUseScreenAlerts(row?.account_tier ?? null, row?.role ?? null, row?.pro_bonus_until ?? null)) {
        return addSecurityHeaders(NextResponse.json({ error: 'upgrade_required' }, { status: 403 }));
      }
    }
    updates.alert_enabled = body.alert_enabled;
  }

  // Record today's matches as the baseline whenever an alert starts or its
  // criteria change, so the first alert only lists stocks that are new from
  // here on. Reads screener_stats only: no market-data calls.
  const alertOn = (updates.alert_enabled ?? current.alert_enabled) as boolean;
  const turnedOn = updates.alert_enabled === true && !current.alert_enabled;
  if (alertOn && (turnedOn || updates.filters !== undefined || updates.scope !== undefined)) {
    const scope = (updates.scope ?? current.scope) as SavedScreenScope;
    const filters = (updates.filters ?? current.filters ?? {}) as Record<string, unknown>;
    const { tickers, error } = await screenMatches(supabase, filters, scope);
    if (error) return addSecurityHeaders(NextResponse.json({ error: 'Failed to check the screen' }, { status: 500 }));
    updates.last_matches = tickers;
    updates.checked_at = new Date().toISOString();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('screener_filter_presets')
    .update(updates)
    .eq('id', id)
    .eq('user_id', session.userId)
    .select(PRESET_COLUMNS)
    .single();

  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return addSecurityHeaders(NextResponse.json({ error: 'Not found' }, { status: 404 }));

  return addSecurityHeaders(NextResponse.json({ preset: data }));
}

// DELETE /api/screener/filter-presets/[id]
async function deleteHandler(
  _request: NextRequest,
  context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const { id } = await (context as RouteContext).params;

  const { error } = await supabase
    .from('screener_filter_presets')
    .delete()
    .eq('id', id)
    .eq('user_id', session.userId);

  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  return new NextResponse(null, { status: 204 });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
