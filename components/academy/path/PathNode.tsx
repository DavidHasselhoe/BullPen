'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Lock, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CourseIcon } from '../CourseIcon';
import type { CourseWithProgress } from '@/types/academy';

interface Props {
  course: CourseWithProgress;
  isCurrent: boolean;
  offset: number;
  align: 'left' | 'right';
  /** Attached to the circle itself (not the row) so the path connector measures the node's true visual position, including its offset transform. */
  circleRef?: (el: HTMLDivElement | null) => void;
}

/**
 * One node on the /academy path. State is carried by shape + icon + label
 * together, never color alone: completed (filled emerald, check), current
 * (outlined emerald ring, course icon, "Continue" chip), locked — either by
 * progression or by needing Pro (flat gray fill, lock icon).
 */
export function PathNode({ course, isCurrent, offset, align, circleRef }: Props) {
  const isProLocked = course.lockedReason === 'pro';
  const isProgressionLocked = course.lockedReason === 'progression';
  const isInteractive = !isProgressionLocked;

  const circle = (
    <div
      ref={circleRef}
      className={cn(
        'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
        course.isCompleted && 'border-emerald-500 bg-emerald-500',
        isCurrent && 'border-2 border-emerald-500 bg-card shadow-[0_0_0_4px_rgba(34,197,94,0.12)] academy-current-pulse',
        (isProgressionLocked || isProLocked) && 'border-border bg-muted/50'
      )}
    >
      {course.isCompleted ? (
        <Check className="h-6 w-6 text-white" strokeWidth={2.5} />
      ) : isCurrent ? (
        <CourseIcon name={course.icon} className="h-5 w-5 text-emerald-500" />
      ) : (
        <Lock className="h-5 w-5 text-muted-foreground/70" />
      )}
      {isProLocked && (
        <span className="absolute -bottom-1 -right-1 rounded bg-amber-400/15 px-1 py-0.5 text-[8px] font-bold tracking-wide text-amber-500 border border-card">
          PRO
        </span>
      )}
    </div>
  );

  const label = (
    <div className={cn('min-w-0', align === 'left' && 'text-right')}>
      <div
        className={cn(
          'text-sm font-bold tracking-tight leading-snug',
          (isProgressionLocked || isProLocked) && 'text-muted-foreground/70'
        )}
      >
        {course.title}
      </div>
      <div className={cn('mt-1 flex flex-wrap items-center gap-1.5', align === 'left' && 'justify-end')}>
        {course.difficulty && (
          <span className="text-[9px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/80">
            {course.difficulty}
          </span>
        )}
        {course.isOptional && (
          <span className="text-[9px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            Optional
          </span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
          {course.completedLessons}/{course.totalLessons} lessons
        </span>
      </div>
      {isCurrent && (
        <div className={cn('mt-1.5 inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-500', align === 'left' && 'flex-row-reverse')}>
          <Play className="h-2.5 w-2.5 fill-current" />
          {course.completedLessons > 0 ? 'Continue' : 'Start'}
        </div>
      )}
    </div>
  );

  const content = (
    <motion.div
      whileHover={isInteractive ? { y: -2 } : undefined}
      whileTap={isInteractive ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.15 }}
      style={{ transform: `translateX(${offset}px)` }}
      className={cn('flex max-w-[13.5rem] items-center gap-3 sm:max-w-[21rem]', align === 'left' && 'flex-row-reverse')}
      data-path-node
      data-completed={course.isCompleted}
    >
      {circle}
      {label}
    </motion.div>
  );

  if (!isInteractive) {
    return (
      <div className="flex justify-center py-2.5" aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <div className="flex justify-center py-2.5">
      <Link
        href={isProLocked ? '/upgrade' : `/academy/${course.slug}`}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {content}
      </Link>
    </div>
  );
}
