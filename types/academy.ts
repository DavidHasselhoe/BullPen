import { z } from 'zod';

// ─── Lesson type enum ────────────────────────────────────────────────────────

export const LessonTypeSchema = z.enum(['read', 'quiz', 'match', 'scenario', 'chart-tour', 'demo']);
export type LessonType = z.infer<typeof LessonTypeSchema>;

// ─── Per-lesson content schemas ─────────────────────────────────────────────

export const ReadContentSchema = z.object({
  sections: z.array(
    z.object({
      text: z.string(),
      highlightedTerms: z.array(
        z.object({ term: z.string(), definition: z.string() })
      ),
    })
  ),
  funFact: z.string().optional(),
});
export type ReadContent = z.infer<typeof ReadContentSchema>;

export const QuizContentSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).min(2).max(5),
        correctIndex: z.number().int().min(0),
        explanation: z.string(),
      })
    )
    .min(1),
});
export type QuizContent = z.infer<typeof QuizContentSchema>;

export const MatchContentSchema = z.object({
  pairs: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .min(2)
    .max(8),
});
export type MatchContent = z.infer<typeof MatchContentSchema>;

export const ScenarioContentSchema = z.object({
  setup: z.string(),
  image: z.string().url().optional(),
  choices: z
    .array(
      z.object({
        label: z.string(),
        feedback: z.string(),
        isCorrect: z.boolean(),
      })
    )
    .min(2),
});
export type ScenarioContent = z.infer<typeof ScenarioContentSchema>;

export const ChartTourStepSchema = z.object({
  id: z.string(),
  target: z.enum(['chart-type-toggle', 'range-selector', 'add-indicator-button', 'candle-area', 'none']),
  title: z.string(),
  body: z.string(),
  requiredAction: z.enum(['add-sma-indicator', 'switch-chart-type', 'change-range', 'none']).default('none'),
});
export type ChartTourStep = z.infer<typeof ChartTourStepSchema>;

export const ChartTourContentSchema = z.object({
  ticker: z.string(),
  initialRange: z.enum(['1D', '1W', '1M', '6M', '1Y', 'YTD', '5Y', 'MAX']),
  initialChartType: z.enum(['candles', 'line', 'area']),
  steps: z.array(ChartTourStepSchema).min(1),
});
export type ChartTourContent = z.infer<typeof ChartTourContentSchema>;

// ─── Demo mode ───────────────────────────────────────────────────────────────
// A guided walkthrough that opens a REAL app surface (stock statistics, a demo
// portfolio, the dividend calculator) fullscreen and spotlights each step.
// Unlike chart-tour (whose target/action are a fixed chart-toolbar enum), demo
// steps use free-form string targets so each surface can define its own anchors.

export const DemoTourStepSchema = z.object({
  id: z.string(),
  /** Value of the `data-tour` attribute to spotlight. 'none' centers the tooltip with no cutout. */
  target: z.string(),
  title: z.string(),
  body: z.string(),
  /** Surface-scoped action id the user must perform before Next unlocks. 'none' = no gate. */
  requiredAction: z.string().default('none'),
});
export type DemoTourStep = z.infer<typeof DemoTourStepSchema>;

const DemoDividendHoldingSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  mode: z.enum(['amount', 'shares']),
  value: z.string(),
});

export const DemoContentSchema = z.discriminatedUnion('surface', [
  z.object({
    surface: z.literal('stock-stats'),
    ticker: z.string(),
    steps: z.array(DemoTourStepSchema).min(1),
  }),
  z.object({
    surface: z.literal('demo-portfolio'),
    fixtureId: z.string().default('starter-three-stock'),
    steps: z.array(DemoTourStepSchema).min(1),
  }),
  z.object({
    surface: z.literal('dividend-calculator'),
    holdings: z.array(DemoDividendHoldingSchema).min(1),
    years: z.number().int().min(1).max(40).default(10),
    steps: z.array(DemoTourStepSchema).min(1),
  }),
]);
export type DemoContent = z.infer<typeof DemoContentSchema>;

/**
 * Discriminated union over lesson type + its content payload.
 * Use this at the API boundary to validate before sending to the player.
 */
export const LessonContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('read'), data: ReadContentSchema }),
  z.object({ type: z.literal('quiz'), data: QuizContentSchema }),
  z.object({ type: z.literal('match'), data: MatchContentSchema }),
  z.object({ type: z.literal('scenario'), data: ScenarioContentSchema }),
  z.object({ type: z.literal('chart-tour'), data: ChartTourContentSchema }),
  z.object({ type: z.literal('demo'), data: DemoContentSchema }),
]);
export type LessonContent = z.infer<typeof LessonContentSchema>;

// ─── Domain entities ────────────────────────────────────────────────────────

export type CourseDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  orderIndex: number;
  difficulty: CourseDifficulty | null;
  requiresPro: boolean;
}

export interface Lesson {
  id: string;
  courseId: string;
  slug: string;
  title: string;
  type: LessonType;
  orderIndex: number;
  xpReward: number;
  content: ReadContent | QuizContent | MatchContent | ScenarioContent | ChartTourContent | DemoContent;
}

export interface AcademyStats {
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  level: number;
}

export interface CourseWithProgress extends Course {
  totalLessons: number;
  completedLessons: number;
  percentComplete: number;
  isLocked: boolean;
  /** Why isLocked is true — 'pro' takes priority over 'progression' in messaging. */
  lockedReason: 'progression' | 'pro' | null;
}

export interface UserCourseProgress {
  courseId: string;
  startedAt: string;
  completedAt: string | null;
  lastLessonId: string | null;
  completedLessonIds: string[];
  percentComplete: number;
}

export interface LessonWithCompletion extends Omit<Lesson, 'content'> {
  /** Omitted by the API when the course is Pro-gated and the user isn't Pro. */
  content?: Lesson['content'];
  completed: boolean;
}

// ─── Level helpers ──────────────────────────────────────────────────────────
//
// Tunable XP curve. Level 1 starts at 0 XP; each successive level needs more.
// Formula: xpForLevel(n) = 50 * (n - 1)^2   →   levels at 0, 50, 200, 450, 800, …

export function xpForLevel(level: number): number {
  return 50 * Math.max(0, level - 1) ** 2;
}

export function levelForXp(totalXp: number): number {
  return Math.floor(Math.sqrt(totalXp / 50)) + 1;
}

export function xpToNextLevel(totalXp: number): { current: number; needed: number; level: number } {
  const level = levelForXp(totalXp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return { current: totalXp - floor, needed: ceil - floor, level };
}
