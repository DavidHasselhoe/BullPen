'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReadLesson } from '@/components/academy/lessons/ReadLesson';
import { QuizLesson } from '@/components/academy/lessons/QuizLesson';
import { MatchLesson } from '@/components/academy/lessons/MatchLesson';
import { ScenarioLesson } from '@/components/academy/lessons/ScenarioLesson';
import { ChartTourLesson } from '@/components/academy/lessons/ChartTourLesson';
import { DemoLesson } from '@/components/academy/lessons/DemoLesson';
import { LessonComplete, type LessonCompleteResult, type LockedAhead } from '@/components/academy/LessonComplete';
import { ACADEMY_STATS_QUERY_KEY } from '@/hooks/use-academy-stats';
import { trackEvent } from '@/lib/analytics/track';
import {
  ReadContentSchema,
  QuizContentSchema,
  MatchContentSchema,
  ScenarioContentSchema,
  ChartTourContentSchema,
  DemoContentSchema,
} from '@/types/academy';
import type {
  AcademyStats,
  Lesson,
  ReadContent,
  QuizContent,
  MatchContent,
  ScenarioContent,
  ChartTourContent,
  DemoContent,
} from '@/types/academy';

interface CompleteResponse extends LessonCompleteResult {
  success: boolean;
  isFirstCompletion: boolean;
}

interface Props {
  lesson: Lesson;
  courseSlug: string;
  courseTitle: string;
  nextLesson: { slug: string; title: string } | null;
  /** A free account playing a Pro course's free sample. */
  isSample: boolean;
  /** "Lesson 3 of 9" in the top bar. */
  position: { current: number; total: number };
  /**
   * The check that belongs to this read lesson. A read and its check play as
   * one unit with one reward screen: celebrating three paragraphs and then
   * two questions separately made both rewards cheap.
   */
  continueInto: { slug: string } | null;
  /** XP the paired read just earned, added to this check's reward. */
  carriedXp: number;
  /** For a finished free sample: what the rest of the course holds. */
  lockedAhead: LockedAhead | null;
  /** No lesson in this course is completed yet: opening this one starts the course. */
  courseUntouched: boolean;
}

