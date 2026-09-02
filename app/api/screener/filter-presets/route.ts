import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

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
    .select('id, name, filters, position, created_at, updated_at')
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

  if (!name) return addSecurityHeaders(NextResponse.json({ error: 'Name is required' }, { status: 400 }));
  if (name.length > 60) return addSecurityHeaders(NextResponse.json({ error: 'Name too long' }, { status: 400 }));

  const { count } = await supabase
    .from('screener_filter_presets')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.userId);

  const { data, error } = await supabase
    .from('screener_filter_presets')
    .insert({ user_id: session.userId, name, filters, position: count ?? 0 })
    .select('id, name, filters, position, created_at, updated_at')
    .single();

  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  return addSecurityHeaders(NextResponse.json({ preset: data }, { status: 201 }));
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
