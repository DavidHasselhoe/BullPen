-- The revenue-segment cache could not hold a company's annual and quarterly
-- breakdowns at the same time.
--
-- The key was (ticker, period_end), and a fiscal year ends on the same date as
-- its fourth quarter — for every company, not as an edge case. Microsoft's
-- fiscal Q4 2026 and its FY2026 both end 2026-06-30, so the two rows wanted
-- one key. The annual 10-K row won, and the quarterly chart was served it:
-- three segments summing to 369% of the quarter's revenue, each individually
-- larger than the total drawn above it.
--
-- Adding the duration to the key lets both exist. The serving path in
-- app/api/stock/[ticker]/segments/route.ts also now re-checks that the parts
-- sum to the revenue on screen, so a mismatch renders as no breakdown rather
-- than a wrong one, whatever the cache happens to hold.

ALTER TABLE public.revenue_segments
  ADD COLUMN IF NOT EXISTS period text;

-- Backfilled from the form, which is what the fill already chose by period:
-- a 10-K was fetched for an annual view, a 10-Q for a quarterly one. Nothing
-- has to be re-downloaded.
UPDATE public.revenue_segments
   SET period = CASE WHEN form = '10-K' THEN 'annual' ELSE 'quarterly' END
 WHERE period IS NULL;

ALTER TABLE public.revenue_segments
  ALTER COLUMN period SET NOT NULL;

ALTER TABLE public.revenue_segments
  ADD CONSTRAINT revenue_segments_period_check CHECK (period IN ('annual', 'quarterly'));

ALTER TABLE public.revenue_segments
  DROP CONSTRAINT revenue_segments_pkey;

ALTER TABLE public.revenue_segments
  ADD CONSTRAINT revenue_segments_pkey PRIMARY KEY (ticker, period_end, period);

COMMENT ON COLUMN public.revenue_segments.period IS
  'Which duration this breakdown describes. Part of the key because a fiscal year and its Q4 share an end date.';
