/**
 * POST /api/academy/courses/[slug]/skip
 *
 * Marks an *optional* course complete without requiring its lessons, so the
 * next course in sequence unlocks immediately. No XP is awarded — skipping
 * earns nothing, XP only comes from actually doing a lesson.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

async function handler(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;
  const supabase = createServerClient();
  // Academy tables aren't yet in the generated Supabase types — cast at the
  // write site only, same pattern as the lesson-complete route.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: course } = await supabase
    .from('academy_courses')
    .select('id, order_index, is_optional')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<{ id: string; order_index: number; is_optional: boolean }>();

  if (!course) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 })
    );
  }

  // Security backstop: server-side optional gate, independent of the UI —
  // a required course must never be skippable by calling this route directly.
  if (!course.is_optional) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'not_optional' }, { status: 403 })
    );
  }

  const [, { data: nextCourse }] = await Promise.all([
    db.from('academy_user_course_progress').upsert(
      {
        user_id: session.userId,
        course_id: course.id,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,course_id' }
    ),
    supabase
      .from('academy_courses')
      .select('slug')
      .eq('is_published', true)
      .gt('order_index', course.order_index)
      .order('order_index')
      .limit(1)
      .maybeSingle<{ slug: string }>(),
  ]);

  return addSecurityHeaders(
    NextResponse.json({ success: true, nextCourseSlug: nextCourse?.slug ?? null })
  );
}

export const POST = withAuth(handler);
