import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface FeedItem {
  id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  symbol: string;
  company_name: string;
  added_at: string;
}

async function handler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
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

  // Who does the current user follow?
  const { data: followRows } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', session.userId);

  const followingIds = (followRows ?? []).map((r: { following_id: string }) => r.following_id);

  if (followingIds.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, feed: [] }));
  }

  // Fetch recently-added public holdings from followed users (last 50)
  const { data: holdingRows, error } = await supabase
    .from('user_holdings')
    .select('id, user_id, symbol, company_name, created_at')
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch feed' }, { status: 500 })
    );
  }

  if (!holdingRows || holdingRows.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, feed: [] }));
  }

  // Fetch user profiles for those users (only public ones)
  const userIds = [...new Set(holdingRows.map((h: { user_id: string }) => h.user_id))];
  const { data: profileRows } = await supabase
    .from('users')
    .select('id, username, full_name, avatar_url, settings')
    .in('id', userIds);

  const profileMap = new Map<string, { username: string | null; full_name: string | null; avatar_url: string | null }>();
  (profileRows ?? []).forEach((p: { id: string; username: string | null; full_name: string | null; avatar_url: string | null; settings: Record<string, unknown> | null }) => {
    const settings = p.settings ?? {};
    if (settings.profile_public !== false) {
      profileMap.set(p.id, { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url });
    }
  });

  const feed: FeedItem[] = holdingRows
    .filter((h: { user_id: string }) => profileMap.has(h.user_id))
    .map((h: { id: string; user_id: string; symbol: string; company_name: string; created_at: string }) => {
      const p = profileMap.get(h.user_id)!;
      return {
        id: h.id,
        user_id: h.user_id,
        username: p.username,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        symbol: h.symbol,
        company_name: h.company_name,
        added_at: h.created_at,
      };
    });

  return addSecurityHeaders(NextResponse.json({ success: true, feed }));
}

export const GET = withAuth(handler);
