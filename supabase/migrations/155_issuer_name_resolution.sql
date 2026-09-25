-- ---------------------------------------------------------------------------
-- Resolve tickers for congressional/executive trades the vendor left blank.
--
-- Why: Disclosed Capitol returns ticker 'N/A' for every one of Donald Trump's
-- trades (0 of 100 sampled 2026-09-25), although the descriptions are plain
-- SEC issuer names: 'HOME DEPOT INC', 'TEXAS INSTRS INC', truncated at 24
-- characters ('FIDELITY NATL INFORMATIO'). He was left off the roster at
-- launch for exactly this reason.
--
-- This is deliberately NOT fuzzy matching (the trigram RPC from 128 is not
-- used): a wrong ticker printed under a public official's name is the failure
-- that matters. Both sides are normalised the same deterministic way and must
-- be EQUAL. A description resolves only when every candidate from both
-- sources agrees on exactly one symbol; any disagreement or second candidate
-- (e.g. two Alphabet share classes) leaves it unresolved.
--
--   Source 1: 13F issuer names (the same SEC abbreviation style) joined to the
--             CUSIP-resolved ticker, excluding low-confidence fuzzy rows.
--   Source 2: search_index stock names ('The Procter & Gamble Company').
--
-- Measured on Trump's 99 distinct descriptions: 13F-exact alone resolved 62,
-- all verified by eye.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.norm_company_name(x text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
  pair text[];
  noise constant text := ' (INC|INCORPORATED|CO|CORP|CORPORATION|COMPANY|PLC|LTD|LIMITED|HOLDINGS|GROUP|NEW|DEL|WIS|COMMON STOCK|CAPITAL STOCK|EQUITY|CLASS [A-C]|CLASS|REIT|F|N V|S A|LP|L P) $';
BEGIN
  IF x IS NULL THEN RETURN NULL; END IF;
  s := replace(upper(x), '''', '');                 -- WENDY'S -> WENDYS, not WENDY S
  s := regexp_replace(s, '^THE\s+', '');
  -- Collapse to single spaces BEFORE padding: 'INC.' became 'INC  ' and the
  -- one-space noise pattern then never matched it (caught in the Trump audit).
  s := ' ' || trim(regexp_replace(s, '[^A-Z0-9&]+', ' ', 'g')) || ' ';
  s := replace(s, ' AND ', ' & ');
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['INTL','INTERNATIONAL'], ['SVCS','SERVICES'], ['SVC','SERVICE'], ['FINL','FINANCIAL'],
    ['INDS','INDUSTRIES'], ['SYS','SYSTEMS'], ['INSTRS','INSTRUMENTS'], ['CMNTYS','COMMUNITIES'],
    ['ENTMT','ENTERTAINMENT'], ['ELEC','ELECTRIC'], ['PRODS','PRODUCTS'], ['AWYS','AIRWAYS'],
    ['UTILS','UTILITIES'], ['RUBR','RUBBER'], ['NATL','NATIONAL'], ['PPTYS','PROPERTIES'],
    ['HLDGS','HOLDINGS'], ['HLDG','HOLDINGS'], ['LABS','LABORATORIES'], ['MFG','MANUFACTURING'],
    ['BK','BANK'], ['BANCORPORATION','BANCORP'], ['TR','TRUST'], ['RES','RESOURCES'], ['MGMT','MANAGEMENT'], ['UN','UNION']
  ] LOOP
    s := replace(s, ' ' || pair[1] || ' ', ' ' || pair[2] || ' ');
  END LOOP;
  WHILE s ~ noise LOOP
    s := regexp_replace(s, noise, ' ');
  END LOOP;
  RETURN trim(regexp_replace(s, '\s+', ' ', 'g'));
END $$;

CREATE OR REPLACE FUNCTION public.resolve_issuer_symbols(names text[])
RETURNS TABLE (name text, symbol text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- MATERIALIZED everywhere: inlined, the planner re-ran norm_company_name
  -- (a plpgsql loop) for every name x candidate pair and 500 names timed out.
  WITH q AS MATERIALIZED (
    SELECT n AS name, norm_company_name(n) AS key, length(n) = 24 AS truncated,
           replace(replace(upper(n), '%', '\%'), '_', '\_') || '%' AS prefix,
           substring(upper(n) FROM '\mCLASS ([A-C])\M') AS share_class
    FROM unnest(names) AS n
  ),
  issuers AS MATERIALIZED (
    SELECT DISTINCT norm_company_name(h.name_of_issuer) AS key, upper(h.name_of_issuer) AS raw, m.symbol,
           NULL::text AS share_class
    FROM institutional_holdings h
    JOIN cusip_ticker_map m ON m.cusip = h.cusip
    WHERE m.symbol IS NOT NULL AND h.put_call IS NULL
      AND NOT (m.resolution_method = 'company_index' AND m.confidence = 'low')
  ),
  listed AS MATERIALIZED (
    SELECT norm_company_name(s.name) AS key, upper(s.name) AS raw, s.ticker AS symbol,
           substring(upper(s.name) FROM '\mCLASS ([A-C])\M') AS share_class
    FROM search_index s
    WHERE s.kind = 's'
      -- Preferreds and units carry the plain company name too ('Public
      -- Storage' is PSA, PSA-T and PSA.PR.S), which would make every such
      -- name ambiguous. Class shares like BRK.B are kept.
      AND s.ticker !~ '-|\.PR' AND s.ticker !~ '^[A-Z]{4}[UWR]$'
  ),
  pool AS MATERIALIZED (
    SELECT key, raw, symbol, share_class FROM issuers
    UNION ALL
    SELECT key, raw, symbol, share_class FROM listed
  ),
  candidates AS (
    SELECT q.name, p.symbol FROM q JOIN pool p
      -- A 24-char description is a cut-off issuer name: match it as a prefix
      -- of the raw name, the same cut the SEC applied.
      ON (p.key = q.key OR (q.truncated AND p.raw LIKE q.prefix))
      -- 'WATSCO INC CLASS A' must not become WSO.B (Class B).
      AND (q.share_class IS NULL OR p.share_class IS NULL OR q.share_class = p.share_class)
  )
  SELECT c.name, min(c.symbol)
  FROM candidates c
  GROUP BY c.name
  HAVING count(DISTINCT c.symbol) = 1
$$;

REVOKE ALL ON FUNCTION public.resolve_issuer_symbols(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_issuer_symbols(text[]) TO service_role;

-- Where a stored ticker came from, so name-resolved rows can be audited or
-- reverted without touching the vendor's own. NULL = the vendor's ticker.
ALTER TABLE public.congress_trades ADD COLUMN IF NOT EXISTS symbol_source text;

-- Trump (Disclosed Capitol id 1587). Inactive until the first ingest has been
-- audited; flipped on by hand once the resolved tickers are checked.
INSERT INTO public.congress_politicians (slug, dc_politician_id, display_name, party, chamber, is_active, sort_order)
VALUES ('donald-trump', 1587, 'Donald J. Trump', 'R', 'Executive', false, 5)
ON CONFLICT (slug) DO NOTHING;

-- Activated after the first ingest (500 rows, 2026-07-24..31) was audited by
-- hand: 428 carry a ticker, 423 of them name-resolved, all 388 distinct
-- description -> ticker pairs checked against the listed company name.
UPDATE public.congress_politicians SET is_active = true WHERE slug = 'donald-trump';
