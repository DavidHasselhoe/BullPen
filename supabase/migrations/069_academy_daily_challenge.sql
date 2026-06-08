-- BullPen Academy — Daily Challenge
-- One quiz question per ET day from a pre-generated, human-reviewed pool.
-- Completing the challenge feeds the existing academy_user_stats streak.

CREATE TABLE IF NOT EXISTS academy_daily_challenges (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_date DATE        UNIQUE NOT NULL,
  question       TEXT        NOT NULL,
  options        JSONB       NOT NULL,           -- string[]
  correct_index  INT         NOT NULL,
  explanation    TEXT        NOT NULL,
  xp_reward      INT         NOT NULL DEFAULT 15,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_daily_date ON academy_daily_challenges(challenge_date);

CREATE TABLE IF NOT EXISTS academy_user_daily_challenge (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id   UUID        NOT NULL REFERENCES academy_daily_challenges(id) ON DELETE CASCADE,
  challenge_date DATE        NOT NULL,
  was_correct    BOOLEAN     NOT NULL,
  xp_earned      INT         NOT NULL DEFAULT 0,
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, challenge_date)               -- one attempt per user per ET day (idempotency anchor)
);

CREATE INDEX IF NOT EXISTS idx_academy_udc_user ON academy_user_daily_challenge(user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE academy_daily_challenges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_user_daily_challenge ENABLE ROW LEVEL SECURITY;

-- Challenges: authed users can read. NOTE: the API strips correct_index before
-- sending to clients; never select correct_index into a client response.
DROP POLICY IF EXISTS "Authed read daily challenges" ON academy_daily_challenges;
CREATE POLICY "Authed read daily challenges"
  ON academy_daily_challenges FOR SELECT
  TO authenticated
  USING (true);

-- User attempts: own rows only
DROP POLICY IF EXISTS "Users read own daily challenge" ON academy_user_daily_challenge;
CREATE POLICY "Users read own daily challenge"
  ON academy_user_daily_challenge FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own daily challenge" ON academy_user_daily_challenge;
CREATE POLICY "Users insert own daily challenge"
  ON academy_user_daily_challenge FOR INSERT
  WITH CHECK (auth.uid() = user_id);
