-- 149_congress_trades.sql
-- Congressional trading disclosures (STOCK Act Periodic Transaction Reports).
-- Sibling of the 13F institutional tracker in migration 127 -- same
-- ingest-once-serve-many shape, deliberately different read gate. See
-- lib/congress/ and app/api/cron/sync-congress-trades.
--
-- WHY THE READ GATE IS PUBLIC HERE AND PRO-ONLY FOR 13F
-- -----------------------------------------------------
-- 5 U.S.C. 13107(c)(1)(B) makes it unlawful to use a financial disclosure
-- report "for any commercial purpose, other than by news and communications
-- media for dissemination to the general public". 13F filings carry no such
-- restriction, which is why migration 127 can hard-gate holdings behind Pro.
-- Here the disclosure data itself is public and crawlable -- that is the
-- "dissemination to the general public" posture -- and Pro sells the tooling
-- around it (follow, alerts, cross-referencing against your own holdings),
-- not access to the underlying facts. Do not move congress_trades behind a
-- tier check without revisiting that reasoning.
--
-- DATA SOURCE
-- -----------
-- Disclosed Capitol (api.disclosedcapitol.com), licensed rather than scraped
-- for the same reason as every other vendor here. The official House feed is
-- an XML index pointing at PDFs, ~5-11% of which are scanned or handwritten
-- paper with no text layer; OCRing those would mean printing a misread ticker
-- under a named public official, which is the worst failure this app has.
-- The vendor's value is that normalisation, not access -- the PDFs are free.
--
-- SCOPE: 18 admin-curated members, politician_id values verified live against
-- the vendor on 2026-09-23 (the 30-row trade_count leaderboard, plus Pelosi
-- confirmed directly via /politicians/58/trades). Not all 535 members.

