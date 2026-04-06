import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** DELETE /api/social/thesis/delete/[id] — delete own thesis */
async function handler(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await context.params;
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

  // RLS enforces ownership, but double-check user_id to return proper 403
  const { data: existing } = await supabase
    .from('stock_theses')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!existing) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Thesis not found' }, { status: 404 })
    );
  }
  if ((existing as { user_id: string }).user_id !== session.userId) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    );
  }

  await supabase.from('stock_theses').delete().eq('id', id);

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const DELETE = withAuth(handler);
