-- Backfills difficulty='beginner' for the pre-existing "Reading a Stock Price"
-- course (inserted directly into the DB before migration 070 added the
-- difficulty column's default backfill). Same treatment migration 070 gave
-- what-is-a-stock; this course's content is clearly beginner-level too.

UPDATE academy_courses SET difficulty = 'beginner' WHERE slug = 'reading-a-stock-price' AND difficulty IS NULL;
