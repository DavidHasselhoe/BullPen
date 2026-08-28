'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { QuizLesson } from '@/components/academy/lessons/QuizLesson';
import { ACADEMY_STATS_QUERY_KEY } from '@/hooks/use-academy-stats';
import type { AcademyStats, CourseFinalQuiz as CourseFinalQuizType, QuizContent } from '@/types/academy';

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface ShuffledQuiz {
  content: QuizContent;
  /** originalIndexes[i] = the index into quiz.questions that shuffled.content.questions[i] came from. */
  originalIndexes: number[];
}

/** Reshuffles question order AND each question's option order (remapping correctIndex), so retrying isn't just "remember which button was right last time." */
function shuffleQuiz(quiz: CourseFinalQuizType): ShuffledQuiz {
  const originalIndexes = shuffle(quiz.questions.map((_, i) => i));
  const questions = originalIndexes.map((origIdx) => {
    const q = quiz.questions[origIdx];
    const optionOrder = shuffle(q.options.map((_, i) => i));
    return {
      question: q.question,
      options: optionOrder.map((i) => q.options[i]),
      correctIndex: optionOrder.indexOf(q.correctIndex),
      explanation: q.explanation,
    };
  });
  return { content: { questions }, originalIndexes };
}

interface SubmitResponse {
  success: boolean;
  passed: boolean;
  score: number;
  nextCourseSlug: string | null;
  stats: AcademyStats;
}

interface Props {
  quiz: CourseFinalQuizType;
  courseSlug: string;
  courseTitle: string;
}

export function CourseFinalQuiz({ quiz, courseSlug, courseTitle }: Props) {
  const { t } = useTranslation('academy');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  // attempt isn't read inside shuffleQuiz — it's included purely to force a
  // fresh shuffle on each retry (shuffleQuiz(quiz) alone would memoize forever).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shuffled = useMemo(() => shuffleQuiz(quiz), [quiz, attempt]);

  const submitMutation = useMutation<SubmitResponse, Error, number[]>({
    mutationFn: async (answers) => {
      const res = await fetch(`/api/academy/courses/${courseSlug}/quiz/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error('Failed to submit quiz');
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.setQueryData<AcademyStats>(ACADEMY_STATS_QUERY_KEY, data.stats);
      queryClient.invalidateQueries({ queryKey: ['academy-courses'] });
      queryClient.invalidateQueries({ queryKey: ['academy-progress', courseSlug] });
    },
  });

  // shuffleQuiz reorders both the questions and each question's options, but
  // the server grades against the *original* question order — map picked
  // indices back through originalIndexes (question position) and option text
  // (option position) before submitting.
  function handleComplete(_score: number, pickedInShuffledOrder: number[]) {
    const answersInOriginalOrder = new Array<number>(quiz.questions.length).fill(-1);
    shuffled.content.questions.forEach((q, shuffledIdx) => {
      const origIdx = shuffled.originalIndexes[shuffledIdx];
      const pickedOptionText = q.options[pickedInShuffledOrder[shuffledIdx]];
      answersInOriginalOrder[origIdx] = quiz.questions[origIdx].options.indexOf(pickedOptionText);
    });
    submitMutation.mutate(answersInOriginalOrder);
  }

  function handleRetry() {
    setResult(null);
    setAttempt((a) => a + 1);
  }

  if (result) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={result.passed ? 'pass' : 'fail'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-6 text-center space-y-4 ${
            result.passed
              ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
              : 'border-amber-400/30 bg-amber-400/[0.06]'
          }`}
        >
          <div
            className={`text-[11px] font-bold uppercase tracking-[0.22em] ${
              result.passed ? 'text-emerald-500' : 'text-amber-400'
            }`}
          >
            {result.passed ? t('courseFinalQuizNiceWork') : t('courseFinalQuizNotQuite')}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.passed
              ? t('courseFinalQuizPassedMessage', { score: Math.round(result.score * 100) })
              : t('courseFinalQuizFailedMessage', { score: Math.round(result.score * 100) })}
          </p>
          <div className="flex flex-col gap-2 pt-1">
            {result.passed ? (
              <Button
                size="lg"
                onClick={() =>
                  router.push(result.nextCourseSlug ? `/academy/${result.nextCourseSlug}` : '/academy')
                }
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold gap-1.5"
              >
                {t('pathNodeContinue')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={handleRetry}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold gap-1.5"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t('courseFinalQuizTryAgain')}
                </Button>
                <Link href={`/academy/${courseSlug}`}>
                  <Button size="lg" variant="ghost" className="w-full gap-1.5 text-muted-foreground">
                    <BookOpen className="h-4 w-4" />
                    {t('courseFinalQuizReviewLessons')}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80 mb-1.5">
          {t('courseFinalQuizLabel')}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{courseTitle}</h1>
        <p className="text-sm text-muted-foreground/85 mt-2 leading-relaxed">
          {t('courseFinalQuizIntro')}
        </p>
      </div>
      <QuizLesson key={attempt} content={shuffled.content} onComplete={handleComplete} />
    </div>
  );
}
