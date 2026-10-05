import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { areHoldingsPublic } from '@/lib/social/visibility';

/**
 * Public profile columns — never include email, role, last_login_at. Settings
 * is read for the holdings opt-in and never returned. No account_tier either:
 * a Pro badge on a public card told anyone who pays.
 */
const PUBLIC_PROFILE_COLUMNS =
  'id, username, full_name, avatar_url, bio, experience_level, market_focus, risk_profile, created_at, settings';

export interface PublicUser {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  experience_level: 'beginner' | 'intermediate' | 'advanced' | null;
  market_focus: 'US' | 'EU' | 'BOTH' | null;
  risk_profile: 'conservative' | 'balanced' | 'aggressive' | null;
  /** Only the profile page still reads it, for its own header. Never sent from this route. */
  account_tier?: number | null;
  created_at: string;
  /** Number of public holdings; 0 unless the owner also made holdings public. */
  holdings_count?: number;
  thesis_count?: number;
  follower_count?: number;
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
    created_at: u.created_at as string,
  };
}

/** Counts per user id for one column of a table, from the matching rows. */
async function countBy(
  supabase: ReturnType<typeof createServerClient>,
  table: string,
  column: string,
  ids: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const { data } = await supabase.from(table).select(column).in(column, ids);
  for (const row of (data as unknown as Record<string, string>[] | null) ?? []) {
    counts.set(row[column], (counts.get(row[column]) ?? 0) + 1);
  }
  return counts;
}

// Public profile browsing/search — deliberately unauthenticated, and limited
// to profiles whose owners turned "Public profile" on (lib/social/visibility).
// Rate limiting protects it; the opt-in is what makes it fair to list anyone.
async function handler(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam ?? '20', 10) || 20, 1), 50);

  try {
    const supabase = createServerClient();

    // ponytail: filters and sorts in memory after one bounded read; fine at
    // today's member count, move the activity sort into SQL past a few hundred.
    let query = supabase
      .from('users')
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq('settings->>profile_public', 'true')
      .limit(200);

    if (q.length >= 2) {
      // Strip characters meaningful to PostgREST's .or() filter DSL (`,` separates
      // conditions, `(`/`)` group them) — without this, a search term like
      // "x,id.eq.<uuid>" would inject an arbitrary additional OR'd condition.
      const safeQ = q.replace(/[,()]/g, '');
      const pattern = `%${safeQ}%`;
      query = query.or(`username.ilike.${pattern},full_name.ilike.${pattern}`);
    }

    const { data: rows, error } = await query;
    if (error) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
      );
    }

    const all = (rows ?? []) as Record<string, unknown>[];
    const ids = all.map((r) => r.id as string);
    const holdingsVisible = new Set(
      all.filter((r) => areHoldingsPublic(r.settings as Record<string, unknown> | null)).map((r) => r.id as string)
    );

    const [theses, followers, holdings] = await Promise.all([
      countBy(supabase, 'stock_theses', 'user_id', ids),
      countBy(supabase, 'user_follows', 'following_id', ids),
      countBy(supabase, 'user_holdings', 'user_id', [...holdingsVisible]),
    ]);

    // Most active first: what someone has written and who follows them is the
    // reason to open a profile. Alphabetical only breaks ties.
    const results = all
      .map((r) => ({
        ...mapRowToPublicUser(r),
        thesis_count: theses.get(r.id as string) ?? 0,
        follower_count: followers.get(r.id as string) ?? 0,
        holdings_count: holdings.get(r.id as string) ?? 0,
      }))
      .sort((a, b) =>
        (b.thesis_count + b.follower_count) - (a.thesis_count + a.follower_count) ||
        (a.full_name ?? a.username ?? '').localeCompare(b.full_name ?? b.username ?? '')
      )
      .slice(0, limit);

    return addSecurityHeaders(NextResponse.json({ success: true, results }));
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
