// lib/academy/academy-roadmap.ts
//
// The planned next 10 weeks of Academy courses. app/api/cron/generate-academy-course
// works through this list in order, one course per run, finding the first
// entry whose slug doesn't exist in academy_courses yet. Editing next
// month's plan is a normal code change to this array — a real, reviewable
// diff — not a database/admin-UI feature.
//
// Content notes (see the 2026-08-18 planning conversation for full context):
//  - Courses 1-2 teach tax/retirement-account CONCEPTS, not any one
//    country's named programs — no 401(k)/Roth IRA as the headline example.
//  - Course 5 replaces an earlier "Position Sizing" draft, which was cut
//    after checking the live catalog: portfolio-diversification already has
//    a "Position Sizing & Risk" lesson and portfolio-risk already has
//    "Concentration & Position Sizing" — a third pass would repeat, not add.
//  - Courses 8, 9, 10 deliberately build BEYOND existing beginner lessons
//    (payout ratio, SMA trend-following, crypto basics) rather than
//    re-teaching them — see each course's comment below.
//  - order_index continues from 13 (macro-mechanics, the current highest
//    live course) starting at 14.

import type { CourseOutline } from './course-outline-types';

export const ACADEMY_ROADMAP: CourseOutline[] = [
  // ─── Money Matters (free, beginner) ──────────────────────────────────────
  {
    slug: 'taxes-on-investing',
    title: 'Taxes on Investing',
    description: 'How investment gains actually get taxed, why holding period can matter, and what tax-loss harvesting means, no matter which country you invest from.',
    icon: 'Receipt',
    color: 'emerald',
    orderIndex: 14,
    difficulty: 'beginner',
    unitLabel: 'Money Matters',
    lessons: [
      { slug: 'how-gains-get-taxed', title: 'How Investment Gains Get Taxed', type: 'read', topic: 'The general concept that most countries tax investment gains differently from ordinary income (often called capital gains treatment), and that WHEN you sell (realize the gain) is what usually triggers tax, not just paper gains. Keep this at the concept level, no specific country\'s rates or thresholds.', xpReward: 10 },
      { slug: 'why-holding-period-matters', title: 'Why Holding Period Can Matter', type: 'read', topic: 'Many countries give more favorable tax treatment to investments held longer before selling (often called long-term vs short-term treatment). Explain this as a broadly common pattern to check for, using no specific numbers or one country\'s rules as the example.', xpReward: 10 },
      { slug: 'taxes-quiz', title: 'Quick Check: Taxes', type: 'quiz', topic: 'Test understanding of realized vs unrealized gains and why holding period is often relevant, from the previous two lessons. 3 questions.', xpReward: 20 },
      { slug: 'tax-terms-match', title: 'Match the Tax Terms', type: 'match', topic: 'Match universal tax vocabulary (Capital Gain, Capital Loss, Realized Gain, Unrealized Gain, Cost Basis, Tax-Loss Harvesting) to plain-English definitions, none tied to a specific country\'s tax code.', xpReward: 15 },
      { slug: 'sell-now-or-wait', title: 'Sell Now or Wait?', type: 'scenario', topic: 'An investor is deciding whether to sell a losing position before their tax year ends. Reward reasoning about tax-loss harvesting as a general strategy while the feedback explicitly reinforces checking your own country\'s specific tax rules before acting, not presenting one system as universal.', xpReward: 25 },
    ],
  },
  {
    slug: 'tax-advantaged-accounts',
    title: 'Understanding Tax-Advantaged Accounts',
    description: 'Nearly every country has some version of a tax-advantaged investment account. Learn the pattern so you can recognize and use yours.',
    icon: 'PiggyBank',
    color: 'emerald',
    orderIndex: 15,
    difficulty: 'beginner',
    unitLabel: 'Money Matters',
    lessons: [
      { slug: 'what-makes-it-tax-advantaged', title: 'What Makes an Account Tax-Advantaged', type: 'read', topic: 'The two common mechanisms across countries: contributions reduce taxable income now but withdrawals are taxed later, OR contributions are after-tax but growth/withdrawals are tax-free. Also explain employer matching (where it exists) as "free money." Do not center this on one country\'s named program.', xpReward: 10 },
      { slug: 'finding-your-countrys-version', title: 'Finding Your Country\'s Version', type: 'read', topic: 'A brief, evenhanded world tour purely as pattern-recognition: US 401(k)/IRA, UK ISA/SIPP, Canada RRSP/TFSA, Australia Superannuation. Frame explicitly as "here is what to search for in your own country," not a deep dive into any single one, and note many other countries have their own equivalents not listed here.', xpReward: 10 },
      { slug: 'tax-advantaged-quiz', title: 'Quick Check: Tax-Advantaged Accounts', type: 'quiz', topic: 'Test understanding of the two general mechanisms (tax-deferred vs tax-free growth) and why starting early matters for compounding inside these accounts. 3 questions.', xpReward: 20 },
      { slug: 'account-concepts-match', title: 'Match the Account Concepts', type: 'match', topic: 'Match general concepts (Tax-Deferred, Tax-Free Growth, Employer Match, Contribution Limit) to plain-English meanings, framed generically rather than tied to one country\'s named accounts.', xpReward: 15 },
      { slug: 'where-should-the-contribution-go', title: 'Where Should the Next Contribution Go?', type: 'scenario', topic: 'An investor is deciding between a normal brokerage account and their country\'s tax-advantaged account (referred to generically) for a long-term goal. Reward reasoning about the tradeoff between tax benefit and flexibility/access, in general terms.', xpReward: 25 },
    ],
  },
  {
    slug: 'bonds-fixed-income',
    title: 'Bonds & Fixed Income Basics',
    description: 'What a bond actually is, how yield and price relate, and why bonds can balance a stock-heavy portfolio.',
    icon: 'Landmark',
    color: 'emerald',
    orderIndex: 16,
    difficulty: 'beginner',
    unitLabel: 'Money Matters',
    lessons: [
      { slug: 'what-is-a-bond', title: 'What is a Bond?', type: 'read', topic: 'A bond as a loan an investor makes to a government or company in exchange for regular interest payments and return of principal at maturity. Contrast with owning a stock: lending vs ownership.', xpReward: 10 },
      { slug: 'yield-price-and-rates', title: 'Yield, Price & Interest Rates', type: 'read', topic: 'The inverse relationship between bond prices and interest rates in plain English, and why a bond\'s yield is not the same as its stated interest rate once its price changes. No formulas.', xpReward: 10 },
      { slug: 'bonds-quiz', title: 'Quick Check: Bonds', type: 'quiz', topic: 'Test understanding of what a bond is and the price/yield/interest-rate relationship. 3 questions.', xpReward: 20 },
      { slug: 'bond-terms-match', title: 'Match the Bond Terms', type: 'match', topic: 'Match bond vocabulary (Bond, Yield, Maturity, Coupon, Principal, Credit Rating) to plain-English definitions.', xpReward: 15 },
      { slug: 'balancing-stocks-and-bonds', title: 'Balancing Stocks and Bonds', type: 'scenario', topic: 'An investor with an all-stock portfolio is deciding whether adding bonds would help smooth out returns ahead of a goal a few years away. Reward reasoning about bonds\' role as a diversifier/stabilizer, not framing bonds as universally better or worse than stocks.', xpReward: 25 },
    ],
  },

  // ─── Investor Mindset (free, beginner) ───────────────────────────────────
  {
    slug: 'investing-psychology',
    title: 'Behavioral Finance: Investing Psychology',
    description: 'Why your brain works against you as an investor, and how to recognize the biases that lead to costly decisions.',
    icon: 'Brain',
    color: 'emerald',
    orderIndex: 17,
    difficulty: 'beginner',
    unitLabel: 'Investor Mindset',
    lessons: [
      { slug: 'why-your-brain-fights-you', title: 'Why Your Brain Fights You', type: 'read', topic: 'Loss aversion: losses feel worse than equivalent gains feel good, and why this leads investors to sell winners too early and hold losers too long.', xpReward: 10 },
      { slug: 'fomo-herding-recency-bias', title: 'FOMO, Herding & Recency Bias', type: 'read', topic: 'Why investors chase what has already gone up (recency bias) and follow the crowd (herd behavior/FOMO), and why "everyone is buying it" is not itself a reason to buy.', xpReward: 10 },
      { slug: 'psychology-quiz', title: 'Quick Check: Investing Psychology', type: 'quiz', topic: 'Test understanding of loss aversion, recency bias, and herd behavior from the previous two lessons. 3 questions.', xpReward: 20 },
      { slug: 'biases-match', title: 'Match the Biases', type: 'match', topic: 'Match behavioral finance terms (Loss Aversion, FOMO, Recency Bias, Herd Behavior, Confirmation Bias, Overconfidence) to real investor behaviors that illustrate each.', xpReward: 15 },
      { slug: 'everyone-is-talking-about-it', title: 'Everyone\'s Talking About It', type: 'scenario', topic: 'A stock the investor owns is up 40% in a week and social media is buzzing about it going higher. Reward recognizing the emotional pull (FOMO/herd behavior) and reasoning through the decision calmly rather than reactively.', xpReward: 25 },
    ],
  },

  // ─── Company Research (Pro, intermediate) ────────────────────────────────
  {
    slug: 'research-routine-watchlist',
    title: 'Building a Research Routine & Watchlist Strategy',
    description: 'A repeatable process for researching a company before you buy, and how to use a watchlist as a research tool, not just a wishlist.',
    icon: 'ListChecks',
    color: 'blue',
    orderIndex: 18,
    difficulty: 'intermediate',
    requiresPro: true,
    unitLabel: 'Company Research',
    lessons: [
      { slug: 'watchlist-vs-impulse', title: 'Why a Watchlist Beats Impulse Buying', type: 'read', topic: 'The difference between researching a company BEFORE you are emotionally invested vs after you already own it. A watchlist as a research staging area, not just a wishlist.', xpReward: 10 },
      { slug: 'what-to-check-before-buying', title: 'What to Check Before You Buy', type: 'read', topic: 'A repeatable pre-purchase checklist: valuation context, recent news/earnings, and how the new position\'s sector exposure compares to what you already hold. Reference position sizing and diversification as concepts already covered elsewhere without re-explaining their mechanics in depth.', xpReward: 10 },
      { slug: 'alerts-as-research-tool', title: 'Alerts as a Research Tool', type: 'read', topic: 'Using price alerts and earnings alerts not just as fear-of-missing-a-drop tools, but as reminders to revisit your original thesis when something meaningfully changes.', xpReward: 10 },
      { slug: 'research-routine-quiz', title: 'Quick Check: Research Routine', type: 'quiz', topic: 'Test understanding of the pre-purchase checklist and how alerts fit into ongoing research. 3 questions.', xpReward: 20 },
      { slug: 'watchlist-or-buy-now', title: 'Add It to the Watchlist, or Buy Now?', type: 'scenario', topic: 'An investor discovers an interesting company through a friend\'s tip and feels the urge to buy immediately. Reward choosing to add it to a watchlist and run it through the research checklist first.', xpReward: 25 },
    ],
  },
  {
    slug: 'earnings-reports-calls',
    title: 'Reading Earnings Reports & Calls',
    description: 'What is actually inside a quarterly earnings report, why a "good" report can still tank a stock, and why you do not need to dig through the filing yourself.',
    icon: 'FileText',
    color: 'blue',
    orderIndex: 19,
    difficulty: 'intermediate',
    requiresPro: true,
    unitLabel: 'Company Research',
    lessons: [
      // NOTE: EPS itself is already covered in company-fundamentals ("EPS &
      // the P/E Ratio") — this lesson is about report STRUCTURE (results vs
      // guidance vs management commentary) and the regulatory-filing context
      // behind it, not re-explaining what EPS is.
      { slug: 'whats-in-an-earnings-report', title: 'What\'s Actually in an Earnings Report', type: 'read', topic: 'The structure of a quarterly earnings report: results (what happened) vs guidance (what is expected next) vs management commentary. Mention that public companies are legally required to publish these on a regular schedule with their market\'s regulator (SEC filings as the US example), and note other countries have their own equivalent regulators, without going deep into filing types.', xpReward: 10 },
      { slug: 'we-already-read-it-for-you', title: 'You Don\'t Have to Read the Filing Yourself', type: 'read', topic: 'The product-education payoff: reading a raw regulatory filing is a real struggle even for experienced investors. BullPen already parses these filings and surfaces the key fundamentals and Why Today explanations directly on the stock page, so the investor gets the insight without wading through a filing themselves. Point them to check a stock\'s page next time a company they hold reports earnings.', xpReward: 10 },
      { slug: 'good-report-bad-reaction', title: 'Why a "Good" Report Can Still Tank the Stock', type: 'read', topic: 'The gap between results (backward-looking) and guidance (forward-looking), and why the market reacts more strongly to guidance than to the quarter that already happened.', xpReward: 10 },
      { slug: 'earnings-reports-quiz', title: 'Quick Check: Earnings Reports', type: 'quiz', topic: 'Test understanding of results vs guidance, and why a beat can still cause a stock to fall. 3 questions.', xpReward: 20 },
      { slug: 'beat-but-dropped', title: 'The Report Beat, But the Stock Dropped', type: 'scenario', topic: 'A company beats EPS estimates but the stock falls 8% the next day. Reward correctly identifying soft guidance as the likely explanation rather than concluding "the market is irrational."', xpReward: 25 },
    ],
  },

  // ─── Advanced Instruments (Pro, advanced) ────────────────────────────────
  {
    slug: 'options-basics',
    title: 'Options Basics: Calls & Puts',
    description: 'What options actually are, why their risk is asymmetric, and how a covered call works, taught as education, not a trading pitch.',
    icon: 'GitBranch',
    color: 'amber',
    orderIndex: 20,
    difficulty: 'advanced',
    requiresPro: true,
    unitLabel: 'Advanced Instruments',
    lessons: [
      { slug: 'what-options-are', title: 'What Options Actually Are', type: 'read', topic: 'An option as a contract giving the RIGHT, not the obligation, to buy (call) or sell (put) a stock at a set price by a set date. Plain-English framing, define the term before using it.', xpReward: 10 },
      { slug: 'asymmetric-risk', title: 'Why Options Risk Is Asymmetric', type: 'read', topic: 'Buying an option risks only the premium paid but can expire worthless, while selling (writing) an option can carry much larger risk. Explicitly frame this course as education about how options work, not encouragement to trade them.', xpReward: 10 },
      { slug: 'covered-call-example', title: 'A Covered Call in Plain English', type: 'read', topic: 'The most common beginner-safe options strategy, selling a call against shares you already own, as a concrete worked example of how the pieces (premium, strike, expiration) fit together.', xpReward: 10 },
      { slug: 'options-basics-quiz', title: 'Quick Check: Options Basics', type: 'quiz', topic: 'Test understanding of calls vs puts, premium, and asymmetric risk. 3 questions.', xpReward: 20 },
      { slug: 'options-terms-match', title: 'Match the Options Terms', type: 'match', topic: 'Match vocabulary (Call, Put, Strike Price, Premium, Expiration, In the Money) to plain-English definitions.', xpReward: 15 },
      { slug: 'too-good-to-be-true-options', title: 'Is This Options Trade as Safe as It Sounds?', type: 'scenario', topic: 'An investor is offered an options strategy online described as "can\'t lose." Reward correctly identifying the hidden risk being glossed over.', xpReward: 25 },
    ],
  },

  // ─── Income Investing (Pro, intermediate) ────────────────────────────────
  {
    slug: 'dividend-investing-deep-dive',
    title: 'Dividend Investing Deep Dive',
    description: 'Beyond payout ratio: dividend growth investing, reinvestment strategy, and building an income portfolio that survives a dividend cut.',
    icon: 'TrendingUp',
    color: 'emerald',
    orderIndex: 21,
    difficulty: 'intermediate',
    requiresPro: true,
    unitLabel: 'Income Investing',
    lessons: [
      // NOTE: dividends-income (free, beginner) already covers what a
      // dividend is and payout ratio & sustainability — these lessons build
      // beyond that, not re-teach it.
      { slug: 'growth-vs-high-yield', title: 'Dividend Growth vs. High Yield', type: 'read', topic: 'The difference between chasing the highest current yield and investing in companies with a track record of steadily increasing their dividend over time. Assume the reader already knows what payout ratio is; do not re-explain it.', xpReward: 10 },
      { slug: 'reinvest-or-take-cash', title: 'Reinvesting vs. Taking the Cash', type: 'read', topic: 'How dividend reinvestment compounds over time vs taking dividends as cash income, and when each makes sense depending on whether the investor is in a growth phase or an income phase.', xpReward: 10 },
      { slug: 'resilient-income-portfolio', title: 'Building a Resilient Income Portfolio', type: 'read', topic: 'Diversifying dividend income across sectors so a single company\'s dividend cut does not wreck the whole income stream. Reference diversification as a concept already covered without re-teaching its basics.', xpReward: 10 },
      { slug: 'dividend-investing-quiz', title: 'Quick Check: Dividend Investing', type: 'quiz', topic: 'Test understanding of dividend growth vs yield-chasing and reinvestment vs cash. 3 questions.', xpReward: 20 },
      { slug: 'the-yield-looks-amazing', title: 'The Yield Looks Amazing', type: 'scenario', topic: 'An investor finds a stock with an unusually high dividend yield compared to its sector peers. Reward recognizing this as a potential warning sign (the yield-trap pattern), building on but not repeating the beginner course\'s "Too Good to Be True?" scenario.', xpReward: 25 },
    ],
  },

  // ─── Market Analysis (Pro, intermediate) ─────────────────────────────────
  {
    slug: 'technical-analysis-basics',
    title: 'Technical Analysis Basics',
    description: 'Support and resistance, RSI and MACD, and common chart patterns, going beyond the moving averages already covered in Reading Charts.',
    icon: 'LineChart',
    color: 'blue',
    orderIndex: 22,
    difficulty: 'intermediate',
    requiresPro: true,
    unitLabel: 'Market Analysis',
    lessons: [
      // NOTE: reading-charts (free, beginner) already has an SMA
      // trend-following lesson — this course explicitly goes beyond it.
      { slug: 'support-and-resistance', title: 'Support and Resistance', type: 'read', topic: 'Price levels where a stock has repeatedly stopped falling (support) or stopped rising (resistance), and why other traders watching the same levels can turn them into a self-fulfilling pattern.', xpReward: 10 },
      { slug: 'beyond-moving-average', title: 'Beyond the Moving Average: RSI & MACD', type: 'read', topic: 'Explicitly build beyond simple moving averages, which are already covered elsewhere. Introduce RSI (overbought/oversold) and MACD (momentum shifts) in plain English, no formulas.', xpReward: 10 },
      { slug: 'common-chart-patterns', title: 'Common Chart Patterns', type: 'read', topic: 'A few widely-referenced patterns (double top, head and shoulders, breakout) explained as visual stories about what buyers and sellers are doing, explicitly not as guarantees of future price movement.', xpReward: 10 },
      { slug: 'technical-analysis-quiz', title: 'Quick Check: Technical Analysis', type: 'quiz', topic: 'Test understanding of support/resistance, RSI/MACD, and chart patterns. 3 questions.', xpReward: 20 },
      { slug: 'technical-terms-match', title: 'Match the Technical Terms', type: 'match', topic: 'Match vocabulary (Support, Resistance, RSI, MACD, Breakout, Overbought) to plain-English definitions.', xpReward: 15 },
      { slug: 'signal-or-noise', title: 'Signal or Noise?', type: 'scenario', topic: 'A stock\'s RSI suggests it is "overbought" right as strong fundamental news comes out. Reward reasoning about technical signals as ONE input among several, not an override of fundamentals.', xpReward: 25 },
    ],
  },

  // ─── Global Markets (Pro, advanced) ──────────────────────────────────────
  {
    slug: 'international-crypto-deep-dive',
    title: 'International & Crypto Investing Deep Dive',
    description: 'Home-country bias, currency exposure, and crypto risk beyond the basics, for investors ready to look past their own market.',
    icon: 'Globe',
    color: 'amber',
    orderIndex: 23,
    difficulty: 'advanced',
    requiresPro: true,
    unitLabel: 'Global Markets',
    lessons: [
      { slug: 'home-country-bias', title: 'Home-Country Bias', type: 'read', topic: 'Why investors tend to over-concentrate in companies from their own country, and why that is a real diversification risk even when it does not feel like one.', xpReward: 10 },
      { slug: 'currency-exposure-adrs', title: 'Currency Exposure & ADRs', type: 'read', topic: 'What happens to returns when investing in a foreign company: currency movement adds a second variable beyond the stock price itself. Explain ADRs as one way US investors access foreign companies, noting similar cross-listing mechanisms exist in other markets too.', xpReward: 10 },
      // NOTE: etfs-and-crypto (free, beginner) already has an intro
      // crypto/commodities lesson — this builds explicitly beyond it.
      { slug: 'crypto-beyond-basics', title: 'Crypto Beyond the Basics', type: 'read', topic: 'Explicitly build beyond a beginner crypto intro. Explain stablecoins (what backs them, why they are not "safe" in the traditional sense) and why crypto\'s correlation to other holdings can spike during market stress, meaning its diversification benefit is not guaranteed.', xpReward: 10 },
      { slug: 'global-crypto-quiz', title: 'Quick Check: Global & Crypto Investing', type: 'quiz', topic: 'Test understanding of home-country bias, currency exposure, and crypto-specific risk. 3 questions.', xpReward: 20 },
      { slug: 'diversified-or-just-foreign', title: 'Diversified, or Just Foreign?', type: 'scenario', topic: 'An investor buys a foreign stock believing it diversifies their portfolio, but the company is in the exact same industry as their existing holdings. Reward recognizing that geographic diversification and sector diversification are different things.', xpReward: 25 },
    ],
  },
];

