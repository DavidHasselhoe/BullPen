# Academy Course-Quiz Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "finish every lesson" with "pass the course's final quiz" as what marks a required Academy course complete and unlocks the next one in its track, while adding a "I know this, skip to quiz" escape hatch on locked courses so confident/returning users can test out without doing the lessons.

**Architecture:** A new `academy_course_quizzes` table (one row per gated course, question content in the same shape as the existing lesson-level `QuizContent`) becomes the source of truth for "is this course quiz-gated." A course with no row keeps the old lesson-completion-unlocks-next behavior — this lets quiz content be authored course-by-course without a big-bang rollout. A new `/api/academy/courses/[slug]/quiz/submit` route grades every attempt server-side (never trusts a client-sent score) and is the only thing allowed to set `academy_user_course_progress.completed_at` for a gated course. The existing self-attested `/skip` route for *optional* courses (085_academy_optional_courses.sql) is untouched — this is a separate mechanism for *required* courses. Retries are unlimited and immediate everywhere (no cooldown, no lockout on a failed cold-skip attempt) — this is a checkpoint meant to help the learner notice a gap, not a punitive gate, per the explicit product decision this plan implements.

**Tech Stack:** Next.js App Router API routes, Supabase (Postgres + RLS), Zod, TanStack Query, Framer Motion. No test framework exists in this repo (`CLAUDE.md` — one-off `tsx` scripts only, `npm run lint` is the quality gate) — each task's "test" step is therefore a concrete manual verification (curl / browser check / `npm run lint`), not an automated test suite.

**Spec:** This plan's Design Decisions section below (no separate spec doc — the design was worked out directly in conversation and is captured here).

## Design Decisions (spec)

