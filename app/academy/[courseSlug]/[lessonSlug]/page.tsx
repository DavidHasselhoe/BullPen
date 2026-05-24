'use client';

import { useParams } from 'next/navigation';
import { LessonPlayer } from '@/components/academy/LessonPlayer';
import { useUserProgress } from '@/hooks/use-user-progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { Lesson } from '@/types/academy';

export default function LessonPage() {
  const params = useParams<{ courseSlug: string; lessonSlug: string }>();
  const courseSlug = params?.courseSlug ?? null;
  const lessonSlug = params?.lessonSlug ?? null;
  const { data, isLoading } = useUserProgress(courseSlug);

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
        Lesson not found.
      </div>
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

  return <LessonPlayer lesson={lesson} courseSlug={courseSlug} />;
}
