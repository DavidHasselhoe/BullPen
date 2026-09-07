-- 127_institutional_holdings.sql
-- Institutional/hedge-fund 13F-HR holdings tracker (Discover page, Pro
-- feature). SEC 13F-HR filings are free, public, structured quarterly
-- disclosures of US equity holdings for managers with >$100M AUM -- no
-- scraping or document AI needed, just an ingestion pipeline (see
-- app/api/cron/sync-institutional-holdings and lib/institutions/).
--
-- Scope: ~15-20 admin-curated funds (seeded below, CIKs verified live
-- against SEC EDGAR before writing this migration), not all ~5,000
-- registered 13F filers. v1 is structured data only -- no AI narrative.
-- Hard Pro gate: fund names + last-filed date are free (SEO/top-of-funnel),
-- full holdings + diffs are Pro-only.

-- ---------------------------------------------------------------------------
-- institutional_investors -- admin-curated fund registry. Free/public.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.institutional_investors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  cik          TEXT UNIQUE NOT NULL,          -- SEC CIK, unpadded (e.g. '1067983')
  display_name TEXT NOT NULL,                  -- 'Berkshire Hathaway Inc'
  manager_name TEXT,                           -- 'Warren Buffett'
  logo_url     TEXT,                           -- nullable; CompanyLogo falls back to initials
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,  -- admin can retire a fund without deleting history
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institutional_investors_active
  ON public.institutional_investors (is_active, sort_order);

ALTER TABLE public.institutional_investors ENABLE ROW LEVEL SECURITY;

-- Free teaser layer -- fund names, managers, descriptions are public by
-- design (this is the SEO/top-of-funnel content the plan calls for).
CREATE POLICY "Anyone can read active institutional investors"
  ON public.institutional_investors FOR SELECT
  USING (is_active = TRUE);

-- No INSERT/UPDATE/DELETE policy: writes are service-role only (seeded
-- below, maintained by hand via SQL -- no admin UI for ~15-20 rows).

-- ---------------------------------------------------------------------------
-- institutional_filings -- one row per fund per 13F-HR accession. Pro-gated.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.institutional_filings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id       UUID NOT NULL REFERENCES public.institutional_investors(id) ON DELETE CASCADE,
  accession_number  TEXT NOT NULL,             -- '0000950123-26-001234' -- cron idempotency key
  period_of_report  DATE NOT NULL,             -- quarter-end the filing covers
  filed_date        DATE NOT NULL,             -- SEC filing date (up to 45-day lag from period_of_report)
  form_type         TEXT NOT NULL DEFAULT '13F-HR',
  total_value_usd   NUMERIC(20,2),
  total_positions   INTEGER,
  parse_status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'ok' | 'parse_failed'
  parse_error       TEXT,
  ingested_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (investor_id, accession_number),
  CONSTRAINT institutional_filings_parse_status_check
    CHECK (parse_status IN ('pending', 'ok', 'parse_failed'))
);

CREATE INDEX IF NOT EXISTS idx_institutional_filings_investor
  ON public.institutional_filings (investor_id, period_of_report DESC);

ALTER TABLE public.institutional_filings ENABLE ROW LEVEL SECURITY;

-- Whole-row Pro gate -- mirrors the daily_briefs pattern from migration 124
-- exactly (matches lib/billing/tier.ts's tierFromUser() logic).
CREATE POLICY "Pro and admin users can read institutional filings"
  ON public.institutional_filings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'admin'
          OR u.account_tier >= 3
          OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > NOW())
        )
    )
  );

-- No INSERT/UPDATE/DELETE policy: writes are service-role only (cron).

-- ---------------------------------------------------------------------------
-- institutional_holdings -- one row per position per filing. Pro-gated.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.institutional_holdings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id              UUID NOT NULL REFERENCES public.institutional_filings(id) ON DELETE CASCADE,
  cusip                  TEXT NOT NULL,
  name_of_issuer         TEXT NOT NULL,        -- raw SEC text, e.g. 'APPLE INC'
  symbol                 TEXT,                  -- resolved ticker; NULL = unresolved, still valid data
  value_usd              NUMERIC(20,2) NOT NULL,
  shares                 NUMERIC(20,4) NOT NULL,
  share_type             TEXT,                  -- 'SH' | 'PRN'
  investment_discretion  TEXT,                  -- 'SOLE' | 'SHARED' | 'DFND' -- informational, not surfaced v1
  put_call               TEXT,                  -- 'PUT' | 'CALL' | NULL
  portfolio_pct          NUMERIC(6,3),           -- value_usd / filing.total_value_usd, computed at write time
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institutional_holdings_filing ON public.institutional_holdings (filing_id);
CREATE INDEX IF NOT EXISTS idx_institutional_holdings_cusip  ON public.institutional_holdings (cusip);
CREATE INDEX IF NOT EXISTS idx_institutional_holdings_symbol ON public.institutional_holdings (symbol);

ALTER TABLE public.institutional_holdings ENABLE ROW LEVEL SECURITY;

