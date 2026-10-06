/**
 * Whether a course is locked by order (Pro is a separate gate).
 *
 * Courses chain within a chapter (a run of the same unit_label) and a gating
 * track (free vs Pro). One chain across every free course meant a new account
 * could open 1 of 14: "Taxes on Investing" waited behind 9 unrelated courses,
 * and progress made through the lessons embedded in the tools sat in courses
 * nobody could open.
 *   - A chapter's first course opens once the gateway course (the first free
 *     one, "What is a Stock?") is complete. The gateway itself is open.
 *   - Later courses in a chapter open when the previous one in the same
 *     chapter and track is complete.
 *   - Optional courses, and any course with progress, are never locked by order.
 *
 * `courses` must be in path order (order_index).
 */
export interface UnlockCourse {
  id: string;
  requires_pro: boolean;
  is_optional: boolean;
  unit_label: string | null;
}

export function isProgressionLocked(
  courses: UnlockCourse[],
  idx: number,
  completed: Set<string>,
  lessonsDone: number,
): boolean {
  const c = courses[idx];
  if (c.is_optional || lessonsDone > 0) return false;
  for (let j = idx - 1; j >= 0 && courses[j].unit_label === c.unit_label; j--) {
    if (courses[j].requires_pro === c.requires_pro) return !completed.has(courses[j].id);
  }
  const gateway = courses.find((x) => !x.requires_pro);
  return !!gateway && gateway.id !== c.id && !completed.has(gateway.id);
}
