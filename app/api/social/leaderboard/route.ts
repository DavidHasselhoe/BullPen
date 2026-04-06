import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface LeaderboardEntry {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  account_tier: number | null;
  holdings_count: number;
  rank: number;
}

async function handler(
  _req: NextRequest,
  _ctx: unknown,
  _session: { userId: string }
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

  // Fetch all public holdings grouped by user, count only
  const { data: holdingRows, error } = await supabase
    .from('user_holdings')
    .select('user_id');

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch leaderboard' }, { status: 500 })
    );
  }

  // Count per user
  const countMap = new Map<string, number>();
  (holdingRows ?? []).forEach((h: { user_id: string }) => {
    countMap.set(h.user_id, (countMap.get(h.user_id) ?? 0) + 1);
  });

  if (countMap.size === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, leaderboard: [] }));
  }

  // Fetch public profiles only (profile_public !== false)
  const { data: profileRows } = await supabase
    .from('users')
    .select('id, username, full_name, avatar_url, account_tier, settings')
    .in('id', [...countMap.keys()]);

  const entries: Omit<LeaderboardEntry, 'rank'>[] = (profileRows ?? [])
    .filter((p: { settings: Record<string, unknown> | null }) => {
      const s = (p.settings as Record<string, unknown>) ?? {};
      return s.profile_public !== false;
    })
    .map((p: { id: string; username: string | null; full_name: string | null; avatar_url: string | null; account_tier: number | null }) => ({
      user_id: p.id,
      username: p.username,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      account_tier: p.account_tier,
      holdings_count: countMap.get(p.id) ?? 0,
    }))
    .filter((e) => e.holdings_count > 0)
    .sort((a, b) => b.holdings_count - a.holdings_count)
    .slice(0, 20);

  const leaderboard: LeaderboardEntry[] = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  return addSecurityHeaders(NextResponse.json({ success: true, leaderboard }));
}

export const GET = withAuth(handler);
