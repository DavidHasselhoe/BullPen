CREATE TABLE public.stock_thesis_replies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id  UUID        NOT NULL REFERENCES public.stock_theses(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_thesis_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Replies readable by authenticated users"
  ON public.stock_thesis_replies FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authors manage own replies"
  ON public.stock_thesis_replies FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_thesis_replies_thesis_id ON public.stock_thesis_replies (thesis_id, created_at);
