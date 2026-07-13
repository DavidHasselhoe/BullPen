'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, HelpCircle, Shuffle, GitFork, CandlestickChart, Check, Zap, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProGate } from '@/components/billing/ProGate';
import { cn } from '@/lib/utils';
import { useUserProgress } from '@/hooks/use-user-progress';
import type { LessonType, LessonWithCompletion } from '@/types/academy';

const TYPE_META: Record<LessonType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  read:        { label: 'Read',       icon: BookOpen },
  quiz:        { label: 'Quiz',       icon: HelpCircle },
  match:       { label: 'Match',      icon: Shuffle },
  scenario:    { label: 'Scenario',   icon: GitFork },
  'chart-tour': { label: 'Chart Tour', icon: CandlestickChart },
};

export default function CourseOverviewPage() {
  const params = useParams<{ courseSlug: string }>();
  const router = useRouter();
  const courseSlug = params?.courseSlug ?? null;
  const { data, isLoading } = useUserProgress(courseSlug);

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

  const { course, lessons, progress, locked } = data;
  const completedCount = lessons.filter((l) => l.completed).length;
  const totalXp = lessons.reduce((s, l) => s + l.xpReward, 0);
  const nextLesson: LessonWithCompletion | undefined =
    (progress?.last_lesson_id && lessons.find((l) => l.id === progress.last_lesson_id && !l.completed)) ||
    lessons.find((l) => !l.completed) ||
    lessons[0];

  return (
    <div className="space-y-6 pt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/academy')}
        className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All courses
      </Button>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{course.title}</h1>
        <p className="text-sm text-muted-foreground/75 mt-2 leading-relaxed">
          {course.description}
        </p>
        <div className="flex items-center gap-3 mt-3 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground/55">
          <span>{lessons.length} lessons</span>
          <span>•</span>
          <span className="text-emerald-500/80 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {totalXp} XP available
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {lessons.map((lesson) => {
          const meta = TYPE_META[lesson.type];
          const Icon = locked ? Lock : meta.icon;
          const row = (
            <div
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors',
                'bg-card',
                locked
                  ? 'border-border/40 opacity-70'
                  : 'hover:border-emerald-500/30',
                lesson.completed ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-border/50'
              )}
            >
              <div
                className={cn(
                  'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                  lesson.completed ? 'bg-emerald-500/15' : 'bg-muted/40'
                )}
              >
                {lesson.completed ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{lesson.title}</div>
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/55">
                  {meta.label}
                </div>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-500/80 shrink-0">
                <Zap className="h-3 w-3" />
                {lesson.xpReward}
              </div>
            </div>
          );
          return locked ? (
            <div key={lesson.id}>{row}</div>
          ) : (
            <Link key={lesson.id} href={`/academy/${course.slug}/${lesson.slug}`}>
              {row}
            </Link>
          );
        })}
      </div>

      {locked ? (
        <ProGate
          feature="academy_pro"
          title="Unlock this course with Pro"
          description="Intermediate and advanced Academy courses are a Pro benefit — upgrade to start learning."
        />
      ) : (
        nextLesson &&
        completedCount < lessons.length && (
          <div className="pt-2">
            <Link href={`/academy/${course.slug}/${nextLesson.slug}`}>
              <Button
                size="lg"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
              >
                {completedCount === 0 ? 'Start course' : 'Continue'}
              </Button>
            </Link>
          </div>
        )
      )}

      {completedCount === lessons.length && lessons.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-500 mb-1">
            Course complete
          </div>
          <p className="text-sm text-muted-foreground">
            You finished every lesson. Keep going with the next course on the home page.
          </p>
        </div>
      )}
    </div>
  );
}
