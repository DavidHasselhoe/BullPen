import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

async function handler(
  request: NextRequest,
  _context: unknown,
  _session: { userId: string }
): Promise<NextResponse> {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam ?? '20', 10) || 20, 1), 50);

  if (q.length < 2) {
    return addSecurityHeaders(
      NextResponse.json({ success: true, results: [] })
    );
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const pattern = `%${q}%`;

    const { data: rows, error } = await supabase
      .from('users')
      .select(PUBLIC_PROFILE_COLUMNS)
      .or(`username.ilike.${pattern},full_name.ilike.${pattern}`)
      .limit(limit);

    if (error) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
      );
    }

    const results: PublicUser[] = (rows ?? [])
      .filter((u: Record<string, unknown>) => {
        // Respect profile_public setting (default: true when absent)
        const settings = u.settings as Record<string, unknown> | null;
        return settings?.profile_public !== false;
      })
      .map((u: Record<string, unknown>) => ({
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
      }));

    // Fetch holdings counts for the returned user ids
    if (results.length > 0) {
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

    return addSecurityHeaders(
      NextResponse.json({ success: true, results })
    );
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(
  withAuth(handler),
  { windowMs: 60 * 1000, maxRequests: 60 }
);
