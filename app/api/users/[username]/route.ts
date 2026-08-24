import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import type { PublicUser } from '../search/route';

// Public profile page — deliberately unauthenticated, same reasoning as
// users/search/route.ts: the column whitelist below plus the profile_public/
// holdings_public checks already restrict this to what the owner chose to
// make public, so rate limiting is the right protection, not a login wall.
// Was previously built on the RLS-subject anon-key client (@supabase/ssr),
// which has no SELECT grant for the `anon` role at all — every anonymous
// visitor got "This profile is private" regardless of the setting. Switched
// to the service-role client since the authorization decision already lives
// in this handler, not in RLS (same pattern as users/search).
/** Fetches a user's public profile + portfolio symbols by username. */
async function handler(
  _request: NextRequest,
  context: { params: Promise<{ username: string }> }
): Promise<NextResponse> {
  const { username } = await context.params;

  if (!username || username.length < 1 || username.length > 60) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid username' }, { status: 400 })
    );
  }

  try {
    const supabase = createServerClient();

    const SELECT_COLS = 'id, username, full_name, avatar_url, bio, experience_level, market_focus, risk_profile, account_tier, created_at, settings';

    // Try username first, then fall back to user ID (for users who haven't set a username)
    let userRow: Record<string, unknown> | null = null;
    const { data: byUsername } = await supabase
      .from('users')
      .select(SELECT_COLS)
      .eq('username', username)
      .maybeSingle();

    if (byUsername) {
      userRow = byUsername;
    } else {
      // UUID pattern — allow lookup by ID as a fallback
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_RE.test(username)) {
        const { data: byId } = await supabase
          .from('users')
          .select(SELECT_COLS)
          .eq('id', username)
          .maybeSingle();
        userRow = byId ?? null;
      }
    }

    if (!userRow) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
      );
    }

    // Respect profile_public setting
    const settings = (userRow.settings as Record<string, unknown>) ?? {};
    if (settings.profile_public === false) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'This profile is private' }, { status: 403 })
      );
    }

    const profile: PublicUser = {
      id: userRow.id as string,
      username: (userRow.username as string | null) ?? null,
      full_name: (userRow.full_name as string | null) ?? null,
      avatar_url: (userRow.avatar_url as string | null) ?? null,
      bio: (userRow.bio as string | null) ?? null,
      experience_level: (userRow.experience_level as PublicUser['experience_level']) ?? null,
      market_focus: (userRow.market_focus as PublicUser['market_focus']) ?? null,
      risk_profile: (userRow.risk_profile as PublicUser['risk_profile']) ?? null,
      account_tier: (userRow.account_tier as number | null) ?? null,
      created_at: userRow.created_at as string,
    };

    // Fetch public holdings (symbol + company_name only — no qty or price)
    const holdingsPublic = settings.holdings_public !== false;
    let holdings: Array<{ symbol: string; company_name: string }> = [];

    if (holdingsPublic) {
      const { data: holdingRows } = await supabase
        .from('user_holdings')
        .select('symbol, company_name')
        .eq('user_id', userRow.id)
        .order('created_at', { ascending: true });

      holdings = (holdingRows ?? []).map((h: { symbol: string; company_name: string }) => ({
        symbol: h.symbol,
        company_name: h.company_name,
      }));
    }

    profile.holdings_count = holdings.length;

    return addSecurityHeaders(
      NextResponse.json({ success: true, profile, holdings })
    );
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
