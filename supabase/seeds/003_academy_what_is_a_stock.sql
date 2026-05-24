-- BullPen Academy — first course seed: "What is a Stock?"
-- 5 lessons covering the absolute basics of equity ownership.
-- Re-runnable: uses ON CONFLICT DO NOTHING on slug.

INSERT INTO academy_courses (slug, title, description, icon, color, order_index, is_published) VALUES
  (
    'what-is-a-stock',
    'What is a Stock?',
    'Start here. Learn what a stock actually is, who owns one, and how the whole market thing works — in under 10 minutes.',
    'TrendingUp',
    'emerald',
    0,
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;

-- Insert the 5 lessons for the course. We resolve the course_id via subquery so
-- the seed remains portable (no hardcoded UUIDs).

INSERT INTO academy_lessons (course_id, slug, title, type, order_index, xp_reward, content)
SELECT
  (SELECT id FROM academy_courses WHERE slug = 'what-is-a-stock'),
  v.slug, v.title, v.type, v.order_index, v.xp_reward, v.content
FROM (VALUES
  (
    'what-is-a-stock-intro',
    'What is a Stock?',
    'read',
    0,
    10,
    '{
      "sections": [
        {
          "text": "A stock is a tiny slice of ownership in a real company. Buy one share of Apple and you literally own a piece of the company — about one four-billionth of it.",
          "highlightedTerms": [
            { "term": "stock", "definition": "A unit of ownership in a company. Owning stock means you own a piece of that business." },
            { "term": "share", "definition": "One single unit of a stock. A company can have millions or billions of shares outstanding." }
          ]
        },
        {
          "text": "Companies issue stock to raise money. Instead of borrowing from a bank, they sell pieces of themselves to investors. That cash funds growth — new products, new factories, new hires.",
          "highlightedTerms": [
            { "term": "issue", "definition": "When a company creates and sells new shares of stock to raise money." },
            { "term": "IPO", "definition": "Initial Public Offering. The first time a private company sells its stock to the general public." }
          ]
        },
        {
          "text": "In return, you become a shareholder. You get a claim on the company''s future profits and, often, the right to vote on big decisions. The catch: if the company struggles, your slice loses value.",
          "highlightedTerms": [
            { "term": "shareholder", "definition": "Someone who owns at least one share of a company''s stock." },
            { "term": "equity", "definition": "Another word for ownership in a company. Stocks are also called equities." }
          ]
        }
      ],
      "funFact": "The oldest stock exchange in the world is the Amsterdam Stock Exchange, founded in 1602 by the Dutch East India Company."
    }'::jsonb
  ),
  (
    'ownership-quiz',
    'Quick Check: Ownership',
    'quiz',
    1,
    20,
    '{
      "questions": [
        {
          "question": "If you own one share of a company with 1 billion shares outstanding, what fraction of the company do you own?",
          "options": ["1%", "1 / 1,000,000,000", "One vote", "Nothing — shares are just paper"],
          "correctIndex": 1,
          "explanation": "Each share represents exactly 1 / (total shares outstanding) of the company. Tiny, but real ownership."
        },
        {
          "question": "Why do companies sell stock to the public?",
          "options": [
            "To make their CEO famous",
            "To raise money without taking on debt",
            "Because the government requires it",
            "To pay dividends"
          ],
          "correctIndex": 1,
          "explanation": "Selling stock raises cash that the company never has to pay back, unlike a bank loan. In exchange, original owners give up a slice of control and future profits."
        },
        {
          "question": "What does it mean to be a shareholder?",
          "options": [
            "You work for the company",
            "You lent the company money",
            "You own a piece of the company",
            "You guarantee the company''s debts"
          ],
          "correctIndex": 2,
          "explanation": "A shareholder is a part-owner. You share in the upside if the company does well — and the downside if it doesn''t."
        }
      ]
    }'::jsonb
  ),
  (
    'investing-vocabulary',
    'Match the Vocabulary',
    'match',
    2,
    15,
    '{
      "pairs": [
        { "term": "Stock", "definition": "A unit of ownership in a company" },
        { "term": "Shareholder", "definition": "A person who owns at least one share" },
        { "term": "Dividend", "definition": "A cash payment a company sends to its shareholders" },
        { "term": "Market Cap", "definition": "Total value of all of a company''s shares combined" }
      ]
    }'::jsonb
  ),
  (
    'how-markets-work',
    'How Markets Work',
    'read',
    3,
    10,
    '{
      "sections": [
        {
          "text": "A stock exchange is a marketplace where buyers and sellers of shares meet. The two biggest in the US are the NYSE and the Nasdaq. They match orders in milliseconds.",
          "highlightedTerms": [
            { "term": "exchange", "definition": "A regulated marketplace where stocks (and other assets) are bought and sold." },
            { "term": "NYSE", "definition": "New York Stock Exchange. The largest stock exchange in the world by market cap." }
          ]
        },
        {
          "text": "You don''t buy stock directly from a company. You go through a broker — an app like BullPen, Robinhood, or Fidelity — that routes your order to the exchange and reports back when it''s filled.",
          "highlightedTerms": [
            { "term": "broker", "definition": "A licensed intermediary that places stock orders on your behalf with the exchange." },
            { "term": "order", "definition": "An instruction to buy or sell a specific number of shares, often with a price condition attached." }
          ]
        },
        {
          "text": "Prices move every second. The bid is the highest price a buyer is willing to pay. The ask is the lowest price a seller will accept. The difference between them is called the spread.",
          "highlightedTerms": [
            { "term": "bid", "definition": "The highest price a buyer is currently willing to pay for one share." },
            { "term": "ask", "definition": "The lowest price a seller is currently willing to accept for one share." },
            { "term": "spread", "definition": "The gap between the bid and the ask. Tighter spreads mean a more liquid stock." }
          ]
        }
      ],
      "funFact": "Apple stock trades over 50 million shares on an average day — that''s more than 500 every single second."
    }'::jsonb
  ),
  (
    'your-first-trade',
    'Your First Trade Decision',
    'scenario',
    4,
    25,
    '{
      "setup": "You have 1000 kr saved up. Apple just announced a brand new iPhone and the stock jumped 8% in a single day on the news. You''re excited and thinking about buying $AAPL shares right now. What do you do?",
      "choices": [
        {
          "label": "Buy immediately — momentum is on my side and I don''t want to miss out.",
          "feedback": "We get the impulse — but buying right after a big jump is often when stocks are most expensive. The headline is already priced in. Better: figure out if you''d still want to own Apple a year from now, not just today.",
          "isCorrect": false
        },
        {
          "label": "Read more about Apple''s business, its competitors, and whether 1000 kr is money I can leave invested for years.",
          "feedback": "This is the right reflex. Knowing what you own — and why — is the single best edge a beginner has. The 8% move will look tiny in five years if the business keeps growing.",
          "isCorrect": true
        },
        {
          "label": "Wait until the stock drops back to where it was, then buy.",
          "feedback": "Trying to time short-term dips is harder than it looks — pros struggle with it too. Sometimes the stock never drops back. Focus on the long-term story, not the entry price down to the cent.",
          "isCorrect": false
        }
      ]
    }'::jsonb
  )
) AS v(slug, title, type, order_index, xp_reward, content)
ON CONFLICT (course_id, slug) DO NOTHING;