1. **Every required (`is_optional = false`) course with an authored quiz becomes quiz-gated.** Passing the quiz — not finishing every lesson — sets `academy_user_course_progress.completed_at`, which is what the existing progression-lock logic in `app/api/academy/courses/route.ts` already reads. A required course with no quiz row keeps today's lesson-completion behavior (incremental rollout, no big-bang content requirement).
2. **Optional courses are untouched.** They keep the existing self-attested `/api/academy/courses/[slug]/skip` route and UI. This plan never modifies that route or its callers.
3. **"I know this, skip to quiz"** appears on any *progression-locked* (not Pro-locked) course that has a quiz authored, letting the user attempt that course's quiz cold, without visiting its lessons. The quiz submit route does **not** check progression-lock state — passing it is what *satisfies* progression for whatever comes after it. This means a confident user can chain through several locked courses' quizzes one at a time (exactly the "I already know the first 5, let me get to Macro Basics" scenario that motivated this feature) without needing a multi-unit "jump" mechanic.
4. **Retries are unlimited, immediate, and never punitive** — no cooldown, no attempt cap, no "locked out, go do the lessons" branch on a failed cold attempt. Every attempt (pass or fail) is logged to `academy_user_quiz_attempts` for basic signal, and question + option order is shuffled client-side on every attempt so retrying isn't just "remember which button was right last time."
5. **Pass threshold defaults to 70%**, stored per-course (`academy_course_quizzes.pass_threshold`) so it can be tuned later without a code change.
6. **Grading is server-side, always.** The client fetches the quiz including `correctIndex`/`explanation` per question (same trust model as the existing embedded lesson-type quiz — `QuizLesson.tsx` already reveals the right answer client-side the instant you pick, so this isn't a new exposure), but the server independently re-grades the submitted `answers` array against its own copy of the question data. A client can never forge a passing `completed_at` write. This mirrors the existing "security backstop, independent of the UI" pattern already used for the Pro-gate check in `app/api/academy/lessons/[lessonId]/complete/route.ts` and the `is_optional` check in the `/skip` route.
7. **No bonus XP from quiz completion**, matching the existing optional-course `/skip` route's "skipping earns nothing, XP only comes from actually doing a lesson" precedent. A quiz attempt (pass or fail) still ticks the daily streak via `applyActivityAndXp({ xpToAdd: 0, ... })`, since answering real questions is genuine engagement and shouldn't cost a user their streak.
8. **"Skipped" is a derived UI state**, not a new column: `skipped = course.isCompleted && course.completedLessons < course.totalLessons` (completed via quiz without finishing every lesson). Surfaced as a small badge so the path view never again shows a stale-looking "0/5 lessons" next to a completed course (the exact class of bug that motivated the earlier `PathNode` fix this session).
9. **Existing completions are grandfathered.** This plan never touches existing `academy_user_course_progress` rows — a user who already completed a course under the old lesson-based rule stays completed.

## Global Constraints

- Reuse the existing `QuizContentSchema.shape.questions` shape (`types/academy.ts`) for quiz question content — do not invent a parallel schema.
- Follow the existing "cast at the write site only" pattern (`const db = supabase as any`) for any table not yet in generated Supabase types — see `app/api/academy/lessons/[lessonId]/complete/route.ts` and `app/api/academy/courses/[slug]/skip/route.ts` for the precedent.
- All new RLS policies use `TO authenticated` explicitly and wrap `auth.uid()` as `(select auth.uid())` — the initplan-perf pattern established in `supabase/migrations/096_security_hardening.sql`.
- Per `CLAUDE.md`, apply the new migration immediately via `mcp__claude_ai_Supabase__apply_migration` after creating the file — do not wait for manual application.
- Never trust a client-submitted score/passed value for anything that writes `completed_at`.
- No em dash/en dash in any user-facing copy (toasts, button labels, result screens) — see `CLAUDE.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/109_academy_course_final_quizzes.sql` | New tables + RLS + pilot quiz seed (create) |
| `types/academy.ts` | `CourseFinalQuizSchema`/`CourseFinalQuiz` type; extend `CourseWithProgress` (modify) |
| `app/api/academy/courses/route.ts` | Add `hasFinalQuiz`/`skipped` to the course list response (modify) |
| `app/api/academy/courses/[slug]/route.ts` | Add `hasFinalQuiz` to the single-course response (modify) |
| `app/api/academy/lessons/[lessonId]/complete/route.ts` | Stop auto-completing quiz-gated courses on last lesson; add `allLessonsDone` (modify) |
| `app/api/academy/courses/[slug]/quiz/route.ts` | GET — fetch a course's final quiz (create) |
| `app/api/academy/courses/[slug]/quiz/submit/route.ts` | POST — server-side grading + completion write (create) |
| `hooks/use-user-progress.ts` | Extend `CourseResponse` type (modify) |
| `components/academy/lessons/QuizLesson.tsx` | Report picked answers array alongside score (modify) |
| `components/academy/CourseFinalQuiz.tsx` | Shuffle + retry-in-place + pass/fail result wrapper around `QuizLesson` (create) |
| `app/academy/[courseSlug]/quiz/page.tsx` | New quiz-taking route, both entry points land here (create) |
| `app/academy/[courseSlug]/page.tsx` | "Take the Final Quiz" CTA once lessons are done (modify) |
| `components/academy/path/PathNode.tsx` | "I know this, skip to quiz" link + "Skipped" badge (modify) |

---

### Task 1: Migration — quiz tables, RLS, pilot seed

**Files:**
- Create: `supabase/migrations/109_academy_course_final_quizzes.sql`

**Interfaces:**
- Produces: table `academy_course_quizzes(id, course_id UNIQUE, questions JSONB, pass_threshold NUMERIC, created_at)`; table `academy_user_quiz_attempts(id, user_id, course_id, score NUMERIC, passed BOOLEAN, attempted_at)`.

- [ ] **Step 1: Write the migration**

```sql
-- 109_academy_course_final_quizzes.sql
-- Mandatory final quiz per required (non-optional) course. Passing it — not
-- finishing every lesson — is what marks the course complete and unlocks the
-- next course in its gating track (see app/api/academy/lessons/[lessonId]/complete
-- and the new app/api/academy/courses/[slug]/quiz/submit route). A course
-- with no row here keeps the old lesson-completion-unlocks-next behavior, so
-- content can be authored course-by-course without breaking the ones that
-- don't have a quiz yet. Optional courses (is_optional = true) are untouched
-- — they keep the existing self-attested /skip route (085_academy_optional_courses.sql).
--
-- Unlimited retries by design (no cooldown, no attempt cap): the goal is a
-- checkpoint that helps a learner notice a gap, not a punitive gate. Every
-- attempt is still recorded in academy_user_quiz_attempts for basic signal
-- (how many tries a course typically takes), graded server-side so a client
-- can never forge a "passed" course completion.

CREATE TABLE IF NOT EXISTS academy_course_quizzes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID        NOT NULL UNIQUE REFERENCES academy_courses(id) ON DELETE CASCADE,
  questions      JSONB       NOT NULL,
  pass_threshold NUMERIC     NOT NULL DEFAULT 0.7 CHECK (pass_threshold > 0 AND pass_threshold <= 1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academy_user_quiz_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id    UUID        NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  score        NUMERIC     NOT NULL CHECK (score >= 0 AND score <= 1),
  passed       BOOLEAN     NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_quiz_attempts_user_course
  ON academy_user_quiz_attempts(user_id, course_id);

ALTER TABLE academy_course_quizzes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_user_quiz_attempts  ENABLE ROW LEVEL SECURITY;

-- Quiz content: readable by any authenticated user for a published course.
-- Exposes correctIndex/explanation on read — same trust model already used
-- for academy_lessons quiz-type content (QuizLesson.tsx reveals the correct
-- answer client-side the instant you pick). The server never trusts a
-- client-submitted score/passed value back — the submit route re-grades
-- from this same table.
DROP POLICY IF EXISTS "Authenticated users can read course quizzes" ON academy_course_quizzes;
CREATE POLICY "Authenticated users can read course quizzes"
  ON academy_course_quizzes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM academy_courses c
      WHERE c.id = academy_course_quizzes.course_id AND c.is_published = TRUE
    )
  );

-- Attempts: users can read + insert their own; no update/delete (immutable history).
DROP POLICY IF EXISTS "Users can read own quiz attempts" ON academy_user_quiz_attempts;
CREATE POLICY "Users can read own quiz attempts"
  ON academy_user_quiz_attempts FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own quiz attempts" ON academy_user_quiz_attempts;
CREATE POLICY "Users can insert own quiz attempts"
  ON academy_user_quiz_attempts FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- Seed a pilot quiz on the first required (non-optional) course, so the
-- feature is end-to-end testable immediately. Picked programmatically
-- (lowest order_index among non-optional courses) rather than a hardcoded
-- slug, since slugs aren't guaranteed stable across environments.
INSERT INTO academy_course_quizzes (course_id, questions, pass_threshold)
SELECT
  id,
  '[
    {"question": "If you own one share of a company, what do you actually own?", "options": ["A loan you made to the company", "A tiny ownership stake in the company", "A guaranteed dividend payment", "A seat on the board of directors"], "correctIndex": 1, "explanation": "A share is a unit of ownership. Owning one gives you a proportional claim on the company assets and profits, not a loan or a guaranteed payout."},
    {"question": "What mainly determines whether a stock price goes up or down day to day?", "options": ["The company logo and brand recognition", "Supply and demand from buyers and sellers", "The stock exchange sets a fixed daily price", "The company founding date"], "correctIndex": 1, "explanation": "Prices move based on what buyers and sellers are willing to trade at right now. More buyers than sellers pushes the price up, and vice versa."},
    {"question": "What does it mean if a company goes public?", "options": ["It stops filing any financial reports", "It starts selling shares on a public stock exchange", "It becomes owned entirely by the government", "It merges with a competitor"], "correctIndex": 1, "explanation": "Going public (an IPO) means the company lists shares on an exchange so the general public can buy and sell ownership stakes."}
  ]'::jsonb,
  0.7
FROM academy_courses
WHERE is_optional = FALSE AND is_published = TRUE
ORDER BY order_index
LIMIT 1
ON CONFLICT (course_id) DO NOTHING;
```

- [ ] **Step 2: Apply the migration**

Per `CLAUDE.md`, apply immediately via `mcp__claude_ai_Supabase__apply_migration` (project ID `kgqpzuvhslqazurfrqya`) rather than waiting for manual application.

- [ ] **Step 3: Verify**

Run: `mcp__claude_ai_Supabase__execute_sql` with:
```sql
select c.slug, c.order_index, q.pass_threshold, jsonb_array_length(q.questions) as n_questions
from academy_course_quizzes q join academy_courses c on c.id = q.course_id;
```
Expected: exactly one row, for the lowest-`order_index` non-optional course, `n_questions = 3`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/109_academy_course_final_quizzes.sql
git commit -m "feat: add academy_course_quizzes and academy_user_quiz_attempts tables"
```

---

### Task 2: Types — `CourseFinalQuiz` schema + extend `CourseWithProgress`

**Files:**
- Modify: `types/academy.ts`

**Interfaces:**
- Consumes: `QuizContentSchema` (already defined, line ~23 of this file).
- Produces: `CourseFinalQuizSchema`, `type CourseFinalQuiz = { questions: {question, options, correctIndex, explanation}[]; passThreshold: number }`; `CourseWithProgress.hasFinalQuiz: boolean`, `CourseWithProgress.skipped: boolean`.

- [ ] **Step 1: Add `CourseFinalQuizSchema` right after `QuizContentSchema`**

In `types/academy.ts`, immediately after the existing `QuizContentSchema`/`QuizContent` export (around line 35):

```ts
// ─── Course-level final quiz (gates course completion, distinct from any
// in-course quiz-type lesson) ────────────────────────────────────────────────

export const CourseFinalQuizSchema = z.object({
  questions: QuizContentSchema.shape.questions,
  passThreshold: z.number().min(0).max(1),
});
export type CourseFinalQuiz = z.infer<typeof CourseFinalQuizSchema>;
```

- [ ] **Step 2: Extend `CourseWithProgress`**

Modify the existing interface (around line 197):

```ts
export interface CourseWithProgress extends Course {
  totalLessons: number;
  completedLessons: number;
  percentComplete: number;
  isLocked: boolean;
  /** Why isLocked is true — 'pro' takes priority over 'progression' in messaging. */
  lockedReason: 'progression' | 'pro' | null;
  /** This course's own completed_at is set — via lessons, a final-quiz pass, or an optional-course skip. */
  isCompleted: boolean;
  /** True if academy_course_quizzes has a row for this course — gates completion via quiz instead of lesson count. */
  hasFinalQuiz: boolean;
  /** isCompleted is true but completedLessons < totalLessons — completed by passing the quiz cold, without doing every lesson. */
  skipped: boolean;
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json` (or just proceed — Task 3 will exercise these types immediately; TS build errors are otherwise suppressed per `next.config.ts`, but a plain `tsc --noEmit` still catches type errors surfaced by this file's own consumers when they're modified in later tasks).

- [ ] **Step 4: Commit**

```bash
git add types/academy.ts
git commit -m "feat: add CourseFinalQuiz type and extend CourseWithProgress"
```

---

### Task 3: `academy/courses` list route — `hasFinalQuiz` + `skipped`

**Files:**
- Modify: `app/api/academy/courses/route.ts`

**Interfaces:**
- Consumes: `CourseWithProgress` (Task 2).
- Produces: `courses[].hasFinalQuiz`, `courses[].skipped` in the `GET /api/academy/courses` response — consumed by `PathNode.tsx` (Task 12).

- [ ] **Step 1: Add a query for quiz-gated course ids, in parallel with the existing reads**

In the `Promise.all` at the top of the handler (around line 36), add a sixth query:

```ts
const [coursesRes, lessonsRes, lessonProgressRes, courseProgressRes, tier, quizzesRes] = await Promise.all([
  supabase
    .from('academy_courses')
    .select('id, slug, title, description, icon, color, order_index, difficulty, requires_pro, is_optional, unit_label')
    .eq('is_published', true)
    .order('order_index'),
  supabase
    .from('academy_lessons')
    .select('id, course_id'),
  supabase
    .from('academy_user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', session.userId),
  supabase
    .from('academy_user_course_progress')
    .select('course_id, completed_at')
    .eq('user_id', session.userId),
  getTier(session.userId),
  supabase
    .from('academy_course_quizzes')
    .select('course_id'),
]);
```

- [ ] **Step 2: Build a `Set` of quiz-gated course ids after the existing tallies**

Immediately after the existing `lessonsByCourse` tally loop (around line 75):

```ts
const quizGatedCourseIds = new Set(
  (quizzesRes.data ?? []).map((r: { course_id: string }) => r.course_id)
);
```

- [ ] **Step 3: Populate `hasFinalQuiz`/`skipped` on each returned course**

In the `courses.map((c, idx) => { ... })` block, extend the returned object (around line 102-120):

```ts
    const hasFinalQuiz = quizGatedCourseIds.has(c.id);
    const isCompleted = completedCourseIds.has(c.id);

    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description ?? '',
      icon: c.icon ?? 'BookOpen',
      color: c.color ?? 'emerald',
      orderIndex: c.order_index,
      difficulty: c.difficulty,
      requiresPro: c.requires_pro,
      isOptional: c.is_optional,
      unitLabel: c.unit_label,
      totalLessons: total,
      completedLessons: done,
      percentComplete,
      isLocked: lockedReason !== null,
      lockedReason,
      isCompleted,
      hasFinalQuiz,
      skipped: isCompleted && done < total,
    };
```

- [ ] **Step 4: Verify**

Run the dev server (`npm run dev`) and, while authenticated, `curl` (or browser) `GET /api/academy/courses`. Expected: exactly one course in the response has `"hasFinalQuiz": true` (the pilot-seeded one from Task 1), and it matches `skipped` correctly for any test account that has already completed it via the old lesson-based path (`skipped: false` in that case, since `completedLessons === totalLessons`).

- [ ] **Step 5: Commit**

```bash
git add app/api/academy/courses/route.ts
git commit -m "feat: surface hasFinalQuiz and skipped on the academy courses list"
```

---

### Task 4: `academy/courses/[slug]` route — `hasFinalQuiz`

**Files:**
- Modify: `app/api/academy/courses/[slug]/route.ts`
- Modify: `hooks/use-user-progress.ts`

**Interfaces:**
- Produces: `GET /api/academy/courses/[slug]` response gains `hasFinalQuiz: boolean`, consumed by `app/academy/[courseSlug]/page.tsx` (Task 11) to decide whether to show the "Take the Final Quiz" CTA.

- [ ] **Step 1: Query the quiz row alongside the existing parallel reads**

In `app/api/academy/courses/[slug]/route.ts`, extend the `Promise.all` (around line 61):

```ts
  const [lessonsRes, lessonProgressRes, courseProgressRes, quizRes] = await Promise.all([
    supabase
      .from('academy_lessons')
      .select('id, course_id, slug, title, type, order_index, xp_reward, content')
      .eq('course_id', course.id)
      .order('order_index'),
    supabase
      .from('academy_user_lesson_progress')
      .select('lesson_id')
      .eq('user_id', session.userId),
    supabase
      .from('academy_user_course_progress')
      .select('last_lesson_id, completed_at, started_at')
      .eq('user_id', session.userId)
      .eq('course_id', course.id)
      .maybeSingle<{ last_lesson_id: string | null; completed_at: string | null; started_at: string }>(),
    supabase
      .from('academy_course_quizzes')
      .select('id')
      .eq('course_id', course.id)
      .maybeSingle<{ id: string }>(),
  ]);
```

- [ ] **Step 2: Include `hasFinalQuiz` in the JSON response**

At the bottom of the handler (around line 112):

```ts
  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      course: courseDto,
      lessons,
      locked,
      progress: courseProgressRes.data ?? null,
      hasFinalQuiz: quizRes.data !== null,
    })
  );
