import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

/** GET /api/social/follow/[username] — follow stats + isFollowing for current user */
async function getHandler(
  _req: NextRequest,
  context: { params: Promise<{ username: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { username } = await context.params;
  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  // Resolve username → id
  const { data: target, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (userErr || !target) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    );
  }

  const targetId = target.id as string;

  const [followersRes, followingRes, isFollowingRes] = await Promise.all([
    supabase.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', targetId),
    supabase.from('user_follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', targetId),
    supabase.from('user_follows').select('follower_id').eq('follower_id', session.userId).eq('following_id', targetId).maybeSingle(),
  ]);

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      followers: followersRes.count ?? 0,
      following: followingRes.count ?? 0,
      isFollowing: !!isFollowingRes.data,
    })
  );
}

/** POST /api/social/follow/[username] — follow */
async function postHandler(
  _req: NextRequest,
  context: { params: Promise<{ username: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { username } = await context.params;
  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const { data: target, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (userErr || !target) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    );
  }

  if ((target.id as string) === session.userId) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Cannot follow yourself' }, { status: 400 })
    );
  }

  const { error } = await supabase
    .from('user_follows')
    .upsert({ follower_id: session.userId, following_id: target.id }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true });

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to follow' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

/** DELETE /api/social/follow/[username] — unfollow */
async function deleteHandler(
  _req: NextRequest,
  context: { params: Promise<{ username: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { username } = await context.params;
  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const { data: target, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (userErr || !target) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    );
  }

  await supabase
    .from('user_follows')
    .delete()
    .eq('follower_id', session.userId)
    .eq('following_id', target.id);

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
