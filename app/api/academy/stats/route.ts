/**
 * GET /api/academy/stats
 * Returns the current user's academy stats, creating the row on first access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { levelForXp } from '@/types/academy';
import type { AcademyStats } from '@/types/academy';

interface StatsRow {
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  level: number;
}

const EMPTY_STATS: AcademyStats = {
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastActivityDate: null,
  level: 1,
};

async function handler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('academy_user_stats')
    .select('total_xp, current_streak, longest_streak, last_activity_date, level')
    .eq('user_id', session.userId)
    .maybeSingle<StatsRow>();

  const stats: AcademyStats = data
    ? {
        totalXp: data.total_xp,
        currentStreak: data.current_streak,
        longestStreak: data.longest_streak,
        lastActivityDate: data.last_activity_date,
        level: data.level || levelForXp(data.total_xp),
      }
    : EMPTY_STATS;

  return addSecurityHeaders(NextResponse.json({ success: true, stats }));
}

export const GET = withAuth(handler);
