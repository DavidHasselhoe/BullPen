-- BullPen Academy — hand-authored demo lesson for "macro-mechanics"
-- Adds the deferred Market Mood tour as lesson 7, per
-- docs/superpowers/plans/2026-08-05-market-mood-demo-lesson.md.
--
-- Swapped the originally-planned Market Volatility (VIX) step for S&P 500
-- Momentum: live-checked the real page mid-build and it was showing "3 of 4"
-- signals with Market Volatility the one missing — matches an already-known
-- issue elsewhere in this codebase (discover-config.ts: "plain VIX does not
-- resolve on our TwelveData plan"). S&P 500 Momentum is pushed unconditionally
-- by app/api/market/mood/route.ts (falls back to a neutral score of 50 rather
-- than being omitted), so it's the reliable choice for a tour step.

-- Bump the existing closing scenario lesson to make room for the demo at order_index 5.
UPDATE academy_lessons
SET order_index = 6
WHERE course_id = (SELECT id FROM academy_courses WHERE slug = 'macro-mechanics')
  AND slug = 'rate-hike-portfolio-call';

-- Insert the Market Mood demo lesson at order_index 5.
INSERT INTO academy_lessons (course_id, slug, title, type, order_index, xp_reward, content)
VALUES (
  (SELECT id FROM academy_courses WHERE slug = 'macro-mechanics'),
  'market-mood-demo',
  'Market Mood: See the Signals Live',
  'demo',
  5,
  25,
  '{"surface":"market-mood","steps":[{"id":"mood-intro","target":"none","title":"Reading the Market''s Mood","body":"Everything from this course, rates, the yield curve, credit spreads, oil, feeds into how investors actually feel right now. This tour opens BullPen''s real Market Mood tool: a live Fear and Greed score built from several market signals that update throughout the day.","requiredAction":"none"},{"id":"mood-hero-step","target":"mood-hero","title":"The composite score","body":"This number blends the signals into one read. 0 is extreme fear, 100 is extreme greed. Watch how it shifts as the market''s mood changes throughout the day.","requiredAction":"none"},{"id":"mood-momentum-step","target":"mood-signal-s-p-500-momentum","title":"S&P 500 Momentum","body":"This tracks whether the S&P 500 is trading above or below its 125-day average, a simple read on whether the broader trend is up or down. A strong uptrend often means investors are comfortable taking risk, exactly the backdrop where growth stocks can run hardest, and where they have the furthest to fall if the trend reverses.","requiredAction":"none"},{"id":"mood-credit-step","target":"mood-signal-junk-bond-demand","title":"Junk Bond Demand: a live Credit Spread","body":"This is the Credit Spread concept from earlier in this course, made real. When investors chase riskier, higher-yield bonds over safer ones, it signals risk appetite. When they retreat to safer bonds, it signals caution.","requiredAction":"none"},{"id":"mood-safehaven-step","target":"mood-signal-safe-haven-demand","title":"Safe Haven Demand: flight to safety","body":"When stocks outperform Treasury bonds, investors are favoring risk. When bonds start outperforming stocks, money is often fleeing to safety, exactly the kind of signal that can accompany a yield curve inversion.","requiredAction":"none"}]}'::jsonb
)
ON CONFLICT (course_id, slug) DO NOTHING;
