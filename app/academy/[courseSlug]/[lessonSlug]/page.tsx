'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { LessonPlayer } from '@/components/academy/LessonPlayer';
import { useUserProgress } from '@/hooks/use-user-progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ProGate } from '@/components/billing/ProGate';
import type { Lesson } from '@/types/academy';

export default function LessonPage() {
  const { t } = useTranslation('academy');
  const params = useParams<{ courseSlug: string; lessonSlug: string }>();
  const courseSlug = params?.courseSlug ?? null;
  const lessonSlug = params?.lessonSlug ?? null;
  const { data, isLoading } = useUserProgress(courseSlug);
  const searchParams = useSearchParams();

  if (isLoading || !data) {
    return (
      <div className="space-y-4 pt-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const lessonRow = data.lessons.find((l) => l.slug === lessonSlug);
  if (!lessonRow || !courseSlug) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card p-6 text-center text-sm text-muted-foreground">
        {t('lessonPageNotFound')}
      </div>
    );
  }

  // Content is omitted by the API for Pro-gated courses viewed by non-Pro
  // users, except the first lesson (the free sample). The course overview page
  // already stops sequential navigation here, but direct URL access hits this
  // defensively too.
  if (!lessonRow.content) {
    return (
      <ProGate
        feature="academy_pro"
        title={t('academyProGateTitle')}
        description={t('academyProGateDescriptionLesson')}
      />
    );
  }

  const lesson: Lesson = {
    id: lessonRow.id,
    courseId: lessonRow.courseId,
    slug: lessonRow.slug,
    title: lessonRow.title,
    type: lessonRow.type,
    orderIndex: lessonRow.orderIndex,
    xpReward: lessonRow.xpReward,
    content: lessonRow.content,
  };

  const index = data.lessons.indexOf(lessonRow);
  const next = data.lessons[index + 1];
  const isSample = data.locked && !!lessonRow.isSample;
  // A read and the check drafted from it ("<slug>-check") play as one unit.
  const pairedCheck = lesson.type === 'read' && next?.slug === `${lesson.slug}-check` && next.content ? next : null;
  const prev = data.lessons[index - 1];
  // ?carry is display-only (what the paired read just earned); XP itself is
  // always awarded server-side. Ignored unless this lesson really is that read's check.
  const carry = Number(searchParams.get('carry'));
  const carriedXp = prev && lesson.slug === `${prev.slug}-check` && Number.isFinite(carry) && carry > 0 ? Math.min(carry, prev.xpReward) : 0;
  const rest = data.lessons.slice(index + 1);
  return (
    <LessonPlayer
      // A new lesson is a fresh player: the reward screen must not carry over.
      key={lesson.id}
      lesson={lesson}
      courseSlug={courseSlug}
      courseTitle={data.course.title}
      // A free account's next lesson in a Pro course is behind the paywall.
      nextLesson={next && next.content ? { slug: next.slug, title: next.title } : null}
      isSample={isSample}
      position={{ current: index + 1, total: data.lessons.length }}
      continueInto={pairedCheck ? { slug: pairedCheck.slug } : null}
      carriedXp={carriedXp}
      courseUntouched={!data.lessons.some((l) => l.completed)}
      lockedAhead={
        isSample
          ? { remaining: rest.length, xp: rest.reduce((n, l) => n + l.xpReward, 0), lessons: rest.slice(0, 3).map((l) => ({ title: l.title })) }
          : null
      }
    />
  );
}
