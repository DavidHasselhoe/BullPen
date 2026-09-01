/**
 * Shared Academy streak + XP recompute logic.
 *
 * Extracted from app/api/academy/lessons/[lessonId]/complete/route.ts so that
 * BOTH lesson completion and the daily challenge tick the streak through one
 * code path. The day-gate (`prevLastActive !== today`) means calling this
 * multiple times in a single ET day bumps the streak only once, while XP
 * accrues on every call (matches lesson behavior where two lessons both award
 * XP on the same day).
 *
 * All date math uses America/New_York so "today" is consistent across callers.
 */

import { levelForXp, type AcademyStats } from '@/types/academy';

/** YYYY-MM-DD in America/New_York. */
export function todayInET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** YYYY-MM-DD for the ET calendar day before today. Pure date-string
 *  arithmetic on todayInET()'s already-resolved ET day, not a fresh
 *  timezone conversion — safe across DST since it never touches wall-clock
 *  time, only calendar-date subtraction. */
export function yesterdayInET(): string {
  const d = new Date(Date.parse(todayInET()) - 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function isoDateBefore(a: string, b: string): boolean {
  return Date.parse(a) < Date.parse(b);
}

export function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(later) - Date.parse(earlier)) / 86_400_000);
}

type StatsRow = {
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
} | null;

interface FetchStatsArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
}

/** Reads the raw academy_user_stats row, with no side effects — callers can fetch this in parallel with other independent reads before calling applyActivityAndXp. */
export async function fetchStatsRow({ supabase, userId }: FetchStatsArgs): Promise<StatsRow> {
  const { data } = await supabase
    .from('academy_user_stats')
    .select('total_xp, current_streak, longest_streak, last_activity_date')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

interface ApplyActivityArgs {
  /** Service-role Supabase client (academy routes use createServerClient). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  /** XP to add this call. Pass 0 to tick the streak without awarding XP. */
  xpToAdd: number;
  /** Pre-fetched via fetchStatsRow, e.g. alongside other reads in a Promise.all. Fetched here if omitted. */
  statsRow?: StatsRow;
}

/**
 * Advances the daily streak (once per ET day), adds XP, recomputes level,
 * upserts, and returns the fresh stats.
 *
 * Streak rules:
 *   - first ever activity            → streak = 1
 *   - consecutive ET day             → streak + 1
 *   - gap of 2+ days                 → streak resets to 1
 *   - same ET day (already active)   → streak unchanged (day-gate)
 */
export async function applyActivityAndXp({
  supabase,
  userId,
  xpToAdd,
  statsRow: providedStatsRow,
}: ApplyActivityArgs): Promise<AcademyStats> {
  const statsRow = providedStatsRow !== undefined ? providedStatsRow : await fetchStatsRow({ supabase, userId });

  const today = todayInET();
  const prevXp: number = statsRow?.total_xp ?? 0;
  const prevStreak: number = statsRow?.current_streak ?? 0;
  const prevLongest: number = statsRow?.longest_streak ?? 0;
  const prevLastActive: string | null = statsRow?.last_activity_date ?? null;

  let currentStreak = prevStreak;
  let lastActivityDate = prevLastActive;

  if (prevLastActive !== today) {
    if (prevLastActive === null) {
      currentStreak = 1;
    } else if (daysBetween(prevLastActive, today) === 1) {
      currentStreak = prevStreak + 1;
    } else if (isoDateBefore(prevLastActive, today)) {
      currentStreak = 1;
    }
    lastActivityDate = today;
  }

  const totalXp = prevXp + xpToAdd;
  const longestStreak = Math.max(prevLongest, currentStreak);
  const level = levelForXp(totalXp);

  await supabase
    .from('academy_user_stats')
    .upsert(
      {
        user_id: userId,
        total_xp: totalXp,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_activity_date: lastActivityDate,
        level,
      },
      { onConflict: 'user_id' }
    );

  return { totalXp, currentStreak, longestStreak, lastActivityDate, level };
}
