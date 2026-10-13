'use client';

import { useMemo, useState } from 'react';
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
import { LessonComplete, type LessonCompleteResult } from '@/components/academy/LessonComplete';
import { ACADEMY_STATS_QUERY_KEY } from '@/hooks/use-academy-stats';
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
}

interface Props {
  lesson: Lesson;
  courseSlug: string;
  courseTitle: string;
  nextLesson: { slug: string; title: string } | null;
  /** A free account playing a Pro course's free sample. */
  isSample: boolean;
}

export function LessonPlayer({ lesson, courseSlug, courseTitle, nextLesson, isSample }: Props) {
  const { t } = useTranslation('academy');
  const router = useRouter();
  const queryClient = useQueryClient();
  // Stats as they were before this lesson, so the reward screen's level bar
  // fills from where the learner actually was.
  const [finished, setFinished] = useState<{ before: AcademyStats | null } | null>(null);

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
      // Push the new stats into the cache immediately so XPBar animates without a refetch
      queryClient.setQueryData<AcademyStats>(ACADEMY_STATS_QUERY_KEY, data.stats);
      queryClient.invalidateQueries({ queryKey: ['academy-courses'] });
      queryClient.invalidateQueries({ queryKey: ['academy-progress', courseSlug] });
    },
  });

  function handleLessonComplete(score?: number) {
    // The reward screen shows at once: the XP is already known client-side,
    // and level and streak fill in when the save returns.
    setFinished({ before: queryClient.getQueryData<AcademyStats>(ACADEMY_STATS_QUERY_KEY) ?? null });
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
        <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-500 bg-emerald-500/10 rounded-full px-2.5 py-1">
          <Zap className="h-3 w-3 fill-emerald-500" />
          {t('lessonPlayerXpReward', { xp: lesson.xpReward })}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground mb-1.5">
          {lesson.type}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
          {lesson.title}
        </h1>
      </div>

      {lesson.type === 'read' && (
        <ReadLesson
          content={validatedContent.data as ReadContent}
          onComplete={() => handleLessonComplete()}
        />
      )}
      {lesson.type === 'quiz' && (
        <QuizLesson
          content={validatedContent.data as QuizContent}
          onComplete={(score) => handleLessonComplete(score)}
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
        />
      )}

    </div>
  );
}
