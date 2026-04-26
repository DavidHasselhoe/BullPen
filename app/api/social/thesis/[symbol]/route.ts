import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface Thesis {
  id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  symbol: string;
  content: string;
  sentiment: 'bull' | 'bear' | 'neutral';
  created_at: string;
  updated_at: string;
  is_own: boolean;
  reply_count: number;
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

/** GET /api/social/thesis/[symbol] — list theses for a stock */
async function getHandler(
  req: NextRequest,
  context: { params: Promise<{ symbol: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { symbol } = await context.params;
  const upperSymbol = symbol.toUpperCase();
  const sentiment = req.nextUrl.searchParams.get('sentiment'); // optional filter

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  let query = supabase
    .from('stock_theses')
    .select('id, user_id, symbol, content, sentiment, created_at, updated_at')
    .eq('symbol', upperSymbol)
    .order('created_at', { ascending: false })
    .limit(50);

  if (sentiment && ['bull', 'bear', 'neutral'].includes(sentiment)) {
    query = query.eq('sentiment', sentiment);
  }

  const { data: rows, error } = await query;

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch theses' }, { status: 500 })
    );
  }

  if (!rows || rows.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, theses: [] }));
  }

  // Join with user profiles + reply counts in parallel
  const thesisIds = rows.map((r: { id: string }) => r.id);
  const userIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];

  const [{ data: profileRows }, { data: replyCounts }] = await Promise.all([
    supabase.from('users').select('id, username, full_name, avatar_url').in('id', userIds),
    supabase.from('stock_thesis_replies').select('thesis_id').in('thesis_id', thesisIds),
  ]);

  const profileMap = new Map<string, { username: string | null; full_name: string | null; avatar_url: string | null }>();
  (profileRows ?? []).forEach((p: { id: string; username: string | null; full_name: string | null; avatar_url: string | null }) => {
    profileMap.set(p.id, { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url });
  });

  const replyCountMap = new Map<string, number>();
  (replyCounts ?? []).forEach((r: { thesis_id: string }) => {
    replyCountMap.set(r.thesis_id, (replyCountMap.get(r.thesis_id) ?? 0) + 1);
  });

  const theses: Thesis[] = rows.map((r: { id: string; user_id: string; symbol: string; content: string; sentiment: 'bull' | 'bear' | 'neutral'; created_at: string; updated_at: string }) => {
    const p = profileMap.get(r.user_id) ?? { username: null, full_name: null, avatar_url: null };
    return { ...r, ...p, is_own: r.user_id === session.userId, reply_count: replyCountMap.get(r.id) ?? 0 };
  });

  return addSecurityHeaders(NextResponse.json({ success: true, theses }));
}

/** POST /api/social/thesis/[symbol] — create or update own thesis */
async function postHandler(
  req: NextRequest,
  context: { params: Promise<{ symbol: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { symbol } = await context.params;
  const upperSymbol = symbol.toUpperCase();

  const body = await req.json().catch(() => null);
  const content = (body?.content as string | undefined)?.trim();
  const sentiment = body?.sentiment as string | undefined;

  if (!content || content.length < 1 || content.length > 500) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Content must be 1–500 characters' }, { status: 400 })
    );
  }
  if (!sentiment || !['bull', 'bear', 'neutral'].includes(sentiment)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid sentiment' }, { status: 400 })
    );
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  // Upsert: one thesis per user per symbol
  const { data, error } = await supabase
    .from('stock_theses')
    .upsert(
      {
        user_id: session.userId,
        symbol: upperSymbol,
        content,
        sentiment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,symbol' }
    )
    .select()
    .single();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to save thesis' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, thesis: data }));
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
