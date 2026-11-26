/**
 * GET /api/academy/courses
 * Lists published courses with the user's per-course completion percentage
 * and locked state. Progression unlock is sequential *within a gating track*
 * (free vs Pro), so a paying user isn't forced through every free course before
 * reaching their first Pro course.
 *
 * Public (optional auth): an anonymous caller gets the same shape with zero
 * progress, which the existing sequential-unlock math naturally turns into a
 * "preview the first course in each track, the rest show locked" curriculum
 * view — the public /academy catalog reuses this rather than a separate
 * endpoint. Individual lessons still require signing in (app/academy/layout.tsx).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withOptionalAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { listCoursesWithProgress } from '@/lib/academy/course-list';

async function handler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string } | null
): Promise<NextResponse> {
  const courses = await listCoursesWithProgress(session);
  return addSecurityHeaders(NextResponse.json({ success: true, courses }));
}

export const GET = withOptionalAuth(handler);
