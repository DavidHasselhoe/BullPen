-- ---------------------------------------------------------------------------
-- Check the vendor's tickers against the filed asset name.
--
-- Why: Disclosed Capitol guesses tickers from the filed name, and guesses
-- wrong often enough to matter. Measured 2026-10-02 on 2,731 vendor-ticker
-- rows: Lamborn's NetApp filed under NFLX (38 rows), NVDA, NTRA, AAPL, NDAQ
-- and NETE; Khanna's Dollar General as GEN, UnitedHealth as UHGI, Carrier as
-- CCRN; VeriSign as VZ, PACCAR as PKG; every municipal bond as MUNI or BOND
-- (two PIMCO ETFs), or as HII/HCC/WMT when the issuer is Honolulu, Harris
-- County or Seattle. Each of those printed a real ticker under a public
-- official's name and fed the stock-page activity card, the scorecard and
-- follower notifications.
--
-- The decision lives in lib/congress/ingest-trades.ts (verifyVendorSymbols),
-- where it is unit-tested. This function only supplies normalised keys: the
-- filed name, and every name we know for each ticker (listed names plus 13F
-- issuer names), through the same norm_company_name the resolver uses.
-- Accents are folded first: search_index has 'Estée Lauder', which the
-- normaliser otherwise turns into 'EST E LAUDER'.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.congress_name_keys(descs text[], syms text[])
RETURNS TABLE (kind text, input text, key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH known AS MATERIALIZED (
    SELECT DISTINCT s.ticker AS symbol, s.name AS raw
    FROM search_index s
    WHERE s.ticker = ANY(syms)
    UNION
    SELECT DISTINCT m.symbol, h.name_of_issuer
    FROM cusip_ticker_map m
    JOIN institutional_holdings h ON h.cusip = m.cusip
    WHERE m.symbol = ANY(syms)
      AND NOT (m.resolution_method = 'company_index' AND m.confidence = 'low')
  )
  SELECT 'desc', d,
         norm_company_name(translate(d, 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
  FROM unnest(descs) AS d
  UNION ALL
  SELECT 'symbol', k.symbol,
         norm_company_name(translate(k.raw, 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
  FROM known k
$$;

REVOKE ALL ON FUNCTION public.congress_name_keys(text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.congress_name_keys(text[], text[]) TO service_role;

-- The vendor's original ticker on any row whose symbol we changed, so a
-- correction can be audited or reverted. symbol_source now reads:
--   NULL             vendor ticker, kept (agrees with the filed name, or unverifiable)
--   'name_match'     vendor sent none, resolved from the filed name (migration 155)
--   'name_corrected' vendor ticker disagreed with the filed name, replaced
--   'vendor_rejected' vendor ticker disagreed and nothing resolved: symbol NULL
ALTER TABLE public.congress_trades ADD COLUMN IF NOT EXISTS vendor_symbol text;
