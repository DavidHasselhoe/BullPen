-- ---------------------------------------------------------------------------
-- Concentration metrics on institutional_filings.
--
-- The fund cards on Discover label each fund "Concentrated" / "Focused" /
-- "Diversified" / "Very broad", but the only aggregate this route could read
-- was total_positions, so the label was really a position-count bucket
-- wearing a concentration word. Berkshire held 29 names with Apple at 22% of
-- the book and read "Focused"; Bridgewater held 997 names and read "Very
-- broad" for the same reason -- the count, not the shape.
--
-- Storing the two weights the label actually needs, rather than computing
-- them per request: the holdings are Pro-gated at the RLS layer and a fund
-- like Citadel has 7166 rows, so the public list route must not touch them.
-- These are aggregates of a filing, in the same class as total_value_usd,
-- and they change only when a new filing is ingested.
--
--   top_holding_pct  largest single holding as % of the filing's total value
--   top5_pct         five largest holdings as % of the filing's total value
--
-- Both nullable: a filing that is 'pending' or 'parse_failed' has no
-- holdings to measure yet, and the UI renders no label rather than guessing.
-- ---------------------------------------------------------------------------

ALTER TABLE public.institutional_filings
  ADD COLUMN IF NOT EXISTS top_holding_pct NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS top5_pct        NUMERIC(6,3);

-- Backfill every already-ingested filing from its stored holdings.
WITH ranked AS (
  SELECT h.filing_id,
         h.value_usd,
         ROW_NUMBER() OVER (PARTITION BY h.filing_id ORDER BY h.value_usd DESC) AS rn,
         SUM(h.value_usd) OVER (PARTITION BY h.filing_id)                       AS filing_total
  FROM public.institutional_holdings h
),
agg AS (
  SELECT filing_id,
         MAX(filing_total)                                     AS total,
         MAX(value_usd) FILTER (WHERE rn = 1)                  AS top1,
         SUM(value_usd) FILTER (WHERE rn <= 5)                 AS top5
  FROM ranked
  GROUP BY filing_id
)
UPDATE public.institutional_filings f
SET top_holding_pct = ROUND((agg.top1 / agg.total * 100)::NUMERIC, 3),
    top5_pct        = ROUND((agg.top5 / agg.total * 100)::NUMERIC, 3)
FROM agg
WHERE agg.filing_id = f.id
  AND agg.total > 0;
