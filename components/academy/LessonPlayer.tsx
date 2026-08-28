'use client';

import { useMemo, useRef, useState } from 'react';
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
import { CompletionCelebration } from '@/components/academy/CompletionCelebration';
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

interface CompleteResponse {
  success: boolean;
  xpAwarded: number;
  isFirstCompletion: boolean;
  courseCompleted: boolean;
  stats: AcademyStats;
}

interface Props {
  lesson: Lesson;
  courseSlug: string;
}

export function LessonPlayer({ lesson, courseSlug }: Props) {
  const { t } = useTranslation('academy');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [celebrating, setCelebrating] = useState(false);
  const pendingCompletion = useRef<Promise<CompleteResponse> | null>(null);

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
    // Show the celebration immediately — the XP value is already known
    // client-side (lesson.xpReward), so there's no reason to block the
    // overlay on the completion request's round-trip to Supabase.
    setCelebrating(true);
    pendingCompletion.current = completeMutation.mutateAsync({ score });
  }

  // Fires once the celebration overlay's own display timer elapses. Awaits
  // the (very likely already-resolved, by then) completion request so the
  // next screen always gets real stats instead of guessed ones.
  async function handleCelebrationDismiss() {
    try {
      const data = await pendingCompletion.current;
      if (!data) return;
      const params = new URLSearchParams({
        courseSlug,
        xp: String(data.xpAwarded),
        streak: String(data.stats.currentStreak),
        courseDone: data.courseCompleted ? '1' : '0',
      });
      router.push(`/academy/complete?${params.toString()}`);
    } catch {
      // Completion failed to save — don't strand the user on a screen
      // celebrating progress that wasn't recorded.
      router.push(`/academy/${courseSlug}`);
    }
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
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80 mb-1.5">
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

      {celebrating && (
        <CompletionCelebration xpEarned={lesson.xpReward} onDismiss={handleCelebrationDismiss} />
      )}
    </div>
  );
}
