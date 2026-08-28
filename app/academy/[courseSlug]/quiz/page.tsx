'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProGate } from '@/components/billing/ProGate';
import { CourseFinalQuiz } from '@/components/academy/CourseFinalQuiz';
import type { CourseFinalQuiz as CourseFinalQuizType } from '@/types/academy';

interface QuizResponse {
  success: boolean;
  quiz: CourseFinalQuizType;
  locked: boolean;
  error?: string;
}

export default function CourseQuizPage() {
  const { t } = useTranslation('academy');
  const params = useParams<{ courseSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseSlug = params?.courseSlug ?? '';
  const courseTitle = searchParams.get('title') ?? courseSlug;

  const { data, isLoading } = useQuery<QuizResponse>({
    queryKey: ['academy-course-quiz', courseSlug],
    queryFn: async () => {
      const res = await fetch(`/api/academy/courses/${courseSlug}/quiz`);
      return res.json();
    },
    enabled: !!courseSlug,
    staleTime: 60 * 1000,
  });

  return (
    <div className="space-y-6 pt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/academy/${courseSlug}`)}
        className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('lessonPlayerBack')}
      </Button>

      {isLoading || !data ? (
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : !data.success ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5">
          <p className="text-sm text-red-400">{data.error ?? t('quizPageNotAvailable')}</p>
        </div>
      ) : data.locked ? (
        <ProGate
          feature="academy_pro"
          title={t('academyProGateTitle')}
          description={t('academyProGateDescriptionQuiz')}
        />
      ) : (
        <CourseFinalQuiz quiz={data.quiz} courseSlug={courseSlug} courseTitle={courseTitle} />
      )}
    </div>
  );
}