```

- [ ] **Step 3: Extend the client-side response type**

In `hooks/use-user-progress.ts`, extend `CourseResponse`:

```ts
interface CourseResponse {
  success: boolean;
  course: Course;
  lessons: LessonWithCompletion[];
  locked: boolean;
  progress: {
    last_lesson_id: string | null;
    completed_at: string | null;
    started_at: string;
  } | null;
  hasFinalQuiz: boolean;
}
```

- [ ] **Step 4: Verify**

`curl`/browser `GET /api/academy/courses/<pilot-course-slug>` while authenticated. Expected: `"hasFinalQuiz": true` for the pilot course, `false` for any other.

- [ ] **Step 5: Commit**

```bash
git add "app/api/academy/courses/[slug]/route.ts" hooks/use-user-progress.ts
git commit -m "feat: surface hasFinalQuiz on the single-course academy response"
```

---

### Task 5: Lesson-complete route — stop auto-completing quiz-gated courses

**Files:**
- Modify: `app/api/academy/lessons/[lessonId]/complete/route.ts`

**Interfaces:**
- Consumes: `academy_course_quizzes` (Task 1).
- Produces: response gains `allLessonsDone: boolean` (all lessons finished, independent of whether `completed_at` got set); `courseCompleted` now strictly means "`completed_at` is set as of this call." Consumed by `LessonPlayer.tsx`/the complete-celebration flow is unaffected in this task — routing changes happen in Task 11.

- [ ] **Step 1: Look up whether the lesson's course is quiz-gated, alongside the other independent reads**

In the first `Promise.all` (around line 50), add a query. Because it depends on nothing computed earlier and only needs the `lessonId`'s course, join it via the lesson's `course_id` is not known yet at that point — instead run it in the *second* `Promise.all` (around line 100), which already knows `lesson.course_id`:

```ts
  const [, { data: allLessonIds }, quizGateRes] = await Promise.all([
    isFirstCompletion
      ? db.from('academy_user_lesson_progress').insert({
          user_id: session.userId,
          lesson_id: lessonId,
          score: body.score ?? null,
          xp_earned: lesson.xp_reward,
        })
      : Promise.resolve(),
    supabase.from('academy_lessons').select('id').eq('course_id', lesson.course_id),
    supabase.from('academy_course_quizzes').select('id').eq('course_id', lesson.course_id).maybeSingle<{ id: string }>(),
  ]);

  const courseIsQuizGated = quizGateRes.data !== null;
