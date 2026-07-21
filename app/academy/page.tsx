'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { GraduationCap, Trophy, ChevronRight } from 'lucide-react';
import { CourseCard } from '@/components/academy/CourseCard';
import { DailyChallengeCard } from '@/components/academy/DailyChallengeCard';
import { UpgradeCTA } from '@/components/billing/UpgradeCTA';
import { useAcademyCourses } from '@/hooks/use-user-progress';
import { useAcademyStats } from '@/hooks/use-academy-stats';
import { useEntitlements } from '@/hooks/use-entitlements';
import { Skeleton } from '@/components/ui/skeleton';

export default function AcademyHomePage() {
  const { data: courses, isLoading } = useAcademyCourses();
  const { data: stats, isLoading: isStatsLoading } = useAcademyStats();
  const { isPro } = useEntitlements();
  // Gate on isStatsLoading, not just totalXp — while stats is still in flight,
  // stats is undefined and totalXp falls back to 0, which would misfire the
  // "new to Academy" banner for returning users on every load.
  const isFirstVisit = !isStatsLoading && (stats?.totalXp ?? 0) === 0;

  // "Graduated the free track" nudge: a free user who has finished every free
  // course (optional ones count once skipped) and now faces the Pro courses.
  const freeCourses = courses?.filter((c) => !c.requiresPro) ?? [];
  const hasProCourses = courses?.some((c) => c.requiresPro) ?? false;
  const finishedFreeLadder =
    !isPro && hasProCourses && freeCourses.length > 0 && freeCourses.every((c) => c.isCompleted);

  return (
    <div className="space-y-6 pt-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Academy</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Bite-sized lessons that teach you how investing actually works. Earn XP, build a streak.
            </p>
          </div>
        </div>
        <Link
          href="/academy/leaderboard"
          className="flex items-center gap-1.5 shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Trophy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Leaderboard</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
        </Link>
      </div>

      {isFirstVisit && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-5 py-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/bull-welcome.png"
            alt=""
            aria-hidden
            className="h-16 w-16 shrink-0 opacity-95 dark:invert"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">Welcome to Academy</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Start with the first course below — a few minutes a day builds real investing knowledge.
            </p>
          </div>
        </motion.div>
      )}

      {/* Daily challenge */}
      <DailyChallengeCard />

      {/* Graduated the free track → nudge toward Pro courses */}
      {finishedFreeLadder && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-start gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] px-5 py-4 sm:flex-row sm:items-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/bull-celebrate.png"
            alt=""
            aria-hidden
            className="h-16 w-16 shrink-0 opacity-95 dark:invert"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">You&apos;ve finished the free courses</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Go deeper with Pro: valuation, financial statements, portfolio risk, and researching with AI —
              each with hands-on lessons inside the real app.
            </p>
          </div>
          <UpgradeCTA label="Unlock Pro courses" className="shrink-0" />
        </motion.div>
      )}

      {/* Course grid */}
      {isLoading ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          role="status"
          aria-label="Loading courses"
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : courses && courses.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {courses.map((course) => (
            <motion.div
              key={course.id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
              }}
            >
              <CourseCard course={course} />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="py-20 text-center text-sm text-muted-foreground">
          No courses available yet.
        </div>
      )}
    </div>
  );
}
