-- BullPen Academy — "Demo mode" lessons.
-- Allows the new 'demo' lesson type, then appends one interactive demo lesson to
-- each of three existing beginner courses: company fundamentals (real NVDA
-- statistics grid), portfolio diversification (a static example 3-stock
-- portfolio), and dividends & passive income (the real dividend calculator
-- preloaded with example dividend stocks). Each demo opens a real app surface
-- fullscreen with a guided spotlight tour.
--
-- order_index is computed dynamically per course (next after the current max)
-- so this is resilient to any drift between the repo seeds and the live DB.

ALTER TABLE academy_lessons DROP CONSTRAINT IF EXISTS academy_lessons_type_check;
ALTER TABLE academy_lessons ADD CONSTRAINT academy_lessons_type_check
  CHECK (type IN ('read', 'quiz', 'match', 'scenario', 'chart-tour', 'demo'));

-- ── Company fundamentals → NVDA statistics demo ──────────────────────────────
INSERT INTO academy_lessons (course_id, slug, title, type, order_index, xp_reward, content)
SELECT
  c.id,
  'fundamentals-demo',
  'See It Live: A Real Fundamentals Page',
  'demo',
  (SELECT COALESCE(MAX(order_index), -1) + 1 FROM academy_lessons WHERE course_id = c.id),
  25,
  $$
  {
    "surface": "stock-stats",
    "ticker": "NVDA",
    "steps": [
      {
        "id": "intro",
        "target": "company-header",
        "title": "This is the real thing",
        "body": "Everything you just learned about fundamentals? BullPen shows it for every company. This is NVIDIA's actual statistics page — the same one you'll use to size up any stock.",
        "requiredAction": "none"
      },
      {
        "id": "market-cap",
        "target": "stat-market-cap",
        "title": "Market cap: the company's size",
        "body": "Market capitalization is the total value of all a company's shares — share price times shares outstanding. It's the quickest way to gauge how big a company is. NVIDIA is one of the largest in the world.",
        "requiredAction": "none"
      },
      {
        "id": "pe",
        "target": "stat-p-e-ttm",
        "title": "P/E: what you pay per dollar of earnings",
        "body": "The price-to-earnings ratio compares the share price to the company's profits. A higher P/E means investors are paying more for each dollar the company earns — often because they expect strong future growth.",
        "requiredAction": "none"
      },
      {
        "id": "profit-margin",
        "target": "stat-profit-margin",
        "title": "Profit margin: how much it keeps",
        "body": "Profit margin is the share of revenue left over as profit after all costs. A high margin means the business keeps a lot of every dollar it brings in — a sign of a strong, efficient company.",
        "requiredAction": "none"
      },
      {
        "id": "dividend-yield",
        "target": "stat-dividend-yield",
        "title": "Dividend yield: cash paid back to you",
        "body": "Dividend yield is the annual dividend as a percentage of the share price. Some companies pay a big slice back to shareholders; fast-growing ones like NVIDIA often reinvest instead, so the yield is small.",
        "requiredAction": "none"
      },
      {
        "id": "wrap",
        "target": "none",
        "title": "You can read any company now",
        "body": "That's the core of fundamental analysis — size, valuation, profitability, and payout, all on one page. Every stock in BullPen has this exact view. Try opening one you're curious about.",
        "requiredAction": "none"
      }
    ]
  }
  $$::jsonb
FROM academy_courses c
WHERE c.slug = 'company-fundamentals'
ON CONFLICT (course_id, slug) DO NOTHING;

