import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { createServerClient as createServiceClient } from '@/lib/supabase/client';
import { cookies } from 'next/headers';

export interface LeaderboardEntry {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  account_tier: number | null;
  rank: number;
  // Holdings mode
  holdings_count?: number;
  // XP (Academy) mode
  total_xp?: number;
  level?: number;
  current_streak?: number;
}

interface ProfileRow {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  account_tier: number | null;
  settings: Record<string, unknown> | null;
}

function isPublic(p: ProfileRow): boolean {
  const s = (p.settings as Record<string, unknown>) ?? {};
  return s.profile_public !== false;
}

async function handler(
  req: NextRequest,
  _ctx: unknown,
  _session: { userId: string }
): Promise<NextResponse> {
  const mode = req.nextUrl.searchParams.get('mode') === 'xp' ? 'xp' : 'holdings';

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

  // ── Academy XP mode ──────────────────────────────────────────────────────
  // academy_user_stats is owner-only under RLS, so rank with the service client
  // and re-apply the public-profile filter in code.
  if (mode === 'xp') {
    const service = createServiceClient();
    const { data: statRows, error } = await service
      .from('academy_user_stats')
      .select('user_id, total_xp, level, current_streak')
      .gt('total_xp', 0)
      .order('total_xp', { ascending: false })
      .limit(100);

    if (error) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Failed to fetch leaderboard' }, { status: 500 })
      );
    }

    const rows = (statRows ?? []) as { user_id: string; total_xp: number; level: number; current_streak: number }[];
    if (rows.length === 0) {
      return addSecurityHeaders(NextResponse.json({ success: true, leaderboard: [] }));
    }

    const statMap = new Map(rows.map((r) => [r.user_id, r]));
    const { data: profileRows } = await service
      .from('users')
      .select('id, username, full_name, avatar_url, account_tier, settings')
      .in('id', rows.map((r) => r.user_id));

    const entries: Omit<LeaderboardEntry, 'rank'>[] = (profileRows ?? [])
      .filter((p: ProfileRow) => isPublic(p))
      .map((p: ProfileRow) => {
        const s = statMap.get(p.id)!;
        return {
          user_id: p.id,
          username: p.username,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          account_tier: p.account_tier,
          total_xp: s.total_xp,
          level: s.level,
          current_streak: s.current_streak,
        };
      })
      .sort((a, b) => (b.total_xp ?? 0) - (a.total_xp ?? 0))
      .slice(0, 20);

    const leaderboard: LeaderboardEntry[] = entries.map((e, i) => ({ ...e, rank: i + 1 }));
    return addSecurityHeaders(NextResponse.json({ success: true, leaderboard }));
  }

  // ── Holdings mode (default, unchanged) ─────────────────────────────────────
  const { data: holdingRows, error } = await supabase
    .from('user_holdings')
    .select('user_id');

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch leaderboard' }, { status: 500 })
    );
  }

  const countMap = new Map<string, number>();
  (holdingRows ?? []).forEach((h: { user_id: string }) => {
    countMap.set(h.user_id, (countMap.get(h.user_id) ?? 0) + 1);
  });

  if (countMap.size === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, leaderboard: [] }));
  }

  const { data: profileRows } = await supabase
    .from('users')
    .select('id, username, full_name, avatar_url, account_tier, settings')
    .in('id', [...countMap.keys()]);

  const entries: Omit<LeaderboardEntry, 'rank'>[] = (profileRows ?? [])
    .filter((p: ProfileRow) => isPublic(p))
    .map((p: ProfileRow) => ({
      user_id: p.id,
      username: p.username,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      account_tier: p.account_tier,
      holdings_count: countMap.get(p.id) ?? 0,
    }))
    .filter((e) => (e.holdings_count ?? 0) > 0)
    .sort((a, b) => (b.holdings_count ?? 0) - (a.holdings_count ?? 0))
    .slice(0, 20);

  const leaderboard: LeaderboardEntry[] = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  return addSecurityHeaders(NextResponse.json({ success: true, leaderboard }));
}

export const GET = withAuth(handler);
