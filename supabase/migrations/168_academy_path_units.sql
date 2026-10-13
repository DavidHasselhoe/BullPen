-- Academy path: five units in teaching order, instead of creation order.
--
-- order_index had grown by append: every new course went to the end, so the
-- path read Foundations (free, beginner) -> Valuation (Pro) -> Advanced
-- Strategy (Pro, advanced) -> Macro Basics (free, beginner) -> ... with six
-- single-course chapters. A free learner scrolled past locked advanced
-- chapters to reach more beginner material.
--
-- Now: one continuous free run (Foundations, then Money & Mindset), then Pro
-- from intermediate to advanced. Chapters are runs of unit_label and unlocks
-- chain within a chapter (lib/academy/unlock.ts); a course with any progress
-- is never order-locked, so nobody loses access to what they started.

WITH path(slug, ord, unit) AS (VALUES
  ('what-is-a-stock',                 0, 'Foundations'),
  ('reading-a-stock-price',           1, 'Foundations'),
  ('reading-a-stock-quote',           2, 'Foundations'),
  ('reading-charts',                  3, 'Foundations'),
  ('company-fundamentals',            4, 'Foundations'),
  ('portfolio-diversification',       5, 'Foundations'),
  ('dividends-income',                6, 'Foundations'),
  ('etfs-and-crypto',                 7, 'Foundations'),
  ('investing-psychology',            8, 'Money & Mindset'),
  ('taxes-on-investing',              9, 'Money & Mindset'),
  ('tax-advantaged-accounts',        10, 'Money & Mindset'),
  ('bonds-fixed-income',             11, 'Money & Mindset'),
  ('macro-basics',                   12, 'Money & Mindset'),
  ('valuation',                      13, 'Research a Company'),
  ('financial-statements',           14, 'Research a Company'),
  ('earnings-reports-calls',         15, 'Research a Company'),
  ('research-routine-watchlist',     16, 'Research a Company'),
  ('dividend-investing-deep-dive',   17, 'Strategies'),
  ('technical-analysis-basics',      18, 'Strategies'),
  ('portfolio-risk',                 19, 'Advanced'),
  ('macro-mechanics',                20, 'Advanced'),
  ('international-crypto-deep-dive', 21, 'Advanced'),
  ('options-basics',                 22, 'Advanced'),
  ('ai-research',                    23, 'Advanced')
)
UPDATE academy_courses c SET order_index = p.ord, unit_label = p.unit
FROM path p WHERE c.slug = p.slug;
