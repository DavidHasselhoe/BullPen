import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

// GET /api/screener/views
async function getHandler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('screener_views')
    .select('id, name, tickers, position, created_at, updated_at')
    .eq('user_id', session.userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  return addSecurityHeaders(NextResponse.json({ views: data ?? [] }));
}

// POST /api/screener/views
async function postHandler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const body = await request.json().catch(() => ({}));

  const name = (body.name ?? '').toString().trim();
  const tickers: string[] = (body.tickers ?? [])
    .map((t: unknown) => String(t).trim().toUpperCase())
    .filter(Boolean);

  if (!name) return addSecurityHeaders(NextResponse.json({ error: 'Name is required' }, { status: 400 }));
  if (name.length > 60) return addSecurityHeaders(NextResponse.json({ error: 'Name too long' }, { status: 400 }));

  const { count } = await supabase
    .from('screener_views')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.userId);

  const { data, error } = await supabase
    .from('screener_views')
    .insert({ user_id: session.userId, name, tickers, position: count ?? 0 })
    .select('id, name, tickers, position, created_at, updated_at')
    .single();

  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  return addSecurityHeaders(NextResponse.json({ view: data }, { status: 201 }));
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
