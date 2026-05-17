import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import type { Portfolio } from '@/lib/ai/portfolio-builder/schema';

const MAX_SAVED = 50;
const PREVIEW_COUNT = 5;

export interface SavedGeneration {
  id: string;
  thesis: string;
  portfolio: Portfolio;
  logoMap: Record<string, string | null>;
  replacedTickers: string[];
  createdAt: string;
}

async function getHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim() ?? '';
  const all = sp.get('all') === 'true' || q.length > 0;

  let query = supabase
    .from('portfolio_generations')
    .select('id, thesis, portfolio, logo_map, replaced_tickers, created_at')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(all ? MAX_SAVED : PREVIEW_COUNT);

  if (q) {
    // Escape % and _ in user input so they're treated literally inside ilike
    const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike('thesis', `%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));

  const generations: SavedGeneration[] = (data ?? []).map((row) => ({
    id: row.id,
    thesis: row.thesis,
    portfolio: row.portfolio as Portfolio,
    logoMap: (row.logo_map ?? {}) as Record<string, string | null>,
    replacedTickers: row.replaced_tickers ?? [],
    createdAt: row.created_at,
  }));

  // Also return total count so the client can render "View all (N)" accurately
  let total = generations.length;
  if (!all && !q) {
    const { count } = await supabase
      .from('portfolio_generations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.userId);
    total = count ?? generations.length;
  }

  return addSecurityHeaders(NextResponse.json({ generations, total }));
}

async function postHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const { thesis, portfolio, logoMap, replacedTickers } = await req.json();
  if (!thesis || !portfolio) {
    return addSecurityHeaders(NextResponse.json({ error: 'Missing required fields' }, { status: 400 }));
  }

  const supabase = createServerClient();

  // Insert new generation
  const { data: inserted, error: insertError } = await supabase
    .from('portfolio_generations')
    .insert({
      user_id: session.userId,
      thesis,
      portfolio,
      logo_map: logoMap ?? {},
      replaced_tickers: replacedTickers ?? [],
    })
    .select('id')
    .single();

  if (insertError) {
    return addSecurityHeaders(NextResponse.json({ error: insertError.message }, { status: 500 }));
  }

  // Trim: keep only the newest MAX_SAVED rows, delete the rest
  const { data: oldest } = await supabase
    .from('portfolio_generations')
    .select('id')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })
    .range(MAX_SAVED, 999);

  if (oldest && oldest.length > 0) {
    await supabase
      .from('portfolio_generations')
      .delete()
      .in('id', oldest.map((r) => r.id));
  }

  return addSecurityHeaders(NextResponse.json({ id: inserted.id }));
}

async function deleteHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await req.json();
  if (!id) return addSecurityHeaders(NextResponse.json({ error: 'Missing id' }, { status: 400 }));

  const supabase = createServerClient();
  await supabase
    .from('portfolio_generations')
    .delete()
    .eq('id', id)
    .eq('user_id', session.userId);

  return addSecurityHeaders(NextResponse.json({ ok: true }));
}

export const GET    = withAuth(getHandler);
export const POST   = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