```

- [ ] **Step 2: Only write `completed_at` when the course isn't quiz-gated**

Replace the course-progress section (around line 112-135):

```ts
  // ── Course progress: all-lessons-done is tracked regardless of gating, but
  // completed_at (the field progression-lock actually reads) is only set here
  // for courses with no final quiz. A quiz-gated course's completed_at is set
  // exclusively by /api/academy/courses/[slug]/quiz/submit, never here. ───────
  const { data: completedRows } = await supabase
    .from('academy_user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', session.userId)
    .in('lesson_id', (allLessonIds ?? []).map((l: { id: string }) => l.id));

  const completedCount = completedRows?.length ?? 0;
  const totalCount = allLessonIds?.length ?? 0;
  const allLessonsDone = totalCount > 0 && completedCount >= totalCount;
  const courseNowComplete = allLessonsDone && !courseIsQuizGated;

  // ── Course progress upsert + stats upsert are independent writes ─────────
  const [, stats] = await Promise.all([
    db.from('academy_user_course_progress').upsert(
      {
        user_id: session.userId,
        course_id: lesson.course_id,
        last_lesson_id: lessonId,
        ...(courseNowComplete ? { completed_at: new Date().toISOString() } : {}),
      },
      { onConflict: 'user_id,course_id' }
    ),
    applyActivityAndXp({ supabase: db, userId: session.userId, xpToAdd: xpAwarded, statsRow }),
  ]);

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      xpAwarded,
      isFirstCompletion,
      courseCompleted: courseNowComplete,
      allLessonsDone,
      stats,
    })
  );
