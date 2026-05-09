CREATE TABLE portfolio_generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thesis TEXT NOT NULL,
  portfolio JSONB NOT NULL,
  logo_map JSONB DEFAULT '{}'::jsonb,
  replaced_tickers TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portfolio_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own portfolio generations"
  ON portfolio_generations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX portfolio_generations_user_created
  ON portfolio_generations(user_id, created_at DESC);
