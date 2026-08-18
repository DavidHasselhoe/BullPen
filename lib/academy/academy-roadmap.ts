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
