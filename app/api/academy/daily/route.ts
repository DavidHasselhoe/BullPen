/**
 * BullPen Academy — Daily Challenge.
 *
 *  GET  /api/academy/daily  → today's challenge (correct_index stripped) + the
 *                             user's completion state for today.
 *  POST /api/academy/daily  → submit an answer. One attempt per ET day
 *                             (idempotent). Awards XP and ticks the streak via
 *                             the shared applyActivityAndXp().
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { applyActivityAndXp, todayInET } from '@/lib/academy/streak';
import type { AcademyStats } from '@/types/academy';

const XP_CORRECT = 15;
const XP_CONSOLATION = 5;

interface ChallengeRow {
  id: string;
  challenge_date: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  xp_reward: number;
}

interface AttemptRow {
  was_correct: boolean;
  xp_earned: number;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

async function getHandler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const today = todayInET();

  const { data: challenge } = await supabase
    .from('academy_daily_challenges')
    .select('id, question, options, xp_reward')
    .eq('challenge_date', today)
    .maybeSingle<Pick<ChallengeRow, 'id' | 'question' | 'options' | 'xp_reward'>>();

  if (!challenge) {
    return addSecurityHeaders(NextResponse.json({ success: true, challenge: null }));
  }

  const { data: attempt } = await supabase
    .from('academy_user_daily_challenge')
    .select('was_correct, xp_earned')
    .eq('user_id', session.userId)
    .eq('challenge_date', today)
    .maybeSingle<AttemptRow>();

  // correct_index is intentionally NOT selected — never leaked to the client.
  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      challenge: {
        id: challenge.id,
        question: challenge.question,
        options: challenge.options,
        xpReward: challenge.xp_reward,
      },
      alreadyDoneToday: attempt !== null,
      wasCorrect: attempt?.was_correct ?? null,
      xpEarned: attempt?.xp_earned ?? null,
    })
  );
}

// ─── POST ─────────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  challengeId: z.string().uuid(),
  choiceIndex: z.number().int().min(0).max(10),
});

async function postHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const today = todayInET();

  // Load the challenge server-side — the ONLY place correct_index is read.
  const { data: challenge } = await supabase
    .from('academy_daily_challenges')
    .select('id, challenge_date, correct_index, explanation, xp_reward')
    .eq('id', body.challengeId)
    .maybeSingle<Pick<ChallengeRow, 'id' | 'challenge_date' | 'correct_index' | 'explanation' | 'xp_reward'>>();

  if (!challenge) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Challenge not found' }, { status: 404 })
    );
  }

  // Guard against answering a stale/non-today challenge.
  if (challenge.challenge_date !== today) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'This challenge is no longer active.' }, { status: 409 })
    );
  }

  // Idempotency: already attempted today → return the stored result, no XP, no streak change.
  const { data: existing } = await supabase
    .from('academy_user_daily_challenge')
    .select('was_correct, xp_earned')
    .eq('user_id', session.userId)
    .eq('challenge_date', today)
    .maybeSingle<AttemptRow>();

  if (existing) {
    const { data: statsRow } = await supabase
      .from('academy_user_stats')
      .select('total_xp, current_streak, longest_streak, last_activity_date, level')
      .eq('user_id', session.userId)
      .maybeSingle<{
        total_xp: number;
        current_streak: number;
        longest_streak: number;
        last_activity_date: string | null;
        level: number;
      }>();
    const stats: AcademyStats = {
      totalXp: statsRow?.total_xp ?? 0,
      currentStreak: statsRow?.current_streak ?? 0,
      longestStreak: statsRow?.longest_streak ?? 0,
      lastActivityDate: statsRow?.last_activity_date ?? null,
      level: statsRow?.level ?? 1,
    };
    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        alreadyDoneToday: true,
        correctIndex: challenge.correct_index,
        wasCorrect: existing.was_correct,
        explanation: challenge.explanation,
        xpAwarded: 0,
        stats,
      })
    );
  }

  const wasCorrect = body.choiceIndex === challenge.correct_index;
  const xpAwarded = wasCorrect ? challenge.xp_reward || XP_CORRECT : XP_CONSOLATION;

  await db.from('academy_user_daily_challenge').insert({
    user_id: session.userId,
    challenge_id: challenge.id,
    challenge_date: today,
    was_correct: wasCorrect,
    xp_earned: xpAwarded,
  });

  // Tick the streak (once per day, shared with lesson completion) + accrue XP.
  const stats = await applyActivityAndXp({ supabase: db, userId: session.userId, xpToAdd: xpAwarded });

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      alreadyDoneToday: false,
      correctIndex: challenge.correct_index,
      wasCorrect,
      explanation: challenge.explanation,
      xpAwarded,
      stats,
    })
  );
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
