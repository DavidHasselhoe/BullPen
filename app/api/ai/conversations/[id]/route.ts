/**
 * GET    /api/ai/conversations/[id] — fetch one conversation's full message list
 *                                      (loaded into useChat when resuming a past chat).
 * DELETE /api/ai/conversations/[id] — remove a conversation from history.
 * Both scoped to the authenticated user's own conversations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { validateUUID } from '@/lib/security/input-validation';
import { createServerClient } from '@/lib/supabase/client';

type RouteContext = { params: Promise<{ id: string }> };

async function getHandler(
  _request: NextRequest,
  context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await (context as RouteContext).params;
  if (!validateUUID(id)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid conversation id' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  const { data: conversation, error } = await supabase
    .from('ai_conversations')
    .select('id, title, messages, updated_at')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    );
  }
  if (!conversation) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'not_found' }, { status: 404 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, conversation }));
}

async function deleteHandler(
  _request: NextRequest,
  context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await (context as RouteContext).params;
  if (!validateUUID(id)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid conversation id' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('ai_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', session.userId);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const GET = withAuth(getHandler);
export const DELETE = withAuth(deleteHandler);
