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
