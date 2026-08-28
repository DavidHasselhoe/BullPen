'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
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
 * (outlined emerald ring, course icon, "Continue" chip), available-but-not-
 * current (plain outline, course icon — free and Pro tracks unlock
 * independently in app/api/academy/courses/route.ts, so more than one course
 * can be unlocked at once even though only one is ever "current"), locked —
 * either by progression or by needing Pro (flat gray fill, lock icon).
 *
 * Icon/background are keyed off `course.isLocked` (the real gate state from
 * the API), never off "not completed and not current" — that used to be the
 * implicit fallback and silently mislabeled available-but-not-current
 * courses as locked, with no background class matching either.
 */
export function PathNode({ course, isCurrent, offset, align, circleRef }: Props) {
  const { t } = useTranslation('academy');
  const isProLocked = course.lockedReason === 'pro';
  // lockedReason is derived from whether the PREVIOUS course in this track is
  // complete, independent of this course's own completion — so a course
  // tested-out-of-order (its final quiz passed while an earlier course in the
  // chain is still unfinished) can still read lockedReason: 'progression'
  // even though it's done. isCompleted always wins: a finished course must
  // stay clickable so the user can go back and review it.
  const isProgressionLocked = course.lockedReason === 'progression' && !course.isCompleted;
  const isInteractive = course.isCompleted || !isProgressionLocked;

  const circle = (
    <div
      ref={circleRef}
      className={cn(
        'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
        course.isCompleted && 'border-emerald-500 bg-emerald-500',
        isCurrent && 'border-2 border-emerald-500 bg-card shadow-[0_0_0_4px_rgba(34,197,94,0.12)] academy-current-pulse',
        course.isLocked && 'border-border bg-muted',
        !course.isCompleted && !isCurrent && !course.isLocked && 'border-border bg-card'
      )}
    >
      {course.isCompleted ? (
        <Check className="h-6 w-6 text-white" strokeWidth={2.5} />
      ) : course.isLocked ? (
        <Lock className="h-5 w-5 text-muted-foreground/70" />
      ) : (
        <CourseIcon name={course.icon} className={cn('h-5 w-5', isCurrent ? 'text-emerald-500' : 'text-foreground/70')} />
      )}
      {isProLocked && (
        <span className="absolute -bottom-1 -right-1 rounded bg-amber-400/15 px-1 py-0.5 text-[11px] font-bold tracking-wide text-amber-500 border border-card">
          {t('pathNodePro')}
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
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/80">
            {course.difficulty}
          </span>
        )}
        {course.isOptional && (
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            {t('pathNodeOptional')}
          </span>
        )}
        {course.skipped && (
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            {t('pathNodeSkipped')}
          </span>
        )}
        <span className="text-[11px] font-mono text-muted-foreground/70 tabular-nums">
          {t('pathNodeLessonProgress', { completed: course.completedLessons, total: course.totalLessons })}
        </span>
      </div>
      {isCurrent && (
        <div className={cn('mt-1.5 inline-flex items-center gap-1 text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-500', align === 'left' && 'flex-row-reverse')}>
          <Play className="h-2.5 w-2.5 fill-current" />
          {course.completedLessons > 0 ? t('pathNodeContinue') : t('pathNodeStart')}
        </div>
      )}
    </div>
  );

  // The horizontal zigzag offset is a plain, static transform on the OUTER
  // element; the hover/tap bounce is a separate framer-motion `y`/`scale` on
  // an INNER element. Framer Motion takes exclusive ownership of `transform`
  // on whichever element animates x/y/scale, so combining the static offset
  // and the hover animation on the same node silently dropped the offset
  // every time the hover animation ran — the node would jump back to center.
  const content = (
    <div
      style={{ transform: `translateX(${offset}px)` }}
      data-path-node
      data-completed={course.isCompleted}
    >
      <motion.div
        whileHover={isInteractive ? { y: -2 } : undefined}
        whileTap={isInteractive ? { scale: 0.98 } : undefined}
        transition={{ duration: 0.15 }}
        className={cn('flex max-w-[13.5rem] items-center gap-3 sm:max-w-[21rem]', align === 'left' && 'flex-row-reverse')}
      >
        {circle}
        {label}
      </motion.div>
    </div>
  );

  const showSkipToQuiz = isProgressionLocked && course.hasFinalQuiz;

  if (!isInteractive) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-2.5">
        <div aria-disabled="true">{content}</div>
        {showSkipToQuiz && (
          <Link
            href={`/academy/${course.slug}/quiz?title=${encodeURIComponent(course.title)}`}
            className="text-[11px] font-mono text-muted-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors"
          >
            {t('pathNodeSkipToQuiz')}
          </Link>
        )}
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
