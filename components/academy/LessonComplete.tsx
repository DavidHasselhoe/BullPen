'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowRight, Flame, Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UpgradeCTA } from '@/components/billing/UpgradeCTA';
import { useAcademyCourses } from '@/hooks/use-user-progress';
import { findCurrentCourse } from '@/lib/academy/path-chapters';
import { levelForXp, xpToNextLevel, type AcademyStats } from '@/types/academy';

export interface LessonCompleteResult {
  xpAwarded: number;
  isFirstCompletion: boolean;
  courseCompleted: boolean;
  stats: AcademyStats;
}

/** What a free account would unlock: the rest of the course after its sample. */
export interface LockedAhead {
  remaining: number;
  xp: number;
  lessons: { title: string }[];
}

interface Props {
  courseSlug: string;
  courseTitle: string;
  xpReward: number;
  /** The next lesson in this course, or null after the last one. */
  nextLesson: { slug: string; title: string } | null;
  /** A free account just finished a Pro course's free sample. */
  finishedSample: boolean;
  /** Stats from before this lesson, so the level bar can fill from where it was. */
  before: AcademyStats | null;
  /** Null while the completion request is in flight. */
  result: LessonCompleteResult | null;
  failed: boolean;
  /** Quiz result, shown as "1 of 2 right". Null for lessons without questions. */
  score: { correct: number; total: number } | null;
  /** XP from the read lesson this check was paired with. */
  carriedXp: number;
  lockedAhead: LockedAhead | null;
  /** The live numbers behind a macro lesson (economyLinkForLesson). */
  economyHref?: string | null;
  /** Offered when some answers were wrong. */
  onRetry?: () => void;
}

/**
 * The one screen after a lesson. It replaces a 1.6s full-screen "+25" overlay
 * that was followed by a second page repeating the same number: two
 * celebrations, no sense of progress, and "Continue" went back to the course
 * page instead of into the next lesson.
 *
 * Shows what changed (XP, the level bar moving, the streak) and offers exactly
 * one next step. XP is known before the save returns, so it shows at once;
 * level and streak wait for the server's numbers rather than guessing.
 */
