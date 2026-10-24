/**
 * Academy daily challenge top-up cron
 * GET /api/cron/top-up-daily-challenges
 *
 * Runs daily (Vercel cron). Keeps today plus the next 14 days of
 * academy_daily_challenges filled; see lib/academy/daily-challenges.ts.
 * Steady state writes one day per run (~$0.0003 on Haiku 5.5); after a gap
 * it backfills every empty day in one go.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { topUpDailyChallenges } from '@/lib/academy/daily-challenges';

export const maxDuration = 300;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/top-up-daily-challenges' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await topUpDailyChallenges(createServerClient());
    return NextResponse.json(result, { status: result.failed.length ? 500 : 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = withCronReport('top-up-daily-challenges', handleGET);