```

- [ ] **Step 3: Verify**

Manually complete every lesson in the pilot (quiz-gated) course via the browser. Expected: after the last lesson, `POST .../complete` response has `"allLessonsDone": true, "courseCompleted": false`. Then complete every lesson in a *non*-gated course (any other required course, or an optional one). Expected: `"allLessonsDone": true, "courseCompleted": true` (unchanged old behavior), and `GET /api/academy/courses` shows that course's `completed_at` set.

- [ ] **Step 4: Commit**

```bash
git add "app/api/academy/lessons/[lessonId]/complete/route.ts"
git commit -m "feat: stop auto-completing quiz-gated courses on last lesson"
```

---

### Task 6: `QuizLesson.tsx` — report picked answers alongside score

**Files:**
- Modify: `components/academy/lessons/QuizLesson.tsx`

**Interfaces:**
- Produces: `onComplete` prop widens to `(score: number, answers: number[]) => void`. `answers[i]` is the option index picked for `content.questions[i]`.
- Existing caller `components/academy/LessonPlayer.tsx:157-162` passes `(score) => handleLessonComplete(score)` — a function with fewer declared parameters is structurally assignable to the widened type, so **no change needed there**; do not touch `LessonPlayer.tsx` in this task.

- [ ] **Step 1: Track an answers array alongside the existing `correctCount` state**

In `components/academy/lessons/QuizLesson.tsx`, change the props type and add state (around lines 10-18):

```ts
interface Props {
  content: QuizContent;
  onComplete: (score: number, answers: number[]) => void;
}

