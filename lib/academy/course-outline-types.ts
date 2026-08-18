// lib/academy/course-outline-types.ts
// Shared between scripts/generate-academy-course.ts (manual CLI use) and
// app/api/cron/generate-academy-course/route.ts (automated weekly cron) —
// moved out of the script so both callers use one definition.

import type { LessonType } from '@/types/academy';

// Interactive lesson types (chart-tour, demo) are hand-authored in their own
// migrations, never AI-drafted — see generate-course-content.ts.
export type GeneratableLessonType = Extract<LessonType, 'read' | 'quiz' | 'match' | 'scenario'>;

export interface LessonSpec {
  slug: string;
  title: string;
  type: GeneratableLessonType;
  /** What this lesson should teach — the prompt seed handed to Claude. */
  topic: string;
  xpReward: number;
}

export interface CourseOutline {
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  orderIndex: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Gate behind a Pro subscription. Defaults to false. */
  requiresPro?: boolean;
  /**
   * Chapter grouping label for the /academy path view (academy_courses.unit_label).
   * groupIntoChapters (lib/academy/path-chapters.ts) merges consecutive
   * order_index rows sharing this label into one banner — reusing a label
   * non-adjacently creates a second, duplicate-looking banner instead of
   * extending the first one, so every new unit needs its own label unless
   * it's genuinely adjacent to an existing run of the same label.
   */
  unitLabel: string | null;
  lessons: LessonSpec[];
}
