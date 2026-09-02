import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

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

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = body.name.toString().trim();
    if (!name) return addSecurityHeaders(NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 }));
    if (name.length > 60) return addSecurityHeaders(NextResponse.json({ error: 'Name too long' }, { status: 400 }));
    updates.name = name;
  }

  if (body.filters !== undefined && typeof body.filters === 'object') {
    updates.filters = body.filters;
  }

  const { data, error } = await supabase
    .from('screener_filter_presets')
    .update(updates)
    .eq('id', id)
    .eq('user_id', session.userId)
    .select('id, name, filters, position, created_at, updated_at')
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
