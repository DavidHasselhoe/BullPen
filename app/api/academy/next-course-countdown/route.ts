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
 *
 * Once that weekly plan is used up, the slot names the next ACADEMY_ROADMAP_V2
 * course not yet published and its target month (status: 'planned'). The v2
 * outlines are already in the repo, so this exposes nothing that isn't public.
 */

import { NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { ACADEMY_ROADMAP, ACADEMY_ROADMAP_V2 } from '@/lib/academy/academy-roadmap';

export interface NextCourseCountdownResponse {
  show: boolean;
  status: 'scheduled' | 'reviewing' | 'planned' | null;
  daysUntil: number | null;
  /** Only with status 'planned': the next v2 course and its "YYYY-MM". */
  title?: string;
  targetMonth?: string;
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
    .in('slug', [...roadmapSlugs, ...ACADEMY_ROADMAP_V2.map((o) => o.slug)]);

  const allRows = (data ?? []) as RoadmapCourseRow[];
  const rows = allRows.filter((r) => roadmapSlugs.includes(r.slug));
  const createdSlugs = new Set(rows.map((r) => r.slug));
  const remaining = roadmapSlugs.filter((s) => !createdSlugs.has(s)).length;
  const hasPendingDraft = rows.some((r) => !r.is_published);

  // The weekly plan is generated and published: name the next v2 course, or
  // hide the teaser once that is done too rather than show a stale promise.
  if (remaining === 0 && !hasPendingDraft) {
    const published = new Set(allRows.filter((r) => r.is_published).map((r) => r.slug));
    const next = ACADEMY_ROADMAP_V2.find((o) => !published.has(o.slug));
    if (next) {
      // A slipped month drops to "Launching soon" instead of promising a date already gone.
      const targetMonth = next.targetMonth && next.targetMonth >= new Date().toISOString().slice(0, 7) ? next.targetMonth : undefined;
      return addSecurityHeaders(NextResponse.json({
        show: true, status: 'planned', daysUntil: null, title: next.title, targetMonth,
      }));
    }
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
