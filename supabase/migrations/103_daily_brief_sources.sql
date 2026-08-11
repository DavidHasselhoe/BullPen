-- Daily Brief sources
-- Stores the deduplicated web-search citations Claude actually drew from
-- when writing the published brief, so the UI can link back to originals.
-- Each element: { url: string, title: string, domain: string }

ALTER TABLE daily_briefs
  ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]'::jsonb;
