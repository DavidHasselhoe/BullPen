-- Reposition "Reading a Stock Price" as "Why Stocks Move" to resolve content
-- overlap with "Reading a Stock Quote" (price/change% intro + Market Cap/Volume
-- match-term duplication + duplicate liquidity definition). See
-- docs/superpowers/specs/2026-07-14-academy-curriculum-roadmap-design.md Part 1.
-- Slug is unchanged — preserves existing user progress/completions.

UPDATE academy_courses
SET
  title = 'Why Stocks Move',
  description = 'Prices don''t move randomly. Learn what market cap and the 52-week range tell you — and the real reasons a stock jumps or drops.',
  icon = 'Activity',
  color = 'emerald'
WHERE slug = 'reading-a-stock-price';

-- Lesson 1: trim the duplicate price/change% teaching to a brief recap
-- (kept minimal, not removed, since the course quiz still has a %change
-- calculation question); lead with market cap + 52-week range instead.
UPDATE academy_lessons
SET
  title = 'Market Cap & the 52-Week Range',
  content = '{"funFact":"A 1% move in Apple''s stock price shifts its total market value by roughly $3 billion — in a single day.","sections":[{"text":"Quick refresher: every stock page shows a price and how much it moved since yesterday, both as a dollar change and a percentage change. If a stock closed at $100 yesterday and trades at $108 today, that''s +$8, or +8% — the percentage is what lets you compare a $5 stock and a $500 stock on equal footing.","highlightedTerms":[{"term":"change %","definition":"Today''s price move expressed as a percentage of yesterday''s closing price. The standard way to compare moves across different stocks."}]},{"text":"Market capitalisation — market cap — is simply the share price multiplied by the total number of shares outstanding. A $100 stock with 10 million shares = a $1 billion company. Market cap tells you the company''s size at a glance: mega-cap (Apple, Microsoft) sit above $1 trillion; large-cap above $10 billion; mid-cap $2–10 billion; small-cap below $2 billion.","highlightedTerms":[{"term":"market cap","definition":"Share price × total shares outstanding. The total market value of a company right now."},{"term":"shares outstanding","definition":"The total number of shares currently held by all investors, including insiders and institutions."}]},{"text":"The 52-week high and low show the price range over the past year. A stock near its 52-week high may be on a strong run — or getting expensive. One near its 52-week low might look cheap — or it might be in trouble. Either way, the range gives you context that a single price alone can''t.","highlightedTerms":[{"term":"52-week high/low","definition":"The highest and lowest prices the stock has traded at over the past 52 weeks. A useful reference for context."}]}]}'::jsonb
WHERE slug = 'stock-page-numbers'
  AND course_id = (SELECT id FROM academy_courses WHERE slug = 'reading-a-stock-price');

-- Lesson 4: remove the duplicate "liquidity" glossary-style definition
-- (stays defined exactly once, in reading-a-stock-quote's bid-ask-spread
-- lesson). The word wasn't used in this section's prose, only the
-- highlightedTerms entry — so no text change needed, just drop the entry.
UPDATE academy_lessons
SET
  content = '{"funFact":"When the US Federal Reserve speaks about interest rates, stock prices across the entire market can shift billions of dollars in value within seconds — before most people finish reading the headline.","sections":[{"text":"Stock prices are set by supply and demand — every second the market is open. When more people want to buy a stock than sell it, the price rises. When more people want to sell, it falls. The exchange matches buyers and sellers in real time, which is why prices tick up and down continuously throughout the trading day.","highlightedTerms":[{"term":"supply and demand","definition":"The force behind all prices. More buyers than sellers pushes prices up; more sellers than buyers pushes them down."}]},{"text":"Catalysts are events that suddenly shift that balance. Common ones: earnings reports (did the company beat or miss expectations?), product launches, management changes, economic data like inflation or unemployment, and central bank decisions on interest rates. A single headline can move a stock 10% or more in minutes.","highlightedTerms":[{"term":"catalyst","definition":"An event or announcement that triggers a significant, fast price move."},{"term":"earnings report","definition":"A quarterly update where a company reveals its revenue, profit, and outlook for the next quarter."}]},{"text":"Here''s the subtlest idea in investing: markets price in expectations, not just facts. A company can report record profits and still see its stock fall — if investors expected even better results. The price already reflected the optimism. When reality merely matches expectations, there''s no new reason to buy — and often a reason to sell.","highlightedTerms":[{"term":"priced in","definition":"When a widely-expected event is already reflected in the stock price before it officially happens."},{"term":"guidance","definition":"Management''s forecast for future revenue and profit. Often moves a stock more than the current quarter''s actual results."}]}]}'::jsonb
WHERE slug = 'why-prices-move'
  AND course_id = (SELECT id FROM academy_courses WHERE slug = 'reading-a-stock-price');

-- Match lesson: drop the "Volume" pair (duplicate of reading-a-stock-quote's
-- quote-vocab-match). 3 pairs remain — match lessons don't require exactly 4.
UPDATE academy_lessons
SET
  content = '{"pairs":[{"term":"Market Cap","definition":"Price × total shares outstanding"},{"term":"52-week High","definition":"Highest price in the past year"},{"term":"Change %","definition":"Today''s move vs yesterday''s close"}]}'::jsonb
WHERE slug = 'price-metrics-match'
  AND course_id = (SELECT id FROM academy_courses WHERE slug = 'reading-a-stock-price');