export function LessonComplete({
  courseSlug, courseTitle, xpReward, nextLesson, finishedSample, before: beforeThisLesson, result, failed, score, carriedXp, lockedAhead, economyHref, onRetry,
}: Props) {
  const { t } = useTranslation('academy');
  const reduced = useReducedMotion();
  const primaryRef = useRef<HTMLAnchorElement>(null);
  const { data: courses } = useAcademyCourses();

  // A paired check reports the read's XP too, and its level bar starts from
  // before the read, so the screen shows the whole unit.
  const before = beforeThisLesson && carriedXp > 0
    ? { ...beforeThisLesson, totalXp: Math.max(0, beforeThisLesson.totalXp - carriedXp), level: levelForXp(Math.max(0, beforeThisLesson.totalXp - carriedXp)) }
    : beforeThisLesson;
  const xp = (result ? result.xpAwarded : xpReward) + carriedXp;
  const alreadyEarned = result != null && xp === 0;
  const courseDone = result?.courseCompleted ?? false;
  const leveledUp = !!(result && before && result.stats.level > before.level);
  const streakGrew = !!(result && result.stats.currentStreak > (beforeThisLesson?.currentStreak ?? 0));
  const nextCourse = courseDone ? findCurrentCourse(courses ?? []) : null;

  // Enter continues, like every other step in a lesson.
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [result]);

  useEffect(() => {
    // First lesson of the day, a new level, or a finished course: the moments worth a burst.
    if (reduced || !(leveledUp || courseDone || streakGrew)) return;
    // Main-thread instance: the default one starts a blob: Web Worker, which the
    // app's CSP (script-src without worker-src) refuses with a console error.
    const fire = confetti.create(undefined, { resize: true, useWorker: false });
    fire({ particleCount: 70, spread: 75, origin: { y: 0.35 }, colors: ['#34d399', '#d4d4d4', '#737373'], scalar: 0.85, ticks: 180 });
    return () => fire.reset();
  }, [leveledUp, courseDone, streakGrew, reduced]);

  // Last lesson but the course isn't done: its final quiz is still ahead, on the course page.
  const primary = finishedSample
    ? null
    : nextLesson
      ? { href: `/academy/${courseSlug}/${nextLesson.slug}`, label: t('lessonCompleteNext', { title: nextLesson.title }) }
      : !courseDone
        ? { href: `/academy/${courseSlug}`, label: t('completePageContinueCourse') }
        : nextCourse
          ? { href: `/academy/${nextCourse.slug}`, label: t('lessonCompleteNextCourse', { title: nextCourse.title }) }
          : { href: '/academy', label: t('completePageBackToAcademy') };

  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <motion.img
        src="/illustrations/bull-celebrate.webp"
        alt=""
        aria-hidden
        width={112}
        height={112}
        initial={reduced ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="h-28 w-28 dark:invert"
      />

      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl" aria-live="polite">
        {courseDone ? t('completePageCourseTitle') : t('completePageLessonTitle')}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {finishedSample ? t('lessonCompleteSampleDescription') : courseTitle}
      </p>
      {score && (
        <p className="mt-3 text-sm font-medium text-foreground">
          {t('lessonCompleteScore', { correct: score.correct, total: score.total })}
        </p>
      )}

      <div className="mt-8 grid w-full grid-cols-2 gap-3">
        <Stat label={alreadyEarned ? t('lessonCompleteAlreadyEarned') : t('completionCelebrationXpEarned')}>
          <span className={alreadyEarned ? 'text-muted-foreground' : 'text-emerald-400'}>
            +<CountUp to={xp} reduced={!!reduced} />
          </span>
        </Stat>
        <Stat label={t('completePageDayStreak')}>
          {result ? (
            <span className="inline-flex items-center gap-1.5">
              <Flame className={streakGrew ? 'h-5 w-5 fill-orange-400/30 text-orange-400' : 'h-5 w-5 text-muted-foreground'} aria-hidden />
              {result.stats.currentStreak}
            </span>
          ) : (
            <Skeleton className="mx-auto h-8 w-12" />
          )}
        </Stat>
      </div>

      <LevelProgress before={before} after={result?.stats ?? null} reduced={!!reduced} />

      {failed && (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {t('lessonCompleteSaveFailed')}
        </p>
      )}

      {finishedSample && lockedAhead && lockedAhead.remaining > 0 && (
        <div className="mt-6 w-full rounded-2xl border border-border/50 bg-card px-4 py-3.5 text-left">
          <p className="mb-2 text-sm font-semibold text-foreground">
            {t('lessonCompleteStillAhead', { count: lockedAhead.remaining, xp: lockedAhead.xp })}
          </p>
          <ul className="space-y-1.5">
            {lockedAhead.lessons.map((l) => (
              <li key={l.title} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">{l.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 grid w-full gap-2.5">
        {finishedSample ? (
          <UpgradeCTA size="lg" label={t('lessonCompleteUnlockCourse', { course: courseTitle })} className="w-full" />
        ) : (
          primary && (
            <Button asChild size="lg" className="w-full font-semibold">
              <Link ref={primaryRef} href={primary.href}>
                <span className="truncate">{primary.label}</span>
                <ArrowRight className="ml-1.5 h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </Button>
          )
        )}
        {onRetry && (
          <Button type="button" size="lg" variant="outline" className="w-full gap-2" onClick={onRetry}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t('lessonCompleteRetry')}
          </Button>
        )}
        {economyHref && (
          <Button asChild size="lg" variant="outline" className="w-full">
            <Link href={economyHref}>{t('lessonCompleteLatestNumbers')}</Link>
          </Button>
        )}
        <Button asChild size="lg" variant="ghost" className="w-full text-muted-foreground">
          <Link href={finishedSample || courseDone ? '/academy' : `/academy/${courseSlug}`}>
            {finishedSample || courseDone ? t('completePageBackToAcademy') : t('lessonCompleteBackToCourse')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card px-4 py-4">
      <div className="text-3xl font-bold tabular-nums leading-none">{children}</div>
      <div className="mt-2 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function CountUp({ to, reduced }: { to: number; reduced: boolean }) {
  const [shown, setShown] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) return;
    const controls = animate(0, to, { duration: 0.6, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [to, reduced]);
  return <>{reduced ? to : shown}</>;
}

/**
 * The level bar filling from before this lesson to after it. A level-up fills
 * to the end first, then restarts from empty at the new level, so the moment
 * reads as crossing a line rather than the bar shrinking.
 */
function LevelProgress({ before, after, reduced }: { before: AcademyStats | null; after: AcademyStats | null; reduced: boolean }) {
  const { t } = useTranslation('academy');
  const end = after ? xpToNextLevel(after.totalXp) : null;
  const start = before ? xpToNextLevel(before.totalXp) : end;
  const fraction = (p: { current: number; needed: number } | null) => (p && p.needed > 0 ? Math.min(1, p.current / p.needed) : 0);

  const scale = useMotionValue(fraction(start));
  const transform = useTransform(scale, (v) => `scaleX(${v})`);
  // Set only after the bar has filled, so the number changes as it crosses.
  const [crossed, setCrossed] = useState(false);
  const levelUp = !!(start && end && end.level > start.level);
  const level = !end ? (start?.level ?? null) : levelUp && !reduced && !crossed ? start!.level : end.level;

  useEffect(() => {
    if (!end) return;
    if (reduced) {
      scale.set(fraction(end));
      return;
    }
    let cancelled = false;
    void (async () => {
      if (levelUp) {
        await animate(scale, 1, { duration: 0.5, ease: 'easeOut' });
        if (cancelled) return;
        setCrossed(true);
        scale.set(0);
      }
      await animate(scale, fraction(end), { duration: 0.6, ease: 'easeOut' });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the server's numbers arrive
  }, [after?.totalXp]);

  return (
    <div className="mt-3 w-full rounded-2xl border border-border/50 bg-card px-4 py-3.5 text-left">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
        {level != null ? (
          <span className="font-semibold text-foreground">{t('xpBarLevel', { level })}</span>
        ) : (
          <Skeleton className="h-3 w-14" />
        )}
        {end && (
          <span className="font-mono tabular-nums text-muted-foreground">
            {t('lessonCompleteToNextLevel', { xp: end.needed - end.current })}
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <motion.div style={{ transform }} className="h-full origin-left bg-foreground" />
      </div>
    </div>
  );
}
