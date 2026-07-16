/**
 * GET /api/ai/conversations
 * Lists the current user's "Ask Bull" chat history — id, title, and last-updated
 * time only (not the full message list, kept light for the history dropdown).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

async function handler(
  _request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  const { data: conversations, error } = await supabase
    .from('ai_conversations')
    .select('id, title, updated_at')
    .eq('user_id', session.userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    );
  }

  return addSecurityHeaders(
    NextResponse.json({ success: true, conversations: conversations ?? [] })
  );
}

export const GET = withAuth(handler);
