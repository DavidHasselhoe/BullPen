import { NextRequest, NextResponse, after } from 'next/server';
import { notifyNewAcademyCourse } from '@/lib/notifications/notification-creators';
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

  const { data: published, error } = await supabase
    .from('academy_courses')
    .update({ is_published: true })
    .eq('id', courseId)
    .eq('is_published', false) // only ever publish a draft — never re-touch an already-live course
    .select('slug, title, requires_pro');

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  // Only when this request is the one that flipped it, so a double click
  // can't notify twice. after() keeps the admin's response fast.
  const course = published?.[0];
  if (course) {
    after(() =>
      notifyNewAcademyCourse({ slug: course.slug, title: course.title, requiresPro: !!course.requires_pro })
        .catch((err) => console.error('[academy-roadmap] new-course notifications failed:', err))
    );
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