-- ---------------------------------------------------------------------------
-- congress_politicians -- admin-curated roster. Public.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.congress_politicians (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT UNIQUE NOT NULL,
  dc_politician_id INTEGER UNIQUE NOT NULL,   -- Disclosed Capitol id; cron fetch key
  display_name   TEXT NOT NULL,
  party          TEXT,                         -- 'D' | 'R' | 'I'
  state          TEXT,
  chamber        TEXT,                         -- 'House' | 'Senate'
  bioguide_id    TEXT,                         -- congress.gov id; also resolves the free headshot
  photo_url      TEXT,                         -- nullable; UI falls back to initials
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_congress_politicians_active
  ON public.congress_politicians (is_active, sort_order);

ALTER TABLE public.congress_politicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active congress politicians"
  ON public.congress_politicians FOR SELECT
  USING (is_active = TRUE);

-- No INSERT/UPDATE/DELETE policy: writes are service-role only.

-- ---------------------------------------------------------------------------
-- congress_trades -- one row per disclosed transaction. Public.
--
-- Deliberately stores only the immutable disclosure facts. The vendor also
-- returns derived analytics (gain_30d, alpha_90d, conviction_score,
-- current_return...) which are omitted on purpose: they are time-dependent,
-- so a stored copy silently goes stale and renders as though it were live.
-- Any performance view we want gets computed from our own price data.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.congress_trades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id     UUID NOT NULL REFERENCES public.congress_politicians(id) ON DELETE CASCADE,
  dc_trade_id       INTEGER UNIQUE NOT NULL,   -- vendor's stable trade id; cron idempotency key
  symbol            TEXT,                       -- resolved ticker; NULL = unresolved, still valid data
  asset_description TEXT NOT NULL,              -- raw filing text, e.g. 'Bloom Energy Corporation Class A'
  asset_type        TEXT,                       -- 'Stock' | 'Option' | 'Bond' | 'Other' | 'Holding'
  trade_type        TEXT NOT NULL,              -- 'Buy' | 'Sell' | 'Exchange'
  amount_range      TEXT NOT NULL,              -- the filed bracket verbatim, e.g. '$500,001 - $1,000,000'
  amount_low        NUMERIC(14,2),              -- bracket floor; NEVER midpoint these two into a
  amount_high       NUMERIC(14,2),              -- single "estimated value" -- the range is the fact
  transaction_date  DATE NOT NULL,
  disclosure_date   DATE,
  days_to_disclose  INTEGER,                    -- >45 means filed late under the STOCK Act
  sector            TEXT,
  industry          TEXT,
  source            TEXT,                       -- 'house.gov' | 'senate.gov'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_congress_trades_politician
  ON public.congress_trades (politician_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_congress_trades_symbol
  ON public.congress_trades (symbol, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_congress_trades_disclosure
  ON public.congress_trades (disclosure_date DESC);

ALTER TABLE public.congress_trades ENABLE ROW LEVEL SECURITY;

-- Public by design -- see the header note on 5 U.S.C. 13107.
CREATE POLICY "Anyone can read congress trades"
  ON public.congress_trades FOR SELECT
  USING (TRUE);

-- No INSERT/UPDATE/DELETE policy: writes are service-role only (cron).

-- ---------------------------------------------------------------------------
-- Seed: 18 curated members. Every dc_politician_id below was returned by a
-- live vendor call on 2026-09-23, not copied from documentation.
--
-- Ro Khanna (41,071 trades), Donald Trump (35,756) and Michael McCaul
-- (31,332) dwarf everyone else because of managed-account churn. Khanna is
-- kept because he is the most-discussed name in this space; Trump is excluded
-- as executive branch rather than Congress, and McCaul is excluded as noise
-- without the name recognition to justify it.
-- ---------------------------------------------------------------------------

INSERT INTO public.congress_politicians
  (slug, dc_politician_id, display_name, party, state, chamber, bioguide_id, sort_order) VALUES
  ('nancy-pelosi',          58,  'Nancy Pelosi',          'D', 'CA', 'House',  'P000197', 10),
  ('tommy-tuberville',     381,  'Tommy Tuberville',      'R', 'AL', 'Senate', 'T000278', 20),
  ('ro-khanna',            400,  'Ro Khanna',             'D', 'CA', 'House',  'K000389', 30),
  ('josh-gottheimer',       27,  'Josh Gottheimer',       'D', 'NJ', 'House',  'G000583', 40),
  ('daniel-goldman',       316,  'Daniel Goldman',        'D', 'NY', 'House',  'G000599', 50),
  ('diana-harshbarger',    419,  'Diana Harshbarger',     'R', 'TN', 'House',  'H001086', 60),
  ('lisa-mcclain',          47,  'Lisa McClain',          'R', 'MI', 'House',  'M001136', 70),
  ('sheldon-whitehouse',   346,  'Sheldon Whitehouse',    'D', 'RI', 'Senate', 'W000802', 80),
  ('shelley-moore-capito', 348,  'Shelley Moore Capito',  'R', 'WV', 'Senate', 'C001047', 90),
  ('susan-collins',        340,  'Susan Collins',         'R', 'ME', 'Senate', 'C001035', 100),
  ('mike-kelly',            38,  'Mike Kelly',            'R', 'PA', 'House',  'K000376', 110),
  ('virginia-foxx',         22,  'Virginia Foxx',         'R', 'NC', 'House',  'F000450', 120),
  ('scott-peters',          59,  'Scott H. Peters',       'D', 'CA', 'House',  'P000608', 130),
  ('don-beyer',              4,  'Donald Sternoff Beyer', 'D', 'VA', 'House',  'B001292', 140),
  ('kevin-hern',            31,  'Kevin Hern',            'R', 'OK', 'House',  'H001082', 150),
  ('suzan-delbene',         14,  'Suzan K. DelBene',      'D', 'WA', 'House',  'D000617', 160),
  ('judy-chu',             196,  'Judy Chu',              'D', 'CA', 'House',  'C001080', 170),
  ('gilbert-cisneros',       8,  'Gilbert Cisneros',      'D', 'CA', 'House',  'C001123', 180)
ON CONFLICT (slug) DO NOTHING;
