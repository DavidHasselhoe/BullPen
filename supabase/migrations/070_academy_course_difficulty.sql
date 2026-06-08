-- BullPen Academy — per-course difficulty tag (beginner | intermediate | advanced).
-- Nullable: existing courses default to no tag until backfilled by their seed.

ALTER TABLE academy_courses
  ADD COLUMN IF NOT EXISTS difficulty TEXT
    CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'));

-- Tag the existing intro course.
UPDATE academy_courses SET difficulty = 'beginner' WHERE slug = 'what-is-a-stock' AND difficulty IS NULL;
