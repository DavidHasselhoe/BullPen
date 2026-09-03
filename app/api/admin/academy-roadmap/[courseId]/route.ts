import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { logSecurityEvent } from '@/lib/security/security-events';

async function approveHandler(
  _req: NextRequest,
  context: { params: Promise<{ courseId: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  if (!isAdmin(await getTier(session.userId))) {
    logSecurityEvent('admin_access_denied', { userId: session.userId, path: '/api/admin/academy-roadmap/[courseId]' });
    return addSecurityHeaders(NextResponse.json({ error: 'not_found' }, { status: 404 }));
  }

  const { courseId } = await context.params;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('academy_courses')
    .update({ is_published: true })
    .eq('id', courseId)
    .eq('is_published', false); // only ever publish a draft — never re-touch an already-live course

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

async function rejectHandler(
  _req: NextRequest,
  context: { params: Promise<{ courseId: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  if (!isAdmin(await getTier(session.userId))) {
    logSecurityEvent('admin_access_denied', { userId: session.userId, path: '/api/admin/academy-roadmap/[courseId]' });
    return addSecurityHeaders(NextResponse.json({ error: 'not_found' }, { status: 404 }));
  }

  const { courseId } = await context.params;
  const supabase = createServerClient();

  // Lessons cascade-delete via their course_id FK (ON DELETE CASCADE,
  // 058_academy.sql). The is_published: false filter means this can only
  // ever remove a draft, never an already-published course. Deleting the
  // row (rather than just leaving it) frees the slug, so the next cron run
  // regenerates this same roadmap entry instead of skipping it forever.
  const { error } = await supabase
    .from('academy_courses')
    .delete()
    .eq('id', courseId)
    .eq('is_published', false);

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const POST = withAuth(approveHandler, { rateLimit: { windowMs: 60_000, maxRequests: 20 } });
export const DELETE = withAuth(rejectHandler, { rateLimit: { windowMs: 60_000, maxRequests: 20 } });
