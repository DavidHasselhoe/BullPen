-- BullPen Academy — Phase 1 schema
-- Six tables backing a Duolingo-style interactive investing education feature.
-- Content (courses, lessons) is read-only for authenticated users.
-- User-owned tables (progress, stats) use auth.uid() = user_id RLS.
-- Glossary cache is read-only for clients; writes happen server-side via service role.

-- ────────────────────────────────────────────────────────────────────────────
-- Content tables
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academy_courses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT        UNIQUE NOT NULL,
  title        TEXT        NOT NULL,
  description  TEXT,
  icon         TEXT,
  color        TEXT,
  order_index  INT         NOT NULL DEFAULT 0,
  is_published BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_courses_order ON academy_courses(order_index);

CREATE TABLE IF NOT EXISTS academy_lessons (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  slug        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('read','quiz','match','scenario')),
  order_index INT         NOT NULL DEFAULT 0,
  xp_reward   INT         NOT NULL DEFAULT 10,
  content     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_academy_lessons_course ON academy_lessons(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_academy_lessons_content ON academy_lessons USING GIN (content);

-- ────────────────────────────────────────────────────────────────────────────
-- Per-user progress
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academy_user_course_progress (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id      UUID        NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  last_lesson_id UUID        REFERENCES academy_lessons(id) ON DELETE SET NULL,
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_academy_ucp_user ON academy_user_course_progress(user_id);

CREATE TABLE IF NOT EXISTS academy_user_lesson_progress (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id    UUID        NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score        NUMERIC,
  xp_earned    INT         NOT NULL DEFAULT 0,
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_academy_ulp_user ON academy_user_lesson_progress(user_id);

CREATE TABLE IF NOT EXISTS academy_user_stats (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp           INT  NOT NULL DEFAULT 0,
  current_streak     INT  NOT NULL DEFAULT 0,
  longest_streak     INT  NOT NULL DEFAULT 0,
  last_activity_date DATE,
  level              INT  NOT NULL DEFAULT 1
);

-- ────────────────────────────────────────────────────────────────────────────
-- Glossary cache (shared across users; writes via service role only)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academy_glossary_cache (
  term        TEXT        PRIMARY KEY,
  explanation TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE academy_courses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_lessons                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_user_course_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_user_lesson_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_user_stats              ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_glossary_cache          ENABLE ROW LEVEL SECURITY;

-- Courses: any authed user can read published courses
DROP POLICY IF EXISTS "Authenticated users can read academy courses" ON academy_courses;
CREATE POLICY "Authenticated users can read academy courses"
  ON academy_courses FOR SELECT
  TO authenticated
  USING (is_published = TRUE);

-- Lessons: any authed user can read lessons of published courses
DROP POLICY IF EXISTS "Authenticated users can read academy lessons" ON academy_lessons;
CREATE POLICY "Authenticated users can read academy lessons"
  ON academy_lessons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM academy_courses c
      WHERE c.id = academy_lessons.course_id AND c.is_published = TRUE
    )
  );

-- User course progress: full CRUD on own rows
DROP POLICY IF EXISTS "Users can read own course progress" ON academy_user_course_progress;
CREATE POLICY "Users can read own course progress"
  ON academy_user_course_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own course progress" ON academy_user_course_progress;
CREATE POLICY "Users can insert own course progress"
  ON academy_user_course_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own course progress" ON academy_user_course_progress;
CREATE POLICY "Users can update own course progress"
  ON academy_user_course_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- User lesson progress: full CRUD on own rows
DROP POLICY IF EXISTS "Users can read own lesson progress" ON academy_user_lesson_progress;
CREATE POLICY "Users can read own lesson progress"
  ON academy_user_lesson_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own lesson progress" ON academy_user_lesson_progress;
CREATE POLICY "Users can insert own lesson progress"
  ON academy_user_lesson_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own lesson progress" ON academy_user_lesson_progress;
CREATE POLICY "Users can update own lesson progress"
  ON academy_user_lesson_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- User stats: full CRUD on own row
DROP POLICY IF EXISTS "Users can read own academy stats" ON academy_user_stats;
CREATE POLICY "Users can read own academy stats"
  ON academy_user_stats FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own academy stats" ON academy_user_stats;
CREATE POLICY "Users can insert own academy stats"
  ON academy_user_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own academy stats" ON academy_user_stats;
CREATE POLICY "Users can update own academy stats"
  ON academy_user_stats FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Glossary cache: read for authenticated; writes via service role only (no insert/update policy)
DROP POLICY IF EXISTS "Authenticated users can read glossary cache" ON academy_glossary_cache;
CREATE POLICY "Authenticated users can read glossary cache"
  ON academy_glossary_cache FOR SELECT
  TO authenticated
  USING (true);
