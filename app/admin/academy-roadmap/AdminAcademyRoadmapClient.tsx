'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AcademyRoadmapListResponse, DraftCourseRow, DraftLessonRow } from '@/app/api/admin/academy-roadmap/route';

const QUERY_KEY = ['academy-roadmap-drafts'];

/** Light, readable per-type render — not the full interactive lesson
 * player, just enough for a human to catch a factual or schema error
 * before approving. */
function LessonPreview({ lesson }: { lesson: DraftLessonRow }) {
  if (lesson.type === 'read') {
    const c = lesson.content as { sections: { text: string; highlightedTerms: { term: string; definition: string }[] }[]; funFact?: string };
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        {c.sections?.map((s, i) => (
          <div key={i}>
            <p>{s.text}</p>
            {s.highlightedTerms?.length > 0 && (
              <ul className="ml-4 mt-1 list-disc text-xs">
                {s.highlightedTerms.map((t, j) => (
                  <li key={j}><strong className="text-foreground">{t.term}:</strong> {t.definition}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {c.funFact && <p className="italic">Fun fact: {c.funFact}</p>}
      </div>
    );
  }
  if (lesson.type === 'quiz') {
    const c = lesson.content as { questions: { question: string; options: string[]; correctIndex: number; explanation: string }[] };
    return (
      <div className="space-y-3 text-sm">
        {c.questions?.map((q, i) => (
          <div key={i}>
            <p className="font-medium text-foreground">{i + 1}. {q.question}</p>
            <ul className="ml-4 list-disc text-muted-foreground">
              {q.options.map((o, j) => (
                <li key={j} className={j === q.correctIndex ? 'font-semibold text-emerald-500' : undefined}>{o}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground/80">{q.explanation}</p>
          </div>
        ))}
      </div>
    );
  }
  if (lesson.type === 'match') {
    const c = lesson.content as { pairs: { term: string; definition: string }[] };
    return (
      <ul className="ml-4 list-disc text-sm text-muted-foreground">
        {c.pairs?.map((p, i) => <li key={i}><strong className="text-foreground">{p.term}:</strong> {p.definition}</li>)}
      </ul>
    );
  }
  if (lesson.type === 'scenario') {
    const c = lesson.content as { setup: string; choices: { label: string; feedback: string; isCorrect: boolean }[] };
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">{c.setup}</p>
        <ul className="ml-4 list-disc">
          {c.choices?.map((ch, i) => (
            <li key={i} className={ch.isCorrect ? 'text-emerald-500' : 'text-muted-foreground'}>
              <strong>{ch.label}</strong> — {ch.feedback}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <pre className="overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(lesson.content, null, 2)}</pre>;
}

function DraftCard({ course }: { course: DraftCourseRow }) {
  const queryClient = useQueryClient();
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: () => fetch(`/api/admin/academy-roadmap/${course.id}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
  const reject = useMutation({
    mutationFn: () => fetch(`/api/admin/academy-roadmap/${course.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{course.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {course.unitLabel ?? 'Uncategorized'} · {course.difficulty ?? 'unset'} · {course.requiresPro ? 'Pro' : 'Free'} · {course.lessons.length} lessons
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={reject.isPending} onClick={() => reject.mutate()}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            <Button size="sm" className="gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600" disabled={approve.isPending} onClick={() => approve.mutate()}>
              <Check className="h-3.5 w-3.5" /> Approve & Publish
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{course.description}</p>
        {course.lessons.map((lesson) => (
          <div key={lesson.id} className="rounded-lg border border-border/40">
            <button
              onClick={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
              aria-expanded={expandedLesson === lesson.id}
            >
              <span>{lesson.orderIndex + 1}. {lesson.title} <span className="text-muted-foreground">({lesson.type})</span></span>
              {expandedLesson === lesson.id ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            </button>
            {expandedLesson === lesson.id && (
              <div className={cn('border-t border-border/40 px-3 py-2.5')}>
                <LessonPreview lesson={lesson} />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AdminAcademyRoadmapClient() {
  const { data, isLoading } = useQuery<AcademyRoadmapListResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => fetch('/api/admin/academy-roadmap').then((r) => r.json()),
    staleTime: 10_000,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">Academy Roadmap — Pending Review</h1>
        <p className="text-sm text-muted-foreground">
          Courses generated by the weekly cron, staged unpublished until approved.
        </p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && (data?.drafts.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">Nothing pending review.</p>
      )}
      {data?.drafts.map((course) => <DraftCard key={course.id} course={course} />)}
    </div>
  );
}
