import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface ThesisReply {
  id: string;
  thesis_id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  content: string;
  created_at: string;
  is_own: boolean;
}

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

/** GET /api/social/thesis/[symbol]/replies */
async function getHandler(
  _req: NextRequest,
  context: { params: Promise<{ symbol: string }> },
  session: { userId: string },
): Promise<NextResponse> {
  const { symbol: thesisId } = await context.params;
  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const { data: rows, error } = await supabase
    .from('stock_thesis_replies')
    .select('id, thesis_id, user_id, content, created_at')
    .eq('thesis_id', thesisId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch replies' }, { status: 500 })
    );
  }

  if (!rows || rows.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, replies: [] }));
  }

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profileRows } = await supabase
    .from('users')
    .select('id, username, full_name, avatar_url')
    .in('id', userIds);

  const profileMap = new Map(
    (profileRows ?? []).map((p) => [p.id, p])
  );

  const replies: ThesisReply[] = rows.map((r) => {
    const p = profileMap.get(r.user_id) ?? { username: null, full_name: null, avatar_url: null };
    return { ...r, username: p.username ?? null, full_name: p.full_name ?? null, avatar_url: p.avatar_url ?? null, is_own: r.user_id === session.userId };
  });

  return addSecurityHeaders(NextResponse.json({ success: true, replies }));
}

/** POST /api/social/thesis/[symbol]/replies */
async function postHandler(
  req: NextRequest,
  context: { params: Promise<{ symbol: string }> },
  session: { userId: string },
): Promise<NextResponse> {
  const { symbol: thesisId } = await context.params;

  const body = await req.json().catch(() => null);
  const content = (body?.content as string | undefined)?.trim();

  if (!content || content.length < 1 || content.length > 280) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Content must be 1–280 characters' }, { status: 400 })
    );
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  // Verify the parent thesis exists
  const { data: thesis } = await supabase
    .from('stock_theses')
    .select('id')
    .eq('id', thesisId)
    .single();

  if (!thesis) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Thesis not found' }, { status: 404 })
    );
  }

  const { data, error } = await supabase
    .from('stock_thesis_replies')
    .insert({ thesis_id: thesisId, user_id: session.userId, content })
    .select()
    .single();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to post reply' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, reply: data }));
}

export const GET  = withAuth(getHandler);
export const POST = withAuth(postHandler);