export function LessonPlayer({ lesson, courseSlug, courseTitle, nextLesson, isSample, position, continueInto, carriedXp, lockedAhead, courseUntouched }: Props) {
  const { t } = useTranslation('academy');
  const router = useRouter();
  const queryClient = useQueryClient();
  // Stats as they were before this lesson, so the reward screen's level bar
  // fills from where the learner actually was.
  const [finished, setFinished] = useState<{ before: AcademyStats | null; score: { correct: number; total: number } | null } | null>(null);
  // Bumped by "Try again" so the lesson remounts fresh.
  const [attempt, setAttempt] = useState(0);
  const [handingOff, setHandingOff] = useState(false);

  // Validate the JSONB content against its lesson type's schema.
  const validatedContent = useMemo(() => {
    switch (lesson.type) {
      case 'read':       return ReadContentSchema.safeParse(lesson.content);
      case 'quiz':       return QuizContentSchema.safeParse(lesson.content);
      case 'match':      return MatchContentSchema.safeParse(lesson.content);
      case 'scenario':   return ScenarioContentSchema.safeParse(lesson.content);
      case 'chart-tour': return ChartTourContentSchema.safeParse(lesson.content);
      case 'demo':       return DemoContentSchema.safeParse(lesson.content);
    }
  }, [lesson.type, lesson.content]);

  // Analytics: started on mount, abandoned if the learner leaves (in-app
  // navigation or closing the tab) before handleLessonComplete runs.
  const { current, total } = position;
  const eventProps = useMemo(
    () => ({ course_slug: courseSlug, lesson_slug: lesson.slug, lesson_type: lesson.type, position: current, lesson_count: total, is_sample: isSample }),
    [courseSlug, lesson.slug, lesson.type, current, total, isSample],
  );
  const finishedRef = useRef(false);
  const startedAtRef = useRef(0);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    if (!startedAtRef.current) {
      startedAtRef.current = Date.now();
      if (courseUntouched) trackEvent('academy_course_started', { course_slug: courseSlug, is_sample: isSample });
      trackEvent('academy_lesson_started', eventProps);
    }
    const abandon = (beacon: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      trackEvent(
        'academy_lesson_abandoned',
        { ...eventProps, seconds_in_lesson: Math.round((Date.now() - startedAtRef.current) / 1000) },
        beacon ? { transport: 'sendBeacon' } : undefined,
      );
    };
    const onPageHide = () => abandon(true);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      mountedRef.current = false;
      // Deferred so Strict Mode's dev-only unmount/remount doesn't count as leaving.
      setTimeout(() => { if (!mountedRef.current) abandon(false); }, 0);
    };
  }, [eventProps, courseUntouched, courseSlug, isSample]);

  const completeMutation = useMutation<CompleteResponse, Error, { score?: number }>({
    mutationFn: async ({ score }) => {
      const res = await fetch(`/api/academy/lessons/${lesson.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) throw new Error('Failed to record completion');
      return res.json();
    },
    onSuccess: (data) => {
      // courseCompleted stays true on replays; only the first pass finishes the course.
      if (data.courseCompleted && data.isFirstCompletion) trackEvent('academy_course_completed', { course_slug: courseSlug, via: 'last_lesson' });
      // Push the new stats into the cache immediately so XPBar animates without a refetch
      queryClient.setQueryData<AcademyStats>(ACADEMY_STATS_QUERY_KEY, data.stats);
      queryClient.invalidateQueries({ queryKey: ['academy-courses'] });
      queryClient.invalidateQueries({ queryKey: ['academy-progress', courseSlug] });
    },
  });

  function handleLessonComplete(score?: number, questions?: number) {
    const before = queryClient.getQueryData<AcademyStats>(ACADEMY_STATS_QUERY_KEY) ?? null;
    if (!finishedRef.current) {
      finishedRef.current = true;
      trackEvent('academy_lesson_completed', { ...eventProps, score: score ?? null, seconds_in_lesson: Math.round((Date.now() - startedAtRef.current) / 1000) });
      // The sample's reward screen is where a free account meets the paywall.
      if (isSample) trackEvent('academy_paywall_shown', { course_slug: courseSlug, source: 'sample_complete' });
    }
    if (continueInto) {
      // Save, then go straight into the check; the reward comes after it.
      if (handingOff) return;
      setHandingOff(true);
      completeMutation
        .mutateAsync({ score })
        .then((d) => router.push(`/academy/${courseSlug}/${continueInto.slug}?carry=${d.xpAwarded}`))
        .catch(() => setFinished({ before, score: null }));
      return;
    }
    // The reward screen shows at once: the XP is already known client-side,
    // and level and streak fill in when the save returns.
    window.scrollTo({ top: 0 });
    setFinished({
      before,
      score: score != null && questions ? { correct: Math.round(score * questions), total: questions } : null,
    });
    completeMutation.mutate({ score });
  }

  if (!validatedContent?.success) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5">
        <p className="text-sm text-red-400">
          {t('lessonPlayerInvalidContent')}
        </p>
      </div>
    );
  }

  if (finished) {
    return (
      <LessonComplete
        courseSlug={courseSlug}
        courseTitle={courseTitle}
        xpReward={lesson.xpReward}
        nextLesson={nextLesson}
        finishedSample={isSample}
        before={finished.before}
        result={completeMutation.data ?? null}
        failed={completeMutation.isError}
        score={finished.score}
        carriedXp={carriedXp}
        lockedAhead={lockedAhead}
        onRetry={
          finished.score && finished.score.correct < finished.score.total
            ? () => {
                setFinished(null);
                setAttempt((n) => n + 1);
                window.scrollTo({ top: 0 });
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/academy/${courseSlug}`)}
          className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('lessonPlayerBack')}
        </Button>
        <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
          <span>{t('lessonPlayerPosition', { current: position.current, total: position.total })}</span>
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" aria-hidden />
            {t('lessonPlayerXpReward', { xp: lesson.xpReward })}
          </span>
        </div>
      </div>

      <h1 className="text-2xl font-bold leading-tight tracking-tight text-balance sm:text-3xl">
        {lesson.title}
      </h1>

      <Fragment key={attempt}>

      {lesson.type === 'read' && (
        <ReadLesson
          content={validatedContent.data as ReadContent}
          onComplete={() => handleLessonComplete()}
        />
      )}
      {lesson.type === 'quiz' && (
        <QuizLesson
          content={validatedContent.data as QuizContent}
          onComplete={(score) => handleLessonComplete(score, (validatedContent.data as QuizContent).questions.length)}
        />
      )}
      {lesson.type === 'match' && (
        <MatchLesson
          content={validatedContent.data as MatchContent}
          onComplete={() => handleLessonComplete(1)}
        />
      )}
      {lesson.type === 'scenario' && (
        <ScenarioLesson
          content={validatedContent.data as ScenarioContent}
          onComplete={(score) => handleLessonComplete(score)}
        />
      )}
      {lesson.type === 'chart-tour' && (
        <ChartTourLesson
          content={validatedContent.data as ChartTourContent}
          onComplete={() => handleLessonComplete()}
        />
      )}
      {lesson.type === 'demo' && (
        <DemoLesson
          content={validatedContent.data as DemoContent}
          onComplete={() => handleLessonComplete()}
          courseHref={`/academy/${courseSlug}`}
        />
      )}
      </Fragment>

    </div>
  );
}
