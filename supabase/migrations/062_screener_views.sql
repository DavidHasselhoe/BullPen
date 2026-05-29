-- Screener views: user-saved custom stock lists for the screener

CREATE TABLE IF NOT EXISTS screener_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  tickers     text[]      NOT NULL DEFAULT '{}',
  position    smallint    NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE screener_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own screener views"
  ON screener_views FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX screener_views_user_id_idx ON screener_views (user_id, position);
