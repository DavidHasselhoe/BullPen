/**
 * GET /api/academy/next-course-countdown
 *
 * Public (any authenticated user), not admin-gated — only ever exposes a day
 * count and a status enum, never draft course titles or content. Backs the
 * "New course — unlocks in N days" teaser at the bottom of the /academy path.
 *
 * The countdown targets the next scheduled GENERATION run (the weekly cron,
 * Mondays 06:00 UTC — see .github/workflows/cron-academy-course-weekly.yml),
 * not publication. Publication depends on a human approving the draft at
 * /admin/academy-roadmap, which has no fixed SLA — counting down to that
 * would risk hitting zero with nothing actually visible yet. If a draft is
 * already staged and pending review, the countdown deliberately stops
 * (status: 'reviewing') rather than showing a stale or negative day count.
 */

import { NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { ACADEMY_ROADMAP } from '@/lib/academy/academy-roadmap';

export interface NextCourseCountdownResponse {
  show: boolean;
  status: 'scheduled' | 'reviewing' | null;
  daysUntil: number | null;
}

interface RoadmapCourseRow {
  slug: string;
  is_published: boolean;
}

// Same "always a future Monday" formula as
// app/api/cron/instagram-earnings-weekly/route.ts's nextTradingWeek, kept
// consistent since both crons resolve "days until next Monday" the same way.
function daysUntilNextMondayUTC(): number {
  const dow = new Date().getUTCDay(); // 0=Sun..6=Sat, Monday=1
  return ((1 - dow + 7) % 7) || 7;
}

async function handler(
  _req: unknown,
  _ctx: unknown,
  _session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const roadmapSlugs = ACADEMY_ROADMAP.map((o) => o.slug);

  const { data } = await supabase
    .from('academy_courses')
    .select('slug, is_published')
    .in('slug', roadmapSlugs);

  const rows = (data ?? []) as RoadmapCourseRow[];
  const createdSlugs = new Set(rows.map((r) => r.slug));
  const remaining = roadmapSlugs.filter((s) => !createdSlugs.has(s)).length;
  const hasPendingDraft = rows.some((r) => !r.is_published);

  // The whole 10-week plan is generated and published, nothing left to
  // count down to — hide the teaser rather than show a stale promise.
  if (remaining === 0 && !hasPendingDraft) {
    return addSecurityHeaders(NextResponse.json({ show: false, status: null, daysUntil: null }));
  }

  if (hasPendingDraft) {
    return addSecurityHeaders(NextResponse.json({ show: true, status: 'reviewing', daysUntil: null }));
  }

  return addSecurityHeaders(
    NextResponse.json({ show: true, status: 'scheduled', daysUntil: daysUntilNextMondayUTC() })
  );
}

export const GET = withAuth(handler);
