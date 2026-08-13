import type { CourseWithProgress } from '@/types/academy';

export interface PathChapter {
  label: string | null;
  courses: CourseWithProgress[];
}

/**
 * Groups courses (already in order_index order) into chapters by consecutive
 * runs of the same `unitLabel` — purely presentational grouping for the path
 * UI on /academy. Does not affect unlock logic, which stays sequential
 * within a gating track (see app/api/academy/courses/route.ts).
 */
export function groupIntoChapters(courses: CourseWithProgress[]): PathChapter[] {
  const chapters: PathChapter[] = [];
  for (const course of courses) {
    const last = chapters[chapters.length - 1];
    if (last && last.label === course.unitLabel) {
      last.courses.push(course);
    } else {
      chapters.push({ label: course.unitLabel, courses: [course] });
    }
  }
  return chapters;
}

/**
 * The single "next up" course: the first unlocked, incomplete course in
 * sequence. There is at most one at a time under the sequential-unlock
 * model — everything before it is complete, everything after is locked.
 */
export function findCurrentCourse(courses: CourseWithProgress[]): CourseWithProgress | null {
  return courses.find((c) => !c.isLocked && !c.isCompleted) ?? null;
}

/**
 * Deterministic left/right zigzag offset for node index `i`, in px. Strictly
 * alternates side (clean winding rhythm) with a varying magnitude (44–80px)
 * for an organic, non-mechanical feel — no hardcoded per-item table, so it
 * scales to any course count.
 */
export function nodeOffset(index: number): number {
  const sign = index % 2 === 0 ? 1 : -1;
  const magnitude = 44 + Math.round(Math.abs(Math.sin(index * 0.85)) * 36);
  return sign * magnitude;
}
