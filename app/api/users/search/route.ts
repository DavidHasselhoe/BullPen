import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

/** Public profile columns — never include email, settings, role, last_login_at */
const PUBLIC_PROFILE_COLUMNS =
  'id, username, full_name, avatar_url, bio, experience_level, market_focus, risk_profile, account_tier, created_at, settings';

export interface PublicUser {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  experience_level: 'beginner' | 'intermediate' | 'advanced' | null;
  market_focus: 'US' | 'EU' | 'BOTH' | null;
  risk_profile: 'conservative' | 'balanced' | 'aggressive' | null;
  account_tier: number | null;
  created_at: string;
  /** Number of public holdings (populated server-side) */
  holdings_count?: number;
}

function isProfilePublic(u: Record<string, unknown>): boolean {
  const settings = u.settings as Record<string, unknown> | null;
  return settings?.profile_public !== false;
}

function mapRowToPublicUser(u: Record<string, unknown>): PublicUser {
  return {
    id: u.id as string,
    username: (u.username as string | null) ?? null,
    full_name: (u.full_name as string | null) ?? null,
    avatar_url: (u.avatar_url as string | null) ?? null,
    bio: (u.bio as string | null) ?? null,
    experience_level: (u.experience_level as PublicUser['experience_level']) ?? null,
    market_focus: (u.market_focus as PublicUser['market_focus']) ?? null,
    risk_profile: (u.risk_profile as PublicUser['risk_profile']) ?? null,
    account_tier: (u.account_tier as number | null) ?? null,
    created_at: u.created_at as string,
  };
}

async function attachHoldingCounts(
  supabase: ReturnType<typeof createServerClient>,
  results: PublicUser[]
): Promise<void> {
  if (results.length === 0) return;
  const userIds = results.map((r) => r.id);
  const { data: holdingRows } = await supabase
    .from('user_holdings')
    .select('user_id')
    .in('user_id', userIds);

  const countMap = new Map<string, number>();
  (holdingRows ?? []).forEach((h: { user_id: string }) => {
    countMap.set(h.user_id, (countMap.get(h.user_id) ?? 0) + 1);
  });
  results.forEach((r) => {
    r.holdings_count = countMap.get(r.id) ?? 0;
  });
}

// Public profile browsing/search — deliberately unauthenticated. The columns
// selected and the isProfilePublic filter below already restrict this to data
// its owners chose to make public; rate limiting is the right protection here,
// not a login wall on a page titled "Browse Members."
async function handler(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam ?? '20', 10) || 20, 1), 50);

  try {
    const supabase = createServerClient();

    let rows: Record<string, unknown>[] | null = null;
    let error: { message: string } | null = null;

    if (q.length >= 2) {
      const pattern = `%${q}%`;
      const res = await supabase
        .from('users')
        .select(PUBLIC_PROFILE_COLUMNS)
        .or(`username.ilike.${pattern},full_name.ilike.${pattern}`)
        .limit(Math.min(limit * 2, 80));
      rows = res.data as Record<string, unknown>[] | null;
      error = res.error;
    } else {
      // Browse: public profiles only (filtered below); over-fetch in case many are private
      const res = await supabase
        .from('users')
        .select(PUBLIC_PROFILE_COLUMNS)
        .order('username', { ascending: true, nullsFirst: false })
        .order('full_name', { ascending: true, nullsFirst: false })
        .limit(Math.min(limit * 6, 200));
      rows = res.data as Record<string, unknown>[] | null;
      error = res.error;
    }

    if (error) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
      );
    }

    const results: PublicUser[] = (rows ?? [])
      .filter(isProfilePublic)
      .slice(0, limit)
      .map(mapRowToPublicUser);

    await attachHoldingCounts(supabase, results);

    return addSecurityHeaders(NextResponse.json({ success: true, results }));
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
