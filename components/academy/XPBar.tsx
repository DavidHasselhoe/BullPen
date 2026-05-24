'use client';

import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useAcademyStats } from '@/hooks/use-academy-stats';
import { xpToNextLevel } from '@/types/academy';
import { LevelBadge } from './LevelBadge';
import { StreakBadge } from './StreakBadge';

/**
 * Sticky XP / level / streak bar. Lives at the top of the Academy section.
 * Animates the XP fill smoothly when totalXp changes (e.g. after a lesson
 * completion) using framer-motion's `animate(motionValue, ...)`.
 */
export function XPBar() {
  const { data: stats } = useAcademyStats();

  const totalXp = stats?.totalXp ?? 0;
  const { current, needed, level } = xpToNextLevel(totalXp);
  const target = needed > 0 ? Math.min(1, current / needed) : 1;

  const progress = useMotionValue(target);
  const widthPct = useTransform(progress, (v) => `${v * 100}%`);
  const displayedXp = useMotionValue(totalXp);

  useEffect(() => {
    const c1 = animate(progress, target, { duration: 0.8, ease: 'easeOut' });
    const c2 = animate(displayedXp, totalXp, { duration: 0.8, ease: 'easeOut' });
    return () => {
      c1.stop();
      c2.stop();
    };
  }, [target, totalXp, progress, displayedXp]);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm px-3 py-2">
      <LevelBadge level={level} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/55">
            Level {level}
          </span>
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground/70">
            <motion.span>{useTransform(displayedXp, (v) => Math.round(v))}</motion.span>
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