-- ── Portfolio diversification → example-portfolio demo ───────────────────────
INSERT INTO academy_lessons (course_id, slug, title, type, order_index, xp_reward, content)
SELECT
  c.id,
  'portfolio-demo',
  'See It Live: A Diversified Portfolio',
  'demo',
  (SELECT COALESCE(MAX(order_index), -1) + 1 FROM academy_lessons WHERE course_id = c.id),
  25,
  $$
  {
    "surface": "demo-portfolio",
    "fixtureId": "starter-three-stock",
    "steps": [
      {
        "id": "intro",
        "target": "none",
        "title": "Let's look at a real portfolio",
        "body": "This is a sample portfolio — not yours — built from three companies in three different sectors. It's here so you can see diversification and position sizing on something concrete.",
        "requiredAction": "none"
      },
      {
        "id": "overview",
        "target": "portfolio-overview",
        "title": "The big picture",
        "body": "At the top, BullPen totals up what the whole portfolio is worth, how it moved today, and the overall gain or loss. This is how you track a collection of stocks as a single thing, not one by one.",
        "requiredAction": "none"
      },
      {
        "id": "allocation",
        "target": "allocation-chart",
        "title": "Diversification, visualized",
        "body": "This breakdown shows how the money is split across sectors — technology, healthcare, and energy here. Spreading across sectors means one bad industry won't sink your whole portfolio. That's diversification in one picture.",
        "requiredAction": "none"
      },
      {
        "id": "sizing",
        "target": "largest-position",
        "title": "Position sizing matters",
        "body": "Notice the positions aren't equal — one is much bigger than the others. How much of your money any single stock represents is called position sizing, and it decides how much that one stock can help or hurt you.",
        "requiredAction": "none"
      },
      {
        "id": "wrap",
        "target": "none",
        "title": "That's a balanced starting point",
        "body": "A few quality companies, spread across sectors, in sensible sizes — that's the foundation of a resilient portfolio. When you add your own holdings, BullPen builds this exact view for you.",
        "requiredAction": "none"
      }
    ]
  }
  $$::jsonb
FROM academy_courses c
WHERE c.slug = 'portfolio-diversification'
ON CONFLICT (course_id, slug) DO NOTHING;

-- ── Dividends & income → dividend-calculator demo ────────────────────────────
INSERT INTO academy_lessons (course_id, slug, title, type, order_index, xp_reward, content)
SELECT
  c.id,
  'dividends-demo',
  'See It Live: Project Your Passive Income',
  'demo',
  (SELECT COALESCE(MAX(order_index), -1) + 1 FROM academy_lessons WHERE course_id = c.id),
  25,
  $$
  {
    "surface": "dividend-calculator",
    "years": 10,
    "holdings": [
      { "ticker": "SCHD", "name": "Schwab US Dividend ETF", "mode": "amount", "value": "10,000" },
      { "ticker": "KO", "name": "Coca-Cola", "mode": "amount", "value": "5,000" },
      { "ticker": "O", "name": "Realty Income", "mode": "amount", "value": "5,000" }
    ],
    "steps": [
      {
        "id": "intro",
        "target": "dividend-holdings",
        "title": "A real dividend portfolio",
        "body": "This is BullPen's actual dividend calculator, preloaded with three classic dividend payers and how much is invested in each. These are the same tools real investors use to plan passive income.",
        "requiredAction": "none"
      },
      {
        "id": "settings",
        "target": "dividend-settings",
        "title": "Time and reinvestment",
        "body": "Two things supercharge dividends: time, and reinvesting them. Leaving 'Reinvest dividends' on means each payout buys more shares, which pay more dividends — compounding. The projection period sets how far ahead to look.",
        "requiredAction": "none"
      },
      {
        "id": "calculate",
        "target": "dividend-calculate",
        "title": "Try it: run the numbers",
        "body": "Click Calculate dividends to project what this portfolio would pay out — using each stock's real dividend history.",
        "requiredAction": "run-calculation"
      },
      {
        "id": "results",
        "target": "dividend-results",
        "title": "Your passive income, projected",
        "body": "Here's the payoff: estimated annual income, how it grows as dividends reinvest, and when the income adds up to your original investment. This is what 'passive income' actually looks like on paper.",
        "requiredAction": "none"
      },
      {
        "id": "wrap",
        "target": "none",
        "title": "Now build your own",
        "body": "Swap in any dividend stocks you like, change the amounts, and watch the projection update. Dividends won't make you rich overnight — but reinvested patiently, they compound into real income.",
        "requiredAction": "none"
      }
    ]
  }
  $$::jsonb
FROM academy_courses c
WHERE c.slug = 'dividends-income'
ON CONFLICT (course_id, slug) DO NOTHING;
