import { NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { logSecurityEvent } from '@/lib/security/security-events';

export type FeedbackType = 'bug' | 'feature';
export type FeedbackStatus = 'pending' | 'in_progress' | 'resolved';

export interface FeedbackReportRow {
  id: string;
  user_id: string | null;
  reporter_email: string | null;
  type: FeedbackType;
  title: string;
  description: string;
  page_url: string | null;
  status: FeedbackStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackListResponse {
  reports: FeedbackReportRow[];
}

interface RawReportRow {
  id: string;
  user_id: string | null;
  type: FeedbackType;
  title: string;
  description: string;
  page_url: string | null;
  status: FeedbackStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

async function handler(
  _req: unknown,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  // Admin-only. Return 404 so the route is indistinguishable from a missing
  // one — same UX as the page-level `notFound()` guard on /admin/feedback.
  if (!isAdmin(await getTier(session.userId))) {
    logSecurityEvent('admin_access_denied', { userId: session.userId, path: '/api/admin/feedback' });
    return addSecurityHeaders(NextResponse.json({ error: 'not_found' }, { status: 404 }));
  }

  const supabase = createServerClient();

  const { data: rows, error } = await supabase
    .from('feedback_reports')
    .select('id, user_id, type, title, description, page_url, status, admin_notes, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  const reportRows = (rows ?? []) as RawReportRow[];

  // Reporter emails aren't stored on the report itself (the row should still
  // read fine if the account is later deleted, per user_id's ON DELETE SET
  // NULL) — batch-look them up instead, same pattern as /api/admin/costs.
  const userIds = [...new Set(reportRows.map((r) => r.user_id).filter((id): id is string => !!id))];
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id, email').in('id', userIds)
    : { data: [] as { id: string; email: string }[] };
  const emailMap = new Map((users ?? []).map((u) => [u.id, u.email]));

  const reports: FeedbackReportRow[] = reportRows.map((r) => ({
    ...r,
    reporter_email: r.user_id ? (emailMap.get(r.user_id) ?? null) : null,
  }));

  const response: FeedbackListResponse = { reports };
  return addSecurityHeaders(NextResponse.json(response));
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 30 } });
