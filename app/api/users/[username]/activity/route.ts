import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface ActivityItem {
  type: 'thesis' | 'reply' | 'portfolio';
  created_at: string;
  symbol: string;
  company_name?: string;
  action?: 'opened' | 'increased' | 'trimmed' | 'closed';
  percent_change?: number | null;
  content?: string;
  sentiment?: 'bull' | 'bear' | 'neutral';
  reply_to_username?: string | null;
}

const PAGE_SIZE = 20;

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

async function handler(
  req: NextRequest,
  context: { params: Promise<{ username: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { username } = await context.params;
  const cursor = req.nextUrl.searchParams.get('cursor') ?? new Date().toISOString();

  if (!username || username.length < 1 || username.length > 60) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Invalid username' }, { status: 400 }));
  }

  try {
    const cookieStore = await cookies();
    const supabase = makeSupabase(cookieStore);

    const SELECT_COLS = 'id, settings';
    let userRow: { id: string; settings: Record<string, unknown> | null } | null = null;
    const { data: byUsername } = await supabase.from('users').select(SELECT_COLS).eq('username', username).maybeSingle();
    if (byUsername) {
      userRow = byUsername;
    } else {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_RE.test(username)) {
        const { data: byId } = await supabase.from('users').select(SELECT_COLS).eq('id', username).maybeSingle();
        userRow = byId ?? null;
      }
    }

    if (!userRow) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'User not found' }, { status: 404 }));
    }

    const settings = userRow.settings ?? {};
    if (settings.profile_public === false) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'This profile is private' }, { status: 403 }));
    }
    const holdingsPublic = settings.holdings_public !== false;
    const targetId = userRow.id;

    const [thesesRes, repliesRes, portfolioRes] = await Promise.all([
      supabase
        .from('stock_theses')
        .select('id, symbol, content, sentiment, created_at')
        .eq('user_id', targetId)
        .lt('created_at', cursor)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE),
      supabase
        .from('stock_thesis_replies')
        .select('id, thesis_id, content, created_at')
        .eq('user_id', targetId)
        .lt('created_at', cursor)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE),
      holdingsPublic
        ? supabase
            .from('portfolio_activity')
            .select('symbol, company_name, action, percent_change, created_at')
            .eq('user_id', targetId)
            .lt('created_at', cursor)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)
        : Promise.resolve({ data: [] as { symbol: string; company_name: string; action: string; percent_change: number | null; created_at: string }[], error: null }),
    ]);

    if (thesesRes.error || repliesRes.error || portfolioRes.error) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to fetch activity' }, { status: 500 }));
    }

    const theses = thesesRes.data ?? [];
    const replies = repliesRes.data ?? [];
    const portfolio = portfolioRes.data ?? [];

    // Replies don't carry their own symbol — resolve each reply's parent thesis
    // (for symbol) and that thesis's author (for "replied to @username").
    let replyItems: ActivityItem[] = [];
    if (replies.length > 0) {
      const thesisIds = [...new Set(replies.map((r) => r.thesis_id))];
      const { data: parentTheses } = await supabase
        .from('stock_theses')
        .select('id, symbol, user_id')
        .in('id', thesisIds);
      const parentMap = new Map((parentTheses ?? []).map((t) => [t.id, t]));

      const authorIds = [...new Set((parentTheses ?? []).map((t) => t.user_id))];
      const { data: authorRows } = authorIds.length > 0
        ? await supabase.from('users').select('id, username').in('id', authorIds)
        : { data: [] as { id: string; username: string | null }[] };
      const authorMap = new Map((authorRows ?? []).map((u) => [u.id, u.username]));

      replyItems = replies
        .map((r): ActivityItem | null => {
          const parent = parentMap.get(r.thesis_id);
          if (!parent) return null; // parent thesis was deleted — nothing to link to
          return {
            type: 'reply',
            created_at: r.created_at,
            symbol: parent.symbol,
            content: r.content,
            reply_to_username: authorMap.get(parent.user_id) ?? null,
          };
        })
        .filter((r): r is ActivityItem => r !== null);
    }

    const thesisItems: ActivityItem[] = theses.map((t) => ({
      type: 'thesis',
      created_at: t.created_at,
      symbol: t.symbol,
      content: t.content,
      sentiment: t.sentiment as 'bull' | 'bear' | 'neutral',
    }));

    const portfolioItems: ActivityItem[] = portfolio.map((p) => ({
      type: 'portfolio',
      created_at: p.created_at,
      symbol: p.symbol,
      company_name: p.company_name,
      action: p.action as 'opened' | 'increased' | 'trimmed' | 'closed',
      percent_change: p.percent_change,
    }));

    const merged = [...thesisItems, ...replyItems, ...portfolioItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, PAGE_SIZE);

    const nextCursor = merged.length === PAGE_SIZE ? merged[merged.length - 1].created_at : null;

    return addSecurityHeaders(NextResponse.json({ success: true, items: merged, nextCursor }));
  } catch {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 }));
  }
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 60 });
