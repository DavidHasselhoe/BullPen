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

/** PATCH /api/social/thesis/reply/[replyId] */
async function patchHandler(
  req: NextRequest,
  context: { params: Promise<{ replyId: string }> },
  session: { userId: string },
): Promise<NextResponse> {
  const { replyId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > 280) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Content must be 1–280 characters' }, { status: 400 })
    );
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const { error } = await supabase
    .from('stock_thesis_replies')
    .update({ content })
    .eq('id', replyId)
    .eq('user_id', session.userId); // RLS + explicit author check

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to update reply' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

/** DELETE /api/social/thesis/reply/[replyId] */
async function deleteHandler(
  _req: NextRequest,
  context: { params: Promise<{ replyId: string }> },
  session: { userId: string },
): Promise<NextResponse> {
  const { replyId } = await context.params;
  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const { error } = await supabase
    .from('stock_thesis_replies')
    .delete()
    .eq('id', replyId)
    .eq('user_id', session.userId); // RLS + explicit author check

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to delete reply' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