export function QuizLesson({ content, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
```

- [ ] **Step 2: Push each pick into `answers`, and pass the array through on finish**

Update `handlePick` and `handleNext` (around lines 26-41):

```ts
  function handlePick(i: number) {
    if (answered) return;
    setPicked(i);
    setAnswers((a) => [...a, i]);
    if (i === question.correctIndex) {
      setCorrectCount((c) => c + 1);
    }
  }

  function handleNext() {
    if (isLast) {
      onComplete(correctCount / total, answers);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }
```

- [ ] **Step 3: Verify**

`npx eslint components/academy/lessons/QuizLesson.tsx` and `npx eslint components/academy/LessonPlayer.tsx` — both should pass with no new errors (confirms `LessonPlayer`'s narrower callback is still a valid match for the widened prop type). Manually play an existing in-course quiz-type lesson end to end in the browser to confirm no regression (score still records, XP still awards).

- [ ] **Step 4: Commit**

```bash
git add components/academy/lessons/QuizLesson.tsx
git commit -m "feat: report picked answers array from QuizLesson"
```

---

### Task 7: Quiz GET route

**Files:**
- Create: `app/api/academy/courses/[slug]/quiz/route.ts`

**Interfaces:**
- Consumes: `CourseFinalQuizSchema` (Task 2).
- Produces: `GET /api/academy/courses/[slug]/quiz` → `{ success: true, quiz: CourseFinalQuiz, locked: boolean } | { success: false, error: string }`. Consumed by `app/academy/[courseSlug]/quiz/page.tsx` (Task 9).

- [ ] **Step 1: Write the route**

```ts
/**
 * GET /api/academy/courses/[slug]/quiz
 * Returns the course's final quiz (questions include correctIndex/explanation —
 * same trust model as an in-course quiz-type lesson; the submit route re-grades
 * server-side and never trusts a client-reported result).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import type { CourseFinalQuiz } from '@/types/academy';

async function handler(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;
  const supabase = createServerClient();

  const { data: course } = await supabase
    .from('academy_courses')
    .select('id, requires_pro')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<{ id: string; requires_pro: boolean }>();

  if (!course) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 })
    );
  }

  const { data: quizRow } = await supabase
    .from('academy_course_quizzes')
    .select('questions, pass_threshold')
    .eq('course_id', course.id)
    .maybeSingle<{ questions: CourseFinalQuiz['questions']; pass_threshold: number }>();

  if (!quizRow) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'No final quiz for this course' }, { status: 404 })
    );
  }

  const tier = await getTier(session.userId);
  const locked = course.requires_pro && !isPro(tier);

  const quiz: CourseFinalQuiz = {
    questions: quizRow.questions,
    passThreshold: quizRow.pass_threshold,
  };

  return addSecurityHeaders(
    NextResponse.json({ success: true, quiz, locked })
  );
}

export const GET = withAuth(handler);
```

- [ ] **Step 2: Verify**

`curl`/browser `GET /api/academy/courses/<pilot-course-slug>/quiz` while authenticated. Expected: `{"success":true,"quiz":{"questions":[...3 items...],"passThreshold":0.7},"locked":false}`. Then hit a course slug with no quiz row (e.g. any second course). Expected: 404 with `{"success":false,"error":"No final quiz for this course"}`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/academy/courses/[slug]/quiz/route.ts"
git commit -m "feat: add GET route for a course's final quiz"
```

---

### Task 8: Quiz submit route

**Files:**
- Create: `app/api/academy/courses/[slug]/quiz/submit/route.ts`

**Interfaces:**
- Consumes: `applyActivityAndXp`, `fetchStatsRow` (`lib/academy/streak.ts`); `AcademyStats` type.
- Produces: `POST /api/academy/courses/[slug]/quiz/submit` body `{ answers: number[] }` → `{ success: true, passed: boolean, score: number, nextCourseSlug: string | null, stats: AcademyStats } | { success: false, error: string }`. Consumed by `CourseFinalQuiz.tsx` (Task 9).

- [ ] **Step 1: Write the route**

```ts
/**
 * POST /api/academy/courses/[slug]/quiz/submit
 *
 * Grades a final-quiz attempt server-side (never trusts a client-reported
 * score) and, on a pass, marks the course complete — the only write path for
 * completed_at on a quiz-gated course. No progression-lock check here on
 * purpose: this route is exactly how a progression-locked course gets
 * unlocked via "I know this, skip to quiz" (see PathNode.tsx). No bonus XP
 * is awarded on pass, matching the existing optional-course /skip route's
 * "skipping earns nothing" precedent — but every attempt still ticks the
 * daily streak, since answering real questions is genuine engagement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { applyActivityAndXp, fetchStatsRow } from '@/lib/academy/streak';
import type { CourseFinalQuiz } from '@/types/academy';

const BodySchema = z.object({
  answers: z.array(z.number().int().min(0)),
});

async function handler(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  // academy_course_quizzes / academy_user_quiz_attempts aren't in generated
  // Supabase types yet — cast at the write site only, same pattern as the
  // lesson-complete and skip routes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: course } = await supabase
    .from('academy_courses')
    .select('id, order_index, requires_pro')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<{ id: string; order_index: number; requires_pro: boolean }>();

  if (!course) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 })
    );
  }

  // Security backstop, independent of the UI: a Pro-gated course's quiz must
  // never be passable by a free user calling this route directly.
  if (course.requires_pro) {
    const tier = await getTier(session.userId);
    if (!isPro(tier)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Pro subscription required' }, { status: 403 })
      );
    }
  }

  const { data: quizRow } = await supabase
    .from('academy_course_quizzes')
    .select('questions, pass_threshold')
    .eq('course_id', course.id)
    .maybeSingle<{ questions: CourseFinalQuiz['questions']; pass_threshold: number }>();

  if (!quizRow) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'No final quiz for this course' }, { status: 404 })
    );
  }

  const { questions, pass_threshold: passThreshold } = quizRow;

  if (body.answers.length !== questions.length) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Answer count does not match question count' }, { status: 400 })
    );
  }

  // ── Grade server-side, from the same question data just loaded — never
  // from anything the client asserts. ────────────────────────────────────
  const correctCount = questions.reduce(
    (n, q, i) => (body.answers[i] === q.correctIndex ? n + 1 : n),
    0
  );
  const score = correctCount / questions.length;
  const passed = score >= passThreshold;

  const statsRow = await fetchStatsRow({ supabase: db, userId: session.userId });

  const [, , stats] = await Promise.all([
    db.from('academy_user_quiz_attempts').insert({
      user_id: session.userId,
      course_id: course.id,
      score,
      passed,
    }),
    passed
      ? db.from('academy_user_course_progress').upsert(
          {
            user_id: session.userId,
            course_id: course.id,
            completed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,course_id' }
        )
      : Promise.resolve(),
    // Every attempt (pass or fail) is genuine engagement — ticks the streak,
    // no bonus XP.
    applyActivityAndXp({ supabase: db, userId: session.userId, xpToAdd: 0, statsRow }),
  ]);

  let nextCourseSlug: string | null = null;
  if (passed) {
    const { data: nextCourse } = await supabase
      .from('academy_courses')
      .select('slug')
      .eq('is_published', true)
      .gt('order_index', course.order_index)
      .order('order_index')
      .limit(1)
      .maybeSingle<{ slug: string }>();
    nextCourseSlug = nextCourse?.slug ?? null;
  }

  return addSecurityHeaders(
    NextResponse.json({ success: true, passed, score, nextCourseSlug, stats })
  );
}

export const POST = withAuth(handler);
```

- [ ] **Step 2: Verify**

`curl`/browser `POST /api/academy/courses/<pilot-course-slug>/quiz/submit` with `{"answers":[1,1,1]}` (all correct, per the seeded questions). Expected: `{"success":true,"passed":true,"score":1,"nextCourseSlug":"<next-slug>","stats":{...}}`, and a follow-up `GET /api/academy/courses` shows that course's `isCompleted: true`. Then submit `{"answers":[0,0,0]}` (all wrong). Expected: `passed: false`, and the course's `isCompleted` is unaffected (stays whatever it was — a later pass isn't blocked by an earlier fail).

- [ ] **Step 3: Commit**

```bash
git add "app/api/academy/courses/[slug]/quiz/submit/route.ts"
git commit -m "feat: add course final-quiz submit route with server-side grading"
```

---

### Task 9: `CourseFinalQuiz` component + quiz page

**Files:**
- Create: `components/academy/CourseFinalQuiz.tsx`
- Create: `app/academy/[courseSlug]/quiz/page.tsx`

**Interfaces:**
- Consumes: `QuizLesson` (Task 6, widened `onComplete`), `CourseFinalQuiz` type (Task 2), `ProGate` (`components/billing/ProGate.tsx`), `ACADEMY_STATS_QUERY_KEY` (`hooks/use-academy-stats.ts`).
- Produces: `CourseFinalQuiz` props `{ quiz: CourseFinalQuizType; courseSlug: string; courseTitle: string }`, self-contained (owns its own submit mutation + retry state).

- [ ] **Step 1: Write a small Fisher-Yates shuffle helper inline (no new file — used only here)**

At the top of `components/academy/CourseFinalQuiz.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
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

/** Reshuffles question order AND each question's option order (remapping correctIndex), so retrying isn't just "remember which button was right last time." */
function shuffleQuiz(quiz: CourseFinalQuizType): QuizContent {
  const questions = shuffle(quiz.questions).map((q) => {
    const optionOrder = shuffle(q.options.map((_, i) => i));
    return {
      question: q.question,
      options: optionOrder.map((i) => q.options[i]),
      correctIndex: optionOrder.indexOf(q.correctIndex),
      explanation: q.explanation,
    };
  });
  return { questions };
}
```

- [ ] **Step 2: Write the component — quiz-in-progress, pass, and fail states**

```tsx
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SubmitResponse | null>(null);
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

  // shuffleQuiz's remapped questions carry correctIndex remapped to the
  // shuffled option order, but the *original*-order correctIndex is what the
  // server grades against — map picked indices back before submitting.
  function handleComplete(_score: number, pickedInShuffledOrder: number[]) {
    const answersInOriginalOrder = shuffled.questions.map((q, i) => {
      const pickedOptionText = q.options[pickedInShuffledOrder[i]];
      return quiz.questions[i].options.indexOf(pickedOptionText);
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
            {result.passed ? 'Nice work' : 'Not quite there yet'}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.passed
              ? `You got ${Math.round(result.score * 100)}% and unlocked the next course.`
              : `You got ${Math.round(result.score * 100)}%. Take another look and try again, no rush.`}
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
                Continue
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
                  Try again
                </Button>
                <Link href={`/academy/${courseSlug}`}>
                  <Button size="lg" variant="ghost" className="w-full gap-1.5 text-muted-foreground">
                    <BookOpen className="h-4 w-4" />
                    Review the lessons instead
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
          Final quiz
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{courseTitle}</h1>
        <p className="text-sm text-muted-foreground/85 mt-2 leading-relaxed">
          Answer at your own pace. You can retry as many times as you want.
        </p>
      </div>
      <QuizLesson key={attempt} content={shuffled} onComplete={handleComplete} />
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// app/academy/[courseSlug]/quiz/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
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
  const params = useParams<{ courseSlug: string }>();
  const router = useRouter();
  const courseSlug = params?.courseSlug ?? '';

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
        Back
      </Button>

      {isLoading || !data ? (
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : !data.success ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5">
          <p className="text-sm text-red-400">{data.error ?? 'This quiz is not available.'}</p>
        </div>
      ) : data.locked ? (
        <ProGate
          feature="academy_pro"
          title="Unlock this course with Pro"
          description="Intermediate and advanced Academy courses are a Pro benefit. Upgrade to take this quiz."
        />
      ) : (
        <CourseFinalQuiz quiz={data.quiz} courseSlug={courseSlug} courseTitle={courseSlug} />
      )}
    </div>
  );
}
```

Note: `courseTitle={courseSlug}` is a placeholder — Task 11 wires the real title through when linking here from the course overview page. When linked directly from `PathNode.tsx`'s "skip to quiz" affordance (Task 12), the course title isn't otherwise available on this page without an extra fetch; leave `courseSlug` as the fallback display value here since it's still legible (e.g. "reading-charts"), and do not add a redundant course-detail fetch just to prettify a title on a route users reach as a deliberate skip.

- [ ] **Step 4: Verify**

Browser: navigate to `/academy/<pilot-course-slug>/quiz`. Expected: quiz renders via `QuizLesson`'s existing UI, answering all 3 correctly shows the pass panel with a working "Continue" button, answering incorrectly shows the fail panel with working "Try again" (reshuffles and resets) and "Review the lessons instead" (navigates to `/academy/<slug>`).

- [ ] **Step 5: Commit**

```bash
git add components/academy/CourseFinalQuiz.tsx "app/academy/[courseSlug]/quiz/page.tsx"
git commit -m "feat: add course final-quiz page with shuffle and unlimited retry"
```

---

### Task 10: `ProGate` import check

**Files:**
- None to modify — verification-only task confirming Task 9's `ProGate` usage matches the existing component's actual prop contract.

**Interfaces:**
- Consumes: `components/billing/ProGate.tsx` (already used identically in `app/academy/[courseSlug]/page.tsx:154-158`).

- [ ] **Step 1: Confirm prop shape**

Read `components/billing/ProGate.tsx` and diff its exported props against the usage in Task 9 Step 3 (`feature`, `title`, `description`). If they match exactly (they should — Task 9's usage was copied verbatim from the existing course-overview page's usage), no action needed.

- [ ] **Step 2: Run lint across the new files**

Run: `npx eslint components/academy/CourseFinalQuiz.tsx "app/academy/[courseSlug]/quiz/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Commit**

Nothing to commit if Step 1 found no mismatch — skip. If a mismatch was found, fix `CourseFinalQuiz.tsx`/the quiz page's `ProGate` usage and commit:

```bash
git add "app/academy/[courseSlug]/quiz/page.tsx"
git commit -m "fix: correct ProGate prop usage on the course quiz page"
```

---

### Task 11: Course overview page — "Take the Final Quiz" CTA + real quiz-page title

**Files:**
- Modify: `app/academy/[courseSlug]/page.tsx`
- Modify: `app/academy/[courseSlug]/quiz/page.tsx`

**Interfaces:**
- Consumes: `hasFinalQuiz` (Task 4), `allLessonsDone` is derivable client-side the same way it always was (`completedCount === lessons.length`).

- [ ] **Step 1: Add the CTA branch**

In `app/academy/[courseSlug]/page.tsx`, the current "Course complete" banner (around line 185) only fires on `completedCount === lessons.length`, which for a quiz-gated course is no longer the same as "actually complete" (`progress?.completed_at`). Replace that block:

```tsx
      {hasFinalQuiz && completedCount === lessons.length && !progress?.completed_at && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-center space-y-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-500 mb-1">
              Lessons done
            </div>
            <p className="text-sm text-muted-foreground">
              Take the final quiz to unlock the next course. Retry as many times as you want.
            </p>
          </div>
          <Link href={`/academy/${course.slug}/quiz`}>
            <Button size="lg" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold">
              Take the final quiz
            </Button>
          </Link>
        </div>
      )}

      {(!hasFinalQuiz || progress?.completed_at) && completedCount === lessons.length && lessons.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-500 mb-1">
            Course complete
          </div>
          <p className="text-sm text-muted-foreground">
            {hasFinalQuiz
              ? 'You passed the final quiz. Keep going with the next course on the home page.'
              : 'You finished every lesson. Keep going with the next course on the home page.'}
          </p>
        </div>
      )}
```

- [ ] **Step 2: Destructure `hasFinalQuiz` from the hook data**

Near the top of the component (around line 46):

```tsx
  const { course, lessons, progress, locked, hasFinalQuiz } = data;
```

- [ ] **Step 3: Pass the real course title to the quiz page via a query param, and read it there**

In `app/academy/[courseSlug]/page.tsx`, update the `Link` from Step 1 to carry the title:

```tsx
          <Link href={`/academy/${course.slug}/quiz?title=${encodeURIComponent(course.title)}`}>
```

In `app/academy/[courseSlug]/quiz/page.tsx` (Task 9), read it via `useSearchParams` and fall back to the slug when absent (e.g. reached directly from `PathNode.tsx`'s skip link, which doesn't have the title loaded):

```tsx
import { useParams, useRouter, useSearchParams } from 'next/navigation';
// ...
  const searchParams = useSearchParams();
  const courseTitle = searchParams.get('title') ?? courseSlug;
// ...
        <CourseFinalQuiz quiz={data.quiz} courseSlug={courseSlug} courseTitle={courseTitle} />
```

- [ ] **Step 4: Verify**

Browser: finish every lesson in the pilot course without yet passing its quiz. Expected: the course overview page shows "Lessons done / Take the final quiz" instead of "Course complete", and the button's href includes the real course title. After passing the quiz, revisit the overview page. Expected: it now shows "Course complete" with the quiz-specific copy ("You passed the final quiz...").

- [ ] **Step 5: Commit**

```bash
git add "app/academy/[courseSlug]/page.tsx" "app/academy/[courseSlug]/quiz/page.tsx"
git commit -m "feat: show Take the Final Quiz CTA once lessons are done on a gated course"
```

---

### Task 12: `PathNode.tsx` — "I know this, skip to quiz" link + "Skipped" badge

**Files:**
- Modify: `components/academy/path/PathNode.tsx`

**Interfaces:**
- Consumes: `course.hasFinalQuiz`, `course.skipped` (Task 3).

- [ ] **Step 1: Add the skip-to-quiz link for progression-locked, quiz-gated courses**

In `components/academy/path/PathNode.tsx`, the non-interactive branch currently returns a plain `<div>` with no link at all (the `if (!isInteractive) { ... }` block, around line 113-119 after this session's earlier fix). Replace it:

```tsx
  const showSkipToQuiz = isProgressionLocked && course.hasFinalQuiz;

  if (!isInteractive) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-2.5" aria-disabled="true">
        {content}
        {showSkipToQuiz && (
          <Link
            href={`/academy/${course.slug}/quiz`}
            className="text-[11px] font-mono text-muted-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors"
          >
            I know this, skip to quiz
          </Link>
        )}
      </div>
    );
  }
```

- [ ] **Step 2: Add a "Skipped" badge next to the existing Optional/PRO chips**

In the `label` JSX (around line 65-79), add a new chip alongside the existing `isOptional` one:

```tsx
        {course.isOptional && (
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            Optional
          </span>
        )}
        {course.skipped && (
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            Skipped
          </span>
        )}
        <span className="text-[11px] font-mono text-muted-foreground/70 tabular-nums">
          {course.completedLessons}/{course.totalLessons} lessons
        </span>
```

- [ ] **Step 3: Verify**

Browser: on `/academy`, the pilot course's locked *successor* (the next course in its track) should now show a small "I know this, skip to quiz" link beneath its lock icon, since the pilot course itself has no quiz yet unless it's also gated — confirm against whichever course is actually progression-locked with `hasFinalQuiz: true` in the `GET /api/academy/courses` payload from Task 3's verification. Click it, pass the quiz, and confirm the path view updates: that course now shows completed (emerald check), and the *next* course past it is what's newly unlocked. Separately, use the pilot course itself (cold-skip it before doing any lessons, from whatever locked state it starts in) and confirm it shows a "Skipped" badge afterward instead of a stale lesson count.

- [ ] **Step 4: Commit**

```bash
git add components/academy/path/PathNode.tsx
git commit -m "feat: add skip-to-quiz link and tested-out badge to the academy path"
```

---

## Self-Review

**Spec coverage:**
1. Every required course w/ authored quiz gates on quiz pass — Tasks 1, 5, 8. ✓
2. Optional courses untouched — no task modifies `/skip` route or its callers. ✓
3. Skip-to-quiz on any progression-locked, quiz-gated course, no progression check in submit — Task 8 (no lock check), Task 12 (link shown per-course, not just "next"). ✓
4. Unlimited immediate retries, no punitive branch on cold-attempt failure — Task 9 (`handleRetry` just reshuffles and resets, no lockout branch anywhere). ✓
5. 70% default pass threshold, per-course configurable — Task 1 (`pass_threshold` column + seed value). ✓
6. Server-side grading, never trust client score — Task 8 (`answers` array in, score computed server-side from the DB's own question data). ✓
7. No bonus XP, streak still ticks on every attempt — Task 8 (`xpToAdd: 0` unconditionally). ✓
8. `skipped` derived, badge shown — Task 3 (derivation), Task 12 (badge). ✓
9. Existing completions grandfathered — no task touches existing `academy_user_course_progress` rows; called out explicitly in Design Decisions. ✓

**Placeholder scan:** No `TBD`/`TODO`/"add appropriate handling" found. The one deliberate simplification — `courseTitle={courseSlug}` fallback in Task 9 Step 3, resolved properly in Task 11 Step 3 — is explained inline, not left vague.

**Type consistency:** `CourseFinalQuiz` (Task 2) is the single type threaded through Tasks 7, 8, 9 with identical field names (`questions`, `passThreshold`). `QuizLesson`'s widened `onComplete(score, answers)` (Task 6) matches its two call sites: `LessonPlayer.tsx` (unchanged, ignores 2nd arg) and `CourseFinalQuiz.tsx`'s `handleComplete(_score, pickedInShuffledOrder)` (Task 9). The submit route's request/response shape (Task 8: `{answers: number[]}` in, `{success, passed, score, nextCourseSlug, stats}` out) matches exactly what `CourseFinalQuiz.tsx`'s `submitMutation` sends and reads (Task 9).
