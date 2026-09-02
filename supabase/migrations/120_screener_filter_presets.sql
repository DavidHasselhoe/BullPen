-- Screener filter presets: user-saved custom filter combinations.
--
-- Deliberately separate from screener_views (062): a view selects WHICH
-- stocks enter the table (a ticker list — universe), a filter preset selects
-- WHICH OF THOSE SURVIVE (criteria). The two are orthogonal today — applying
-- a preset does not change the active view, and switching views does not
-- clear filters — and conflating them into one table would make both
-- concepts murkier for no benefit.

CREATE TABLE IF NOT EXISTS screener_filter_presets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  filters     jsonb       NOT NULL DEFAULT '{}',
  position    smallint    NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE screener_filter_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own screener filter presets"
  ON screener_filter_presets FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX screener_filter_presets_user_id_idx ON screener_filter_presets (user_id, position);
