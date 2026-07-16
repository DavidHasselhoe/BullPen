-- Optional Academy courses — lets users skip a course entirely (no lessons
-- required) to unlock the next one. "Beyond Stocks: ETFs & Crypto" is the
-- first course marked optional: most beginners land in Academy for stocks
-- fundamentals, not crypto, and requiring 5 lessons on an asset class they
-- may not care about is unnecessary friction toward the rest of the curriculum.

ALTER TABLE academy_courses
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

UPDATE academy_courses
  SET is_optional = true
  WHERE slug = 'etfs-and-crypto';
