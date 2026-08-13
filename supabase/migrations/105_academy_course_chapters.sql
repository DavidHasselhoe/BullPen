-- Groups academy_courses into named "chapters" for the path/map UI on
-- /academy. Purely presentational metadata — does not affect the existing
-- sequential unlock logic in app/api/academy/courses/route.ts, which still
-- walks order_index within the same requires_pro track.
--
-- Nullable so ungrouped/future courses render without a chapter banner
-- rather than erroring.

alter table academy_courses
  add column if not exists unit_label text;

update academy_courses set unit_label = 'Foundations'
  where slug in (
    'what-is-a-stock', 'reading-a-stock-price', 'reading-charts',
    'reading-a-stock-quote', 'company-fundamentals',
    'portfolio-diversification', 'dividends-income', 'etfs-and-crypto'
  );

update academy_courses set unit_label = 'Valuation & Statements'
  where slug in ('valuation', 'financial-statements');

update academy_courses set unit_label = 'Advanced Strategy'
  where slug in ('portfolio-risk', 'ai-research');

update academy_courses set unit_label = 'Macro Basics'
  where slug = 'macro-basics';

update academy_courses set unit_label = 'Macro Mechanics'
  where slug = 'macro-mechanics';
