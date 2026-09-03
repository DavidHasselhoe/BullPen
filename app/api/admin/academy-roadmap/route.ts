import { NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { logSecurityEvent } from '@/lib/security/security-events';

export interface DraftLessonRow {
  id: string;
  slug: string;
  title: string;
  type: string;
  orderIndex: number;
  xpReward: number;
  content: unknown;
}

export interface DraftCourseRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: string | null;
  requiresPro: boolean;
  unitLabel: string | null;
  orderIndex: number;
  createdAt: string;
  lessons: DraftLessonRow[];
}

export interface AcademyRoadmapListResponse {
  drafts: DraftCourseRow[];
}

async function handler(
  _req: unknown,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  // Admin-only. 404, not 403 — same UX as /admin/feedback's page-level guard.
  if (!isAdmin(await getTier(session.userId))) {
    logSecurityEvent('admin_access_denied', { userId: session.userId, path: '/api/admin/academy-roadmap' });
    return addSecurityHeaders(NextResponse.json({ error: 'not_found' }, { status: 404 }));
  }

  const supabase = createServerClient();

  const { data: courses, error } = await supabase
    .from('academy_courses')
    .select('id, slug, title, description, difficulty, requires_pro, unit_label, order_index, created_at')
    .eq('is_published', false)
    .order('order_index');

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  const courseRows = (courses ?? []) as Array<{
    id: string; slug: string; title: string; description: string | null;
    difficulty: string | null; requires_pro: boolean; unit_label: string | null;
    order_index: number; created_at: string;
  }>;

  if (courseRows.length === 0) {
    return addSecurityHeaders(NextResponse.json({ drafts: [] }));
  }

  const { data: lessons } = await supabase
    .from('academy_lessons')
    .select('id, course_id, slug, title, type, order_index, xp_reward, content')
    .in('course_id', courseRows.map((c) => c.id))
    .order('order_index');

  const lessonsByCourse = new Map<string, DraftLessonRow[]>();
  for (const l of (lessons ?? []) as Array<{
    id: string; course_id: string; slug: string; title: string; type: string;
    order_index: number; xp_reward: number; content: unknown;
  }>) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({ id: l.id, slug: l.slug, title: l.title, type: l.type, orderIndex: l.order_index, xpReward: l.xp_reward, content: l.content });
    lessonsByCourse.set(l.course_id, arr);
  }

  const drafts: DraftCourseRow[] = courseRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description ?? '',
    difficulty: c.difficulty,
    requiresPro: c.requires_pro,
    unitLabel: c.unit_label,
    orderIndex: c.order_index,
    createdAt: c.created_at,
    lessons: lessonsByCourse.get(c.id) ?? [],
  }));

  return addSecurityHeaders(NextResponse.json({ drafts }));
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 30 } });