-- Same whole-row Pro gate as institutional_filings (flat repeated check,
-- matching the house style established in migration 125 over a JOIN-based
-- policy).
CREATE POLICY "Pro and admin users can read institutional holdings"
  ON public.institutional_holdings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'admin'
          OR u.account_tier >= 3
          OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > NOW())
        )
    )
  );

-- No INSERT/UPDATE/DELETE policy: writes are service-role only (cron).

-- ---------------------------------------------------------------------------
-- cusip_ticker_map -- persistent CUSIP -> ticker resolution cache.
-- Service-role only: no user-facing meaning, resolved once, reused forever
-- across every fund and every future quarter regardless of who holds it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cusip_ticker_map (
  cusip             TEXT PRIMARY KEY,
  symbol            TEXT,                       -- NULL = confirmed unresolvable, not "not yet tried"
  mic_code          TEXT,
  currency          TEXT,
  company_name      TEXT,                       -- TwelveData/company_index match, for eyeballing accuracy
  resolution_method TEXT NOT NULL,               -- 'company_index' | 'isin_search' | 'manual' | 'unresolved'
  confidence        TEXT,                        -- 'high' | 'low'
  resolved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cusip_ticker_map_method_check
    CHECK (resolution_method IN ('company_index', 'isin_search', 'manual', 'unresolved'))
);

ALTER TABLE public.cusip_ticker_map ENABLE ROW LEVEL SECURITY;
-- Deliberately no SELECT/INSERT/UPDATE/DELETE policy for any client role --
-- service-role only. institutional_holdings.symbol already carries the
-- resolved value for every read path.

-- ---------------------------------------------------------------------------
-- Seed: ~15-20 curated funds. CIKs verified live against SEC EDGAR
-- (data.sec.gov/submissions/CIK*.json) on 2026-09-07 -- each confirmed to
-- resolve to the expected entity name and to have filed 13F-HR forms.
-- ---------------------------------------------------------------------------

INSERT INTO public.institutional_investors (slug, cik, display_name, manager_name, description, sort_order) VALUES
  ('berkshire-hathaway',  '1067983', 'Berkshire Hathaway Inc',              'Warren Buffett',        'Conglomerate holding company run by Warren Buffett, one of the most closely watched 13F filers.', 10),
  ('bridgewater',         '1350694', 'Bridgewater Associates, LP',          'Ray Dalio',              'One of the world''s largest hedge funds, founded by Ray Dalio.', 20),
  ('scion-asset-mgmt',    '1649339', 'Scion Asset Management, LLC',         'Michael Burry',          'Michael Burry''s fund, known for predicting the 2008 housing crash.', 30),
  ('pershing-square',     '1336528', 'Pershing Square Capital Management, L.P.', 'Bill Ackman',       'Activist hedge fund run by Bill Ackman.', 40),
  ('third-point',         '1040273', 'Third Point LLC',                     'Dan Loeb',               'Activist and event-driven hedge fund run by Dan Loeb.', 50),
  ('duquesne-family',     '1536411', 'Duquesne Family Office LLC',          'Stanley Druckenmiller',  'Family office run by macro investor Stanley Druckenmiller.', 60),
  ('baupost-group',       '1061768', 'Baupost Group LLC',                   'Seth Klarman',           'Value-investing fund run by Seth Klarman.', 70),
  ('appaloosa',           '1006438', 'Appaloosa Management LP',             'David Tepper',           'Hedge fund run by David Tepper.', 80),
  ('renaissance-tech',    '1037389', 'Renaissance Technologies LLC',        'Jim Simons',             'Quantitative hedge fund founded by Jim Simons.', 90),
  ('tiger-global',        '1167483', 'Tiger Global Management LLC',         'Chase Coleman',          'Tech-focused hedge fund run by Chase Coleman.', 100),
  ('ark-invest',          '1697748', 'ARK Investment Management LLC',       'Cathie Wood',            'Innovation/growth-focused fund run by Cathie Wood.', 110),
  ('soros-fund-mgmt',     '1029160', 'Soros Fund Management LLC',           'George Soros',           'Family office founded by George Soros.', 120),
  ('greenlight-capital',  '1079114', 'Greenlight Capital Inc',              'David Einhorn',          'Value-investing hedge fund run by David Einhorn.', 130),
  ('coatue-management',   '1135730', 'Coatue Management LLC',               'Philippe Laffont',       'Tech-focused hedge fund run by Philippe Laffont.', 140),
  ('viking-global',       '1103804', 'Viking Global Investors LP',          'Andreas Halvorsen',      'Global long/short equity hedge fund.', 150),
  ('lone-pine-capital',   '1061165', 'Lone Pine Capital LLC',               'Stephen Mandel',         'Tiger Cub hedge fund founded by Stephen Mandel.', 160),
  ('citadel-advisors',    '1423053', 'Citadel Advisors LLC',                'Ken Griffin',            'Multi-strategy hedge fund run by Ken Griffin.', 170)
ON CONFLICT (slug) DO NOTHING;