// ─── Roadmap v2 (drafted 2026-10-20, AWAITING DAVID'S APPROVAL) ─────────────
//
// One course a month from November 2026. Deliberately a separate export: the
// weekly generate-academy-course cron reads ACADEMY_ROADMAP only, so nothing
// here gets drafted until it is approved and moved into the build flow
// (content/academy-staging/ + scripts/academy-apply-staging.ts). The only
// reader is /api/academy/next-course-countdown, which shows the first entry
// not yet published as "Coming next" on /academy.
//
// Conventions, matching the live catalog as of 2026-10-20:
//  - No two reads in a row: every read is followed by a 2-question "Check:"
//    quiz on that read alone; the last read is followed by the 3-question
//    "Quick Check" over the whole course. Then match, then the closing scenario.
//  - Demo / chart-tour lessons can't be AI-drafted (GeneratableLessonType), so
//    each course names its hand-written demo candidate in a comment. It goes
//    right before the closing scenario, and must target a surface that exists.
//  - orderIndex is the live slot it takes as of 2026-10-20 (the catalog was
//    renumbered 0-23 since v1, so v1's 14-23 above are stale). Applying a
//    course shifts every live course at or after that slot by +1.
//  - Course titles render untranslated, like every live course title.
//  - Historical figures are closing values, sourced in the topic. Anything a
//    later report may revise (SPIVA) says which edition it comes from.
export const ACADEMY_ROADMAP_V2: CourseOutline[] = [
  // ─── Money & Mindset (free, beginner), after macro-basics ────────────────
  {
    slug: 'index-funds-and-fees',
    title: 'Index Funds & Fees',
    description: 'Why most stock pickers trail the index, how a fee that looks tiny compounds against you, and what to compare before you pick a fund.',
    icon: 'Percent',
    color: 'emerald',
    orderIndex: 13,
    difficulty: 'beginner',
    unitLabel: 'Money & Mindset',
    targetMonth: '2026-11',
    lessons: [
      // NOTE: etfs-and-crypto ("What is an ETF?") already defines an ETF,
      // diversification inside a basket, and expense ratio ("0.10% is about
      // 10 cents a year per $100"), and its fun fact is the 1993 SPDR launch.
      // This course assumes all of that and goes to why costs decide outcomes.
      { slug: 'active-vs-passive', title: 'Why Most Fund Managers Trail the Index', type: 'read', topic: 'An index fund owns everything in an index instead of trying to pick winners (passive vs active). The evidence, from S&P Dow Jones Indices\' SPIVA U.S. Scorecard, Year-End 2024 (spglobal.com/spdji/en/spiva/article/spiva-us-year-end-2024): 65% of actively managed US large-cap funds underperformed the S&P 500 in 2024, underperformance rates rose as the time horizon lengthened, and over the 15 years to December 2024 no US equity fund category had a majority of active managers beat its benchmark. Use those figures only (check for a newer SPIVA edition when generating and say which year you cite). The reason is arithmetic, not stupidity: before costs, active investors as a group ARE the market, so after their higher fees the average one must trail it. Fun fact: Vanguard launched the first index mutual fund for individual investors in 1976. Do not re-define ETF or expense ratio.', xpReward: 10 },
      { slug: 'active-vs-passive-check', title: 'Check: Why Most Fund Managers Trail the Index', type: 'quiz', topic: 'Check understanding of the previous lesson only: what makes a fund passive, and why the average active fund trails its index after fees. 2 questions.', xpReward: 10 },
      { slug: 'fees-compound-too', title: 'Fees Compound Too', type: 'read', topic: 'Build on the expense ratio definition the learner already has: the fee is taken every year from the whole balance, so it compounds against you exactly like returns compound for you. Worked example, clearly labeled hypothetical, using an assumed 7% yearly return before fees: $10,000 left for 30 years grows to about $75,500 in a fund charging 0.03% a year, and about $57,400 in one charging 1.00%. The 1% fund costs roughly $18,000, a quarter of the ending balance. Also: a fund\'s past return is not a promise, but its fee is the one number you know in advance. Mention one-off costs (trading spread, sales loads on some mutual funds) in one sentence each.', xpReward: 10 },
      { slug: 'fees-compound-too-check', title: 'Check: Fees Compound Too', type: 'quiz', topic: 'Check understanding of the previous lesson only: why a yearly percentage fee compounds, and why the fee is more predictable than past returns. Use the lesson\'s hypothetical 0.03% vs 1.00% example, no new numbers. 2 questions.', xpReward: 10 },
      { slug: 'choosing-an-index-fund', title: 'What to Compare Before You Pick a Fund', type: 'read', topic: 'Four things to compare between index funds: (1) which index it tracks, since an S&P 500 fund, a total-market fund and a Nasdaq-100 fund own different things and the Nasdaq-100 is far more concentrated in a few large tech companies; (2) expense ratio; (3) tracking difference, how far the fund\'s return lands from its index; (4) size and trading volume, which keep the spread tight. Then the overlap trap: owning two S&P 500 funds from different providers is the same holding twice, and a Nasdaq-100 fund on top of an S&P 500 fund mostly doubles up the same largest companies. Stay fund-family neutral, no product recommendations.', xpReward: 10 },
      { slug: 'index-funds-quiz', title: 'Quick Check: Index Funds & Fees', type: 'quiz', topic: 'Test the whole course: passive vs active, why fees compound, and what to compare between two index funds (index tracked, cost, tracking difference, overlap). 3 questions.', xpReward: 20 },
      { slug: 'index-fund-terms-match', title: 'Match the Fund Terms', type: 'match', topic: 'Match vocabulary (Index Fund, Active Management, Expense Ratio, Tracking Difference, Total-Market Fund, Fund Overlap) to plain-English definitions.', xpReward: 15 },
      // DEMO CANDIDATE (hand-written): the stock page index badges with
      // "You already own some through VOO" (components/stock/IndexBadges.tsx),
      // showing overlap between a fund someone holds and a stock they're
      // eyeing. Goes here, before the scenario.
      { slug: 'the-star-fund', title: 'The Star Fund', type: 'scenario', topic: 'A friend recommends an actively managed fund that beat the market by 6 points last year and charges 1.2% a year. The investor already holds a low-cost S&P 500 index fund. Reward reasoning about the fee they know for certain vs a past result that is unlikely to repeat (the SPIVA persistence point), and checking how much the star fund overlaps what they already own. Do not frame active funds as always wrong.', xpReward: 25 },
    ],
  },

  // ─── Strategies (Pro, intermediate), after technical-analysis-basics ─────
  {
    slug: 'surviving-a-crash',
    title: 'Surviving a Crash',
    description: 'Four real market crashes, how long each took to recover, and what actually helped the investors who came through them.',
    icon: 'TrendingDown',
    color: 'blue',
    orderIndex: 19,
    difficulty: 'intermediate',
    requiresPro: true,
    unitLabel: 'Strategies',
    targetMonth: '2026-12',
    lessons: [
      // NOTE: portfolio-risk already teaches drawdown and "a 50% drop needs a
      // 100% gain"; investing-psychology already teaches loss aversion and
      // herding. This course is the history those lessons point at. Do not
      // re-derive the recovery math or re-teach the biases.
      //
      // Every figure below is a CLOSING value (intraday highs and lows differ)
      // for the price index, which excludes dividends, so recovery with
      // dividends reinvested came somewhat sooner. Use only these numbers.
      { slug: 'four-crashes', title: 'Four Crashes, Four Recoveries', type: 'read', topic: 'The S&P 500 through four crashes, with real closing values. (1) Dot-com: 1,527.46 on March 24, 2000 to 776.76 on October 9, 2002, down 49.1%; back above the old record on May 30, 2007 (1,530.23), about seven years after the peak. The tech-heavy Nasdaq Composite fell 78% from its March 10, 2000 close of 5,048.62 and only closed above it on April 23, 2015 (5,056.06), 15 years later. (2) Financial crisis: 1,565.15 on October 9, 2007 to 676.53 on March 9, 2009, down about 57%; new record March 28, 2013 (1,569.19), five and a half years after the peak. (3) COVID: 3,386.15 on February 19, 2020 to 2,237.40 on March 23, 2020, down about 34% in about five weeks, the fastest bear market on record; new record August 18, 2020 (3,389.78), six months after the peak. (4) 2022 rate hikes: 4,796.56 on January 3, 2022 to 3,577.03 on October 12, 2022, down 25.4%; new record January 19, 2024 (4,839.81), about two years after the peak. Sources: AP/NPR/UPI coverage of each record close (npr.org 2013-03-28, pbs.org 2020-08-18 "S&P 500 closes at a record, erasing last of pandemic losses", axios.com 2024-01-19, fortune.com 2015-04-23), Wikipedia "Closing milestones of the S&P 500". Takeaway: every one recovered, but on wildly different timelines, from six months to seven years for the S&P 500.', xpReward: 10 },
      { slug: 'four-crashes-check', title: 'Check: Four Crashes, Four Recoveries', type: 'quiz', topic: 'Check understanding of the previous lesson only, using only its figures: which crash was fastest, which took longest for the S&P 500 to recover, and why the Nasdaq took far longer than the S&P 500 after 2000. 2 questions.', xpReward: 10 },
      { slug: 'why-recoveries-differ', title: 'Why Some Recoveries Took Months and Others Years', type: 'read', topic: 'What separated the timelines in the previous lesson: how expensive stocks were going in (dot-com valuations were extreme, so prices had further to fall and longer to grow back), what broke (2008 was the banking system itself; 2020 was a sudden shock met by fast, very large support from the Federal Reserve and Congress), and what was concentrated (the Nasdaq was packed with the stocks that were most overvalued). The honest caveat: recovery is not guaranteed on any timeline. Japan\'s Nikkei 225 closed at a record 38,915.87 on December 29, 1989 and did not close above it until February 22, 2024 (39,098.68), 34 years later (sources: Japan Times 2024-02-22, Wikipedia "Nikkei 225"). And an index recovers partly because it replaces failures with new companies; an individual stock that collapses may never come back. Reference diversification as already taught, do not re-teach it.', xpReward: 10 },
      { slug: 'why-recoveries-differ-check', title: 'Check: Why Some Recoveries Took Months and Others Years', type: 'quiz', topic: 'Check understanding of the previous lesson only: why starting valuation mattered, and why a broad index can recover when a single collapsed stock may not (with the Nikkei as the caveat that even an index can take decades). 2 questions.', xpReward: 10 },
      { slug: 'what-helped', title: 'What Actually Helped Investors Through', type: 'read', topic: 'Four habits that helped, each tied to the history: (1) Staying invested. J.P. Morgan Asset Management\'s Guide to Retirement shows that missing just the 10 best days over a 20-year period roughly halves an S&P 500 investor\'s ending value, and that most of the best days came within about two weeks of the worst days, i.e. in the middle of crashes when selling feels safest. Present this as the guide\'s finding without quoting one edition\'s exact dollar figures. (2) Having cash set aside so you are never forced to sell at the bottom. (3) Rebalancing, which means buying what fell. (4) Investing on a schedule (dollar-cost averaging) so a crash buys more shares at lower prices. Then 2022\'s lesson: the Bloomberg US Aggregate bond index lost about 13% that year, its worst calendar year since the index began in 1976, while the S&P 500 fell 19.4%, so stocks and bonds fell together (sources: Axios 2022-12-31 "Stocks\' terrible year", LPL Research via Yahoo Finance). A diversifier can fail exactly when you need it, which is why cash and time horizon matter.', xpReward: 10 },
      { slug: 'surviving-a-crash-quiz', title: 'Quick Check: Surviving a Crash', type: 'quiz', topic: 'Test the whole course using only its figures: the four crashes and their recovery times, what made recoveries differ, and which habits helped (staying invested, cash buffer, rebalancing, buying on a schedule). 3 questions.', xpReward: 20 },
      { slug: 'crash-terms-match', title: 'Match the Crash Terms', type: 'match', topic: 'Match vocabulary (Bear Market, Correction, Peak, Trough, Recovery, Rebalancing) to plain-English definitions. Bear market = a fall of 20% or more from a high; correction = 10% or more.', xpReward: 15 },
      // DEMO CANDIDATE (hand-written): a chart-tour on a long-range S&P 500
      // ETF chart (SPY, max range) stepping through the four drawdowns from
      // the first lesson. Needs a check that the chart's max range reaches
      // back to 2000 before it is written. Goes here, before the scenario.
      { slug: 'down-thirty-percent', title: 'Down 30% in Five Weeks', type: 'scenario', topic: 'The market has fallen 30% in five weeks, the investor\'s whole portfolio is red, and the news says it will get worse. They have a 15-year horizon, a job, and six months of expenses in cash. Reward holding to the plan and rebalancing, reasoning from the history in the course. The feedback must also say plainly that history does not promise how long a recovery takes (the Nikkei caveat), so the plan is what makes holding possible, not a guarantee of the outcome.', xpReward: 25 },
    ],
  },

  // ─── Foundations (free, beginner), after reading-a-stock-quote ───────────
  {
    slug: 'placing-a-trade',
    title: 'Placing a Trade',
    description: 'Market, limit and stop orders, what happens when you trade outside market hours, and how a commission-free broker still gets paid.',
    icon: 'ArrowLeftRight',
    color: 'emerald',
    orderIndex: 3,
    difficulty: 'beginner',
    unitLabel: 'Foundations',
    targetMonth: '2027-01',
    lessons: [
      // NOTE: what-is-a-stock ("How Markets Work") already covers exchanges
      // and that a broker routes your order; reading-a-stock-quote ("Bid, Ask
      // & Spread") already defines bid, ask, spread and liquidity. Use those
      // terms, do not re-define them. BullPen is not a broker and never
      // places trades: keep every lesson broker-neutral, no app names.
      { slug: 'market-vs-limit', title: 'Market Orders vs. Limit Orders', type: 'read', topic: 'A market order fills right away at the best available price, which for a buy means paying the ask (link to the spread they already know); fast, but you don\'t control the price, which matters in a thinly traded stock or a fast-moving moment. A limit order sets the most you will pay (or the least you will accept when selling); you control the price but it may never fill. Day orders expire at the close, good-til-canceled orders stay open until filled or canceled (brokers usually cap how long). Fractional shares: many brokers let you buy by dollar amount instead of whole shares, and these orders are often handled as market orders; not every stock or broker offers it, and fractional positions may not transfer to another broker.', xpReward: 10 },
      { slug: 'market-vs-limit-check', title: 'Check: Market Orders vs. Limit Orders', type: 'quiz', topic: 'Check understanding of the previous lesson only: the tradeoff between a market order (certain fill, uncertain price) and a limit order (certain price, uncertain fill). 2 questions.', xpReward: 10 },
      { slug: 'when-price-jumps', title: 'Stops, Gaps & After-Hours Trading', type: 'read', topic: 'A stop (stop-loss) order becomes a market order once the price touches the stop, so if a stock gaps down overnight, for example after an earnings report, it can fill well below the stop price. A stop-limit order avoids that but may not fill at all. Extended hours: in the US many brokers offer pre-market trading before the 9:30 a.m. ET open and after-hours trading after the 4:00 p.m. ET close (exact windows vary by broker). Fewer people trade then, so spreads are wider and prices jump more, and many brokers accept only limit orders outside regular hours. Note that BullPen\'s stock page shows the extended-hours price separately from the regular-session close. No claims about any specific broker\'s hours.', xpReward: 10 },
      { slug: 'when-price-jumps-check', title: 'Check: Stops, Gaps & After-Hours Trading', type: 'quiz', topic: 'Check understanding of the previous lesson only: why a stop order can fill below its stop price, and why after-hours prices are less reliable. 2 questions.', xpReward: 10 },
      { slug: 'how-free-brokers-get-paid', title: 'How "Commission-Free" Brokers Get Paid', type: 'read', topic: 'No commission does not mean no business model. Common revenue sources: payment for order flow (a market maker pays the broker to handle its customers\' orders), interest earned on customers\' uninvested cash, interest on margin loans, lending customers\' shares to short sellers, and paid subscription tiers. In the US, SEC Rule 606 requires brokers to publish quarterly reports on where they route customer orders and what they are paid for it, and Rule 607 requires disclosing payment-for-order-flow policies when an account is opened and every year after. The useful takeaway: check how your broker pays you on idle cash and read its order-routing disclosure. Neutral tone, no claim that any of these is a scam, and other countries have their own rules (several restrict payment for order flow).', xpReward: 10 },
      { slug: 'placing-a-trade-quiz', title: 'Quick Check: Placing a Trade', type: 'quiz', topic: 'Test the whole course: market vs limit, how stops and gaps interact, why after-hours trading is riskier, and the ways a commission-free broker earns money. 3 questions.', xpReward: 20 },
      { slug: 'order-terms-match', title: 'Match the Order Types', type: 'match', topic: 'Match vocabulary (Market Order, Limit Order, Stop Order, Good-Til-Canceled, Fractional Share, Payment for Order Flow) to plain-English definitions.', xpReward: 15 },
      // DEMO CANDIDATE (hand-written): the stock page quote area showing the
      // regular-session close next to the extended-hours price, used to show
      // why an after-hours move is not yet a settled price. Goes here, before
      // the scenario.
      { slug: 'up-twelve-after-hours', title: 'Up 12% After Hours', type: 'scenario', topic: 'A company the investor has been researching reports earnings after the close and the stock is up 12% in after-hours trading. They want to buy right now with a market order. Reward recognizing the thin after-hours market (wide spread, jumpy price) and choosing a limit order at a price they decided in advance, or waiting for the regular session. Not "never trade after hours", just know what you are getting.', xpReward: 25 },
    ],
  },
];
