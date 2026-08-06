-- Automated Instagram content pipeline — generated posts staged for review
-- before publishing, and an audit trail of what was ever actually posted.
--
-- Internal/ops table, not user-facing: nothing in the app reads this table
-- directly. The only readers/writers are the generation cron
-- (app/api/cron/instagram-earnings-weekly), the public slide-render route
-- (app/api/instagram/render/[postId]/[slideIndex], which only ever selects
-- 'ready'/'published' rows), and the manual publish script
-- (scripts/publish-instagram.ts) — all service-role. No end user or
-- authenticated-role policy is needed, mirroring ai_stock_picks' "no
-- INSERT/UPDATE/DELETE policy: writes are service-role only" posture from
-- migration 093, but without even a SELECT policy since there is no
-- user-facing read case here at all.

CREATE TABLE IF NOT EXISTS public.instagram_posts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'earnings_calendar' only for now; stock_picks / market_insights are
  -- designed to slot in later as additional values without a schema change.
  content_type          TEXT NOT NULL,
  -- Idempotency key for the generation cron, e.g. ISO week '2026-W33'.
  -- Scoped per content_type so different content types can reuse the same
  -- period without colliding.
  period_key            TEXT NOT NULL,

  status                TEXT NOT NULL DEFAULT 'draft',

  -- Structured slide content the render route turns into PNGs on demand —
  -- never the images themselves. Shape is defined by
  -- lib/instagram/content/schema.ts for the 'earnings_calendar' type.
  slides                JSONB NOT NULL,
  caption                TEXT NOT NULL,

  -- Populated once actually published via the Instagram Graph API.
  instagram_media_id    TEXT,
  instagram_permalink   TEXT,
  -- Populated on a failed publish attempt (client-side or Graph API error).
  error                  TEXT,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at           TIMESTAMPTZ,

  CONSTRAINT instagram_posts_status_check
    CHECK (status IN ('draft', 'ready', 'published', 'failed')),
  CONSTRAINT instagram_posts_published_fields_check
    CHECK (status <> 'published' OR (instagram_media_id IS NOT NULL AND published_at IS NOT NULL)),

  UNIQUE (content_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_instagram_posts_status
  ON public.instagram_posts (status, created_at DESC);

COMMENT ON TABLE public.instagram_posts IS
  'Generated Instagram carousel content, staged for a manual review-and-publish step. Service-role only.';
COMMENT ON COLUMN public.instagram_posts.period_key IS
  'Idempotency key for the generation cron (e.g. ISO week "2026-W33"), unique per content_type.';
COMMENT ON COLUMN public.instagram_posts.slides IS
  'Structured slide content consumed by the render route to produce PNGs on demand — not rendered images.';

ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policy at all: this table has no
-- authenticated-user-facing read or write path. Every access — the
-- generation cron, the public render route, and the publish script — goes
-- through createServerClient() (service role), which bypasses RLS by design.
