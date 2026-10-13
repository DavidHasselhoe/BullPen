-- Pershing Square: follow the 13F to its new filer.
--
-- From Q2 2026 Pershing Square Capital Management, L.P. (CIK 1336528) files a
-- 13F-NOTICE only; its whole portfolio is reported inside the 13F COMBINATION
-- REPORT of its parent, PERSHING SQUARE INC. (CIK 2026053, accession
-- 0001172661-26-003790). The sync only reads 13F-HR, so the fund silently
-- stopped at Q1. Same fund, same positions (HHH 18,852,064 shares in both),
-- plus the parent's own stakes.
--
-- The parent's own Q1 report (0001172661-26-002339, also a combination report)
-- held one position the old filer's Q1 did not: 9,000,000 HHH, $569,340,000.
-- Folding it into the stored Q1 makes Q1 and Q2 cover the same entities, so the
-- quarter diff doesn't show a 9M-share HHH "increase" that is really a change
-- of filer. Both figures are as filed. Re-ingesting Q1 with reingest:true would
-- undo this; don't.

UPDATE institutional_investors SET cik = '2026053' WHERE slug = 'pershing-square';

WITH q1 AS (
  SELECT f.id FROM institutional_filings f
  JOIN institutional_investors i ON i.id = f.investor_id
  WHERE i.slug = 'pershing-square' AND f.accession_number = '0001172661-26-002336'
)
UPDATE institutional_holdings h
SET shares = h.shares + 9000000, value_usd = h.value_usd + 569340000
FROM q1
WHERE h.filing_id = q1.id AND h.cusip = '44267T102' AND h.put_call IS NULL AND h.shares = 18852064;

WITH q1 AS (
  SELECT f.id FROM institutional_filings f
  JOIN institutional_investors i ON i.id = f.investor_id
  WHERE i.slug = 'pershing-square' AND f.accession_number = '0001172661-26-002336'
), total AS (
  SELECT h.filing_id, SUM(h.value_usd) AS v FROM institutional_holdings h JOIN q1 ON q1.id = h.filing_id GROUP BY h.filing_id
)
UPDATE institutional_holdings h
SET portfolio_pct = ROUND((h.value_usd / total.v * 100)::numeric, 3)
FROM total WHERE h.filing_id = total.filing_id;

WITH q1 AS (
  SELECT f.id FROM institutional_filings f
  JOIN institutional_investors i ON i.id = f.investor_id
  WHERE i.slug = 'pershing-square' AND f.accession_number = '0001172661-26-002336'
), agg AS (
  SELECT h.filing_id,
         SUM(h.value_usd) AS total_value,
         MAX(h.portfolio_pct) AS top1,
         (SELECT SUM(p) FROM (SELECT h2.portfolio_pct AS p FROM institutional_holdings h2
                              WHERE h2.filing_id = h.filing_id ORDER BY h2.value_usd DESC LIMIT 5) t) AS top5
  FROM institutional_holdings h JOIN q1 ON q1.id = h.filing_id GROUP BY h.filing_id
)
UPDATE institutional_filings f
SET total_value_usd = agg.total_value, top_holding_pct = agg.top1, top5_pct = agg.top5
FROM agg WHERE f.id = agg.filing_id;
