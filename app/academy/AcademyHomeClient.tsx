'use client';

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { GraduationCap, Trophy, ChevronRight } from 'lucide-react';
import { AcademyPath } from '@/components/academy/path/AcademyPath';
import { DailyChallengeCard } from '@/components/academy/DailyChallengeCard';
import { UpgradeCTA } from '@/components/billing/UpgradeCTA';
import { useAuth } from '@/hooks/use-auth';
import { useAcademyCourses } from '@/hooks/use-user-progress';
import { useAcademyStats } from '@/hooks/use-academy-stats';
import { useEntitlements } from '@/hooks/use-entitlements';
import { Skeleton } from '@/components/ui/skeleton';

export function AcademyHomeClient() {
  const { t } = useTranslation('academy');
  const { isAuthenticated } = useAuth();
  const { data: courses, isLoading } = useAcademyCourses();
  const { data: stats, isLoading: isStatsLoading } = useAcademyStats(isAuthenticated);
  const { isPro } = useEntitlements();
  // Gate on isStatsLoading, not just totalXp — while stats is still in flight,
  // stats is undefined and totalXp falls back to 0, which would misfire the
  // "new to Academy" banner for returning users on every load.
  const isFirstVisit = isAuthenticated && !isStatsLoading && (stats?.totalXp ?? 0) === 0;

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
            <h1 className="text-2xl font-bold tracking-tight">{t('homePageTitle')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('homePageSubtitle')}
            </p>
          </div>
        </div>
        {isAuthenticated ? (
          <Link
            href="/academy/leaderboard"
            className="flex items-center gap-1.5 shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Trophy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('homePageLeaderboard')}</span>
            <ChevronRight className="h-3.5 w-3.5 opacity-50" />
          </Link>
        ) : (
          <Link
            href="/register?redirect=/academy"
            className="flex items-center gap-1.5 shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start free
          </Link>
        )}
      </div>

      {!isAuthenticated && (
        <p className="text-sm text-muted-foreground -mt-2">
          Free to start. Sign up to track progress, earn XP, and unlock every lesson.
        </p>
      )}

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
            <p className="text-sm font-semibold text-foreground">{t('homePageWelcomeTitle')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('homePageWelcomeDescription')}
            </p>
          </div>
        </motion.div>
      )}

      {/* Daily challenge — requires a signed-in user */}
      {isAuthenticated && <DailyChallengeCard />}

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
            <p className="text-sm font-semibold text-foreground">{t('homePageGraduatedTitle')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('homePageGraduatedDescription')}
            </p>
          </div>
          <UpgradeCTA label={t('homePageUnlockProCourses')} className="shrink-0" />
        </motion.div>
      )}

      {/* Course path */}
      {isLoading ? (
        <div className="flex flex-col items-center gap-4 py-4" role="status" aria-label={t('homePageLoadingCourses')}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-14 rounded-full" />
          ))}
        </div>
      ) : courses && courses.length > 0 ? (
        <AcademyPath courses={courses} />
      ) : (
        <div className="py-20 text-center text-sm text-muted-foreground">
          {t('homePageNoCourses')}
        </div>
      )}
    </div>
  );
}
