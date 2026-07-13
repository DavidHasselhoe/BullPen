-- BullPen Academy — Pro gating
-- Adds a boolean flag so intermediate/advanced courses can be reserved for Pro
-- subscribers while all beginner courses stay free. Decoupled from `difficulty`
-- (which is purely descriptive) so gating can change independently later.

ALTER TABLE academy_courses
  ADD COLUMN IF NOT EXISTS requires_pro BOOLEAN NOT NULL DEFAULT FALSE;
