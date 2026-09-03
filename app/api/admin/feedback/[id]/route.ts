import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { logSecurityEvent } from '@/lib/security/security-events';
import type { FeedbackStatus } from '../route';

const VALID_STATUSES: FeedbackStatus[] = ['pending', 'in_progress', 'resolved'];

interface UpdateFeedbackBody {
  status?: FeedbackStatus;
  admin_notes?: string | null;
}

/** PATCH /api/admin/feedback/[id] — update a report's status and/or admin notes. */
async function handler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  if (!isAdmin(await getTier(session.userId))) {
    logSecurityEvent('admin_access_denied', { userId: session.userId, path: '/api/admin/feedback/[id]' });
    return addSecurityHeaders(NextResponse.json({ error: 'not_found' }, { status: 404 }));
  }

  const { id } = await context.params;

  let body: UpdateFeedbackBody;
  try {
    body = await request.json();
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    );
  }

  const patch: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 })
      );
    }
    patch.status = body.status;
  }

  if (body.admin_notes !== undefined) {
    patch.admin_notes = body.admin_notes?.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('feedback_reports').update(patch as never).eq('id', id);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to update report' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const PATCH = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 20 } });
