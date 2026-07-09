-- BullPen Academy — "Reading Charts" course: interactive chart-tour lessons.
-- Allows the new 'chart-tour' lesson type, then seeds one beginner course with
-- 3 chart-tour lessons (candlestick anatomy, chart types/timeframes, SMA
-- trend-following), each driven by the live AdvancedChartModal on AAPL.

ALTER TABLE academy_lessons DROP CONSTRAINT IF EXISTS academy_lessons_type_check;
ALTER TABLE academy_lessons ADD CONSTRAINT academy_lessons_type_check
  CHECK (type IN ('read', 'quiz', 'match', 'scenario', 'chart-tour'));

INSERT INTO academy_courses (slug, title, description, icon, color, order_index, difficulty, is_published) VALUES
  (
    'reading-charts',
    'Reading Charts',
    'Learn to read a real candlestick chart and use your first indicator — hands-on, on a live AAPL chart.',
    'CandlestickChart',
    'blue',
    2,
    'beginner',
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO academy_lessons (course_id, slug, title, type, order_index, xp_reward, content)
SELECT
  (SELECT id FROM academy_courses WHERE slug = 'reading-charts'),
  v.slug, v.title, v.type, v.order_index, v.xp_reward, v.content
FROM (VALUES
  (
    'candlestick-anatomy',
    'Candlestick Anatomy',
    'chart-tour',
    0,
    15,
    $$
    {
      "ticker": "AAPL",
      "initialRange": "1M",
      "initialChartType": "candles",
      "steps": [
        {
          "id": "intro",
          "target": "none",
          "title": "Every candle tells a story",
          "body": "This is AAPL's real price chart, live. Each shape you see is called a candlestick, and it packs four numbers into one glance: the open, high, low, and close for that period. Let's break one down.",
          "requiredAction": "none"
        },
        {
          "id": "body-wick",
          "target": "candle-area",
          "title": "Body and wick",
          "body": "The thick block is the body — it spans from the open price to the close price. The thin lines above and below are wicks (or shadows) — they show the highest and lowest price reached during that period, even if the price didn't close there.",
          "requiredAction": "none"
        },
        {
          "id": "color",
          "target": "candle-area",
          "title": "Green vs red",
          "body": "A green candle means the close was higher than the open — price rose over that period. A red candle means the close was lower than the open — price fell. Look at AAPL's recent candles: can you spot the story they're telling?",
          "requiredAction": "none"
        },
        {
          "id": "sequence",
          "target": "candle-area",
          "title": "Reading a sequence",
          "body": "One candle shows a single period. A row of candles shows a trend. A string of green candles climbing higher suggests buyers are in control; a string of red candles suggests sellers are. Nothing here predicts the future — but it tells you exactly what already happened.",
          "requiredAction": "none"
        },
        {
          "id": "wrap",
          "target": "none",
          "title": "You can read a candle now",
          "body": "That's it — open, high, low, close, and what color means. Every chart in BullPen uses these same candles. Next lesson: chart types and timeframes.",
          "requiredAction": "none"
        }
      ]
    }
    $$::jsonb
  ),
  (
    'chart-types-and-timeframes',
    'Chart Types & Timeframes',
    'chart-tour',
    1,
    20,
    $$
    {
      "ticker": "AAPL",
      "initialRange": "1M",
      "initialChartType": "candles",
      "steps": [
        {
          "id": "intro",
          "target": "none",
          "title": "Same data, different views",
          "body": "Candlesticks aren't the only way to view a chart. Line and area charts strip away the open/high/low and just connect the closing prices — cleaner, but less detailed. Let's try switching.",
          "requiredAction": "none"
        },
        {
          "id": "switch-type",
          "target": "chart-type-toggle",
          "title": "Try it: switch the chart type",
          "body": "Click Line or Area in the toolbar above to see AAPL's price with the candle detail removed.",
          "requiredAction": "switch-chart-type"
        },
        {
          "id": "after-switch",
          "target": "none",
          "title": "Notice the difference",
          "body": "Line and area charts are great for spotting the overall trend at a glance — that's why you'll often see them in news headlines. Candles are better when you need to see volatility within each period. Both show the exact same underlying data.",
          "requiredAction": "none"
        },
        {
          "id": "timeframe-intro",
          "target": "none",
          "title": "Zooming out: timeframes",
          "body": "The range buttons control how far back the chart looks — from a single day (1D) up to the entire history (ALL). A short timeframe shows every small wiggle; a long timeframe smooths those out and reveals the bigger trend.",
          "requiredAction": "none"
        },
        {
          "id": "switch-range",
          "target": "range-selector",
          "title": "Try it: change the timeframe",
          "body": "Click a different range in the toolbar — try 1Y or 5Y — and watch how AAPL's story looks different zoomed out.",
          "requiredAction": "change-range"
        },
        {
          "id": "wrap",
          "target": "none",
          "title": "Same stock, different lenses",
          "body": "Chart type and timeframe are just lenses — neither is 'correct.' Traders switch between them depending on whether they're checking a quick trend or planning a longer hold. Next up: your first indicator.",
          "requiredAction": "none"
        }
      ]
    }
    $$::jsonb
  ),
  (
    'trend-following-with-sma',
    'Trend-Following with SMA',
    'chart-tour',
    2,
    20,
    $$
    {
      "ticker": "AAPL",
      "initialRange": "6M",
      "initialChartType": "candles",
      "steps": [
        {
          "id": "intro",
          "target": "none",
          "title": "Smoothing out the noise",
          "body": "Price moves up and down constantly, which makes the overall trend hard to see at a glance. A moving average solves this by plotting the average closing price over a set number of periods, smoothing the noise into one clean line.",
          "requiredAction": "none"
        },
        {
          "id": "what-is-sma",
          "target": "none",
          "title": "Meet the SMA",
          "body": "The Simple Moving Average (SMA) is the most common one. An SMA(50) averages the last 50 closes; an SMA(200) averages the last 200. Shorter SMAs hug the price closely; longer SMAs move slower and show the bigger trend.",
          "requiredAction": "none"
        },
        {
          "id": "add-sma",
          "target": "add-indicator-button",
          "title": "Try it: add an SMA",
          "body": "Click Indicators in the toolbar above, then add an SMA to AAPL's chart to continue.",
          "requiredAction": "add-sma-indicator"
        },
        {
          "id": "interpret",
          "target": "none",
          "title": "Reading the line you added",
          "body": "When price stays above the SMA line, it's a sign of an uptrend — buyers have the upper hand. When price drops below it, that's often read as a warning sign. Traders also watch for the price line crossing the SMA as a potential turning point.",
          "requiredAction": "none"
        },
        {
          "id": "wrap",
          "target": "none",
          "title": "You've got the basics",
          "body": "Candlestick anatomy, chart types and timeframes, and your first indicator — that's the foundation for reading almost any chart. From here, exploring RSI, MACD, or Bollinger Bands will feel a lot more familiar.",
          "requiredAction": "none"
        }
      ]
    }
    $$::jsonb
  )
) AS v(slug, title, type, order_index, xp_reward, content)
ON CONFLICT (course_id, slug) DO NOTHING;
