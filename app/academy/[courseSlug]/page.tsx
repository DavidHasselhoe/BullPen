'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, HelpCircle, Shuffle, GitFork, CandlestickChart, PlayCircle, Check, Zap, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProGate } from '@/components/billing/ProGate';
import { cn } from '@/lib/utils';
import { useUserProgress } from '@/hooks/use-user-progress';
import type { LessonType, LessonWithCompletion } from '@/types/academy';

function getTypeMeta(t: TFunction): Record<LessonType, { label: string; icon: React.ComponentType<{ className?: string }> }> {
  return {
    read:        { label: t('courseOverviewTypeRead'),       icon: BookOpen },
    quiz:        { label: t('courseOverviewTypeQuiz'),       icon: HelpCircle },
    match:       { label: t('courseOverviewTypeMatch'),      icon: Shuffle },
    scenario:    { label: t('courseOverviewTypeScenario'),   icon: GitFork },
    'chart-tour': { label: t('courseOverviewTypeChartTour'), icon: CandlestickChart },
    demo:        { label: t('courseOverviewTypeDemo'),       icon: PlayCircle },
  };
}

export default function CourseOverviewPage() {
  const { t } = useTranslation('academy');
  const TYPE_META = getTypeMeta(t);
  const params = useParams<{ courseSlug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const courseSlug = params?.courseSlug ?? null;
  const { data, isLoading } = useUserProgress(courseSlug);
  const [skipping, setSkipping] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="space-y-5 pt-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <div className="space-y-2.5 pt-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { course, lessons, progress, locked, hasFinalQuiz } = data;
  const completedCount = lessons.filter((l) => l.completed).length;
  const totalXp = lessons.reduce((s, l) => s + l.xpReward, 0);
  const nextLesson: LessonWithCompletion | undefined =
    (progress?.last_lesson_id && lessons.find((l) => l.id === progress.last_lesson_id && !l.completed)) ||
    lessons.find((l) => !l.completed) ||
    lessons[0];
  const canSkip = course.isOptional && !locked && completedCount < lessons.length;
  const sampleLesson = lessons.find((l) => l.isSample);

  const handleSkip = async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      const res = await fetch(`/api/academy/courses/${course.slug}/skip`, { method: 'POST' });
      if (!res.ok) return;
      const json: { nextCourseSlug: string | null } = await res.json();
      queryClient.invalidateQueries({ queryKey: ['academy-courses'] });
      queryClient.invalidateQueries({ queryKey: ['academy-progress', course.slug] });
      router.push(json.nextCourseSlug ? `/academy/${json.nextCourseSlug}` : '/academy');
    } finally {
      setSkipping(false);
    }
  };

  return (
    <div className="space-y-6 pt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/academy')}
        className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('courseOverviewAllCourses')}
      </Button>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{course.title}</h1>
          {course.isOptional && (
            <span className="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 shrink-0">
              {t('pathNodeOptional')}
            </span>
          )}
        </div>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {course.description}
        </p>
        <p className="mt-3 flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
          {t('courseOverviewLessonCount', { count: lessons.length })}
          <span aria-hidden>·</span>
          <Zap className="h-3.5 w-3.5" aria-hidden />
          {t('courseOverviewXpAvailable', { xp: totalXp })}
        </p>
      </div>

      {/* The next step sits above the list, not under seven rows of it. */}
      {locked ? (
        <div className="space-y-3">
          {sampleLesson && !sampleLesson.completed && (
            <Button asChild size="lg" className="w-full font-semibold">
              <Link href={`/academy/${course.slug}/${sampleLesson.slug}`}>{t('courseOverviewTrySampleLesson')}</Link>
            </Button>
          )}
          <ProGate
            feature="academy_pro"
            title={t('academyProGateTitle')}
            description={
              sampleLesson?.completed
                ? t('academyProGateDescriptionAfterSample', { count: lessons.length - 1 })
                : t('academyProGateDescriptionLesson')
            }
          />
        </div>
      ) : (
        nextLesson &&
        completedCount < lessons.length && (
          <div>
            <Button asChild size="lg" className="w-full font-semibold">
              <Link href={`/academy/${course.slug}/${nextLesson.slug}`}>
                {completedCount === 0 ? t('courseOverviewStartCourse') : t('pathNodeContinue')}
              </Link>
            </Button>
            {canSkip && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={skipping}
                className="mt-2.5 w-full text-center text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
              >
                {skipping ? t('courseOverviewSkipping') : t('courseOverviewSkipCourse')}
              </button>
            )}
          </div>
        )
      )}

      {hasFinalQuiz && completedCount === lessons.length && !progress?.completed_at && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-center">
          <div>
            <p className="mb-1 text-sm font-semibold text-foreground">{t('courseOverviewLessonsDone')}</p>
            <p className="text-sm text-muted-foreground">{t('courseOverviewFinalQuizPrompt')}</p>
          </div>
          <Button asChild size="lg" className="w-full font-semibold">
            <Link href={`/academy/${course.slug}/quiz?title=${encodeURIComponent(course.title)}`}>{t('courseOverviewTakeFinalQuiz')}</Link>
          </Button>
        </div>
      )}

      {(!hasFinalQuiz || progress?.completed_at) && completedCount === lessons.length && lessons.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <p className="mb-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-foreground">
            <Check className="h-4 w-4" aria-hidden />
            {t('courseOverviewCourseComplete')}
          </p>
          <p className="text-sm text-muted-foreground">
            {hasFinalQuiz ? t('courseOverviewPassedQuizMessage') : t('courseOverviewFinishedLessonsMessage')}
          </p>
        </div>
      )}

      <ol className="space-y-2.5">
        {lessons.map((lesson) => {
          const meta = TYPE_META[lesson.type];
          // A Pro course's first lesson stays playable for everyone: the free sample.
          const rowLocked = locked && !lesson.isSample;
          const isNext = !locked && nextLesson?.id === lesson.id && !lesson.completed;
          const Icon = rowLocked ? Lock : meta.icon;
          const row = (
            <div
              className={cn(
                'flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 transition-colors',
                isNext ? 'border-foreground/40' : 'border-border/50',
                rowLocked ? 'opacity-70 hover:opacity-100' : 'hover:border-foreground/30'
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                {lesson.completed ? (
                  <Check className="h-4 w-4 text-foreground" aria-label={t('courseOverviewLessonDone')} />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{lesson.title}</div>
                <div className="text-xs text-muted-foreground">
                  {meta.label}
                  {isNext && <span className="ml-2 font-medium text-foreground">{t('courseOverviewUpNext')}</span>}
                  {locked && lesson.isSample && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{t('courseOverviewFreeSample')}</span>
                  )}
                  {rowLocked && <span className="sr-only">, {t('courseOverviewLockedPro')}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                <Zap className="h-3 w-3" aria-hidden />
                {lesson.xpReward}
              </div>
            </div>
          );
          return (
            <li key={lesson.id}>
              {/* Locked rows used to be inert; tapping one now goes where it can be opened. */}
              <Link href={rowLocked ? '/upgrade' : `/academy/${course.slug}/${lesson.slug}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {row}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
