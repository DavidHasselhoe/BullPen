'use client';

import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useAcademyStats } from '@/hooks/use-academy-stats';
import { xpToNextLevel } from '@/types/academy';
import { LevelBadge } from './LevelBadge';
import { StreakBadge } from './StreakBadge';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Sticky XP / level / streak bar. Lives at the top of the Academy section.
 * Animates the XP fill smoothly when totalXp changes (e.g. after a lesson
 * completion) using framer-motion's `animate(motionValue, ...)`.
 */
export function XPBar() {
  const { data: stats, isLoading } = useAcademyStats();

  const totalXp = stats?.totalXp ?? 0;
  const { current, needed, level } = xpToNextLevel(totalXp);
  const target = needed > 0 ? Math.min(1, current / needed) : 1;

  const progress = useMotionValue(target);
  const widthPct = useTransform(progress, (v) => `${v * 100}%`);
  const displayedXp = useMotionValue(totalXp);
  // Hoisted above the isLoading early return — must stay unconditional, same
  // as every other hook here, or React throws on the loading -> loaded switch.
  const roundedXp = useTransform(displayedXp, (v) => Math.round(v));

  useEffect(() => {
    const c1 = animate(progress, target, { duration: 0.8, ease: 'easeOut' });
    const c2 = animate(displayedXp, totalXp, { duration: 0.8, ease: 'easeOut' });
    return () => {
      c1.stop();
      c2.stop();
    };
  }, [target, totalXp, progress, displayedXp]);

  // Same footprint as the loaded bar so nothing reflows once real data arrives —
  // only the level number, XP count, fill width, and streak are placeholder-y.
  if (isLoading) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm px-3 py-2"
        role="status"
        aria-label="Loading progress"
      >
        <Skeleton className="h-6 w-6 rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-2.5 w-10" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        <Skeleton className="h-4 w-9 rounded-full shrink-0" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm px-3 py-2">
      <LevelBadge level={level} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">
            Level {level}
          </span>
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground/85">
            <motion.span>{roundedXp}</motion.span>
            {' XP'}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <motion.div
            style={{ width: widthPct }}
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
          />
        </div>
      </div>
      <StreakBadge
        streak={stats?.currentStreak ?? 0}
        lastActivityDate={stats?.lastActivityDate ?? null}
      />
    </div>
  );
}
