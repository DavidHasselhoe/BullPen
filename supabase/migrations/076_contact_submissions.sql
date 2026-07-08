-- Contact form submissions
-- Written only by the /api/contact route via the service-role server client.
-- RLS is enabled with NO policies at all: zero anon/authenticated access by
-- design. Reads happen via direct Supabase dashboard/SQL access, not the app.

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
