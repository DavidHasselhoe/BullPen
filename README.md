# BullPen

A stock research and portfolio web app for beginner-to-intermediate investors. Live market data, AI-powered insights, crypto & commodity support, SEC filing analysis, investing education, and social features — all in one place, with a free tier and a Stripe-powered Pro subscription.

## Features

### Market Data & Asset Pages
- **Real-time quotes** via TwelveData WebSocket stream — price, change, extended-hours
- **Candlestick & area charts** powered by TradingView Lightweight Charts with 8 time ranges (1D–ALL)
- **Technical indicators** overlay — SMA 50/200, EMA 20, Bollinger Bands, RSI, MACD
- **Universal asset pages** — stocks, ETFs, crypto (BTC/USD, ETH/USD, SOL/USD) and commodities (XAU/USD, silver, oil) all share the same chart and data layer
- **Crypto & Commodities card** on the Discover page with live prices for BTC, ETH, SOL, and Gold

### Stock Detail
- **Financial health score** — composite solvency, profitability, liquidity, and efficiency signals
- **Statistics grid** — P/E, forward P/E, P/B, EV/EBITDA, beta, 52-week range, dividend yield, margins
- **Revenue Sankey diagram** — visualizes how revenue flows through cost, operating, and net income
- **Multi-quarter financials** — income statement, balance sheet, and cash flow
- **Earnings calendar** — upcoming dates, EPS estimates, actuals, beat/miss tracking
- **Insider transactions** — buy/sell activity from company officers
- **Company profile** — description, executives, sector, competitors
- **"Why Today?"** — Anthropic Claude + web search explains the day's price movement (Pro)
- **Market news feed** via Finnhub
- **Stock theses** — community investment opinions

### Portfolio & Holdings
- **Holdings dashboard** — cost basis, unrealized P&L, day change, allocation
- **Inline sparklines** — 30-day mini price chart per holding row
- **Allocation bar** — proportional purple fill bars across holdings
- **Pie chart** — sector/asset-type breakdown; crypto holdings bucket separately
- **Performance chart** — portfolio value over time
- **Risk analysis** — sector concentration, diversification score
- **SnapTrade integration** — optional OAuth brokerage linking for live account sync
- **asset_type tracking** — stocks, crypto, commodities, ETFs, forex differentiated

### Discovery & Alerts
- **Daily Brief** — AI-written morning market article (Pro), grounded in live rates, web-searched VIX and BullPen's own Market Mood score
- **Bull's Weekly Pick** — one AI-selected stock published every Monday pre-market; a three-stage Scout → Ground → Commit pipeline (Claude sources candidates, the app grounds them against real data, Claude commits to one and argues it from the numbers) with performance tracked against the entry price
- **Market Context** — live movers, market hours countdown
- **Hot Picks** — trending tickers by visit frequency
- **Recently Viewed** — quick navigation to past assets
- **Earnings Calendar Widget** — switches between market-wide and portfolio mode
- **Home "Coming up" card** — your stocks' earnings and ex-dividend dates plus market-moving economic releases, with a count of everyone else reporting today
- **Discover search bar** — opens the command palette from the overview
- **In-app notification center** — unified feed for alerts, earnings, and academy activity, separate from email
- **Morning alert email** — one email a day via Resend, only when something happened: earnings, ex-dividend dates, big moves, Health Score changes, politician trades, economic releases, Daily Brief and Weekly Pick (English only for now)

### Investment Tools
- **Bull (AI chat)** — Claude-powered research assistant with tool calls to live data; context-aware of the current page, and remembers what you answered on its Yes/No and Confirm cards
- **AI Deep Dive** — five analysis lenses (Full, Bull/Bear, Valuation, Risk, For You) generate a structured Claude report on a company (Pro)
- **Stock Screener** — filter by revenue, margins, EPS, debt-to-equity, ROE, dividend yield
- **Company Compare** — side-by-side comparison of 2–5 companies
- **Filing Explorer** — browse 10-K, 10-Q, 20-F, 8-K filings with AI summaries
- **Market Events Calendar** — earnings, dividends, splits, IPOs and US economic releases; a day's popup lists every company reporting, not just the top 60
- **Market Mood** — BullPen's own Fear & Greed score built from market signals
- **"If You Bought Here"** — historical return calculator vs S&P 500 benchmark
- **Dividend Calculator** — project dividend income over time
- **S&P 500 Heatmap** — treemap by market cap, colored by daily % change

### BullPen Academy
- **Courses** — structured investing lessons with progress tracking per user
- **Daily challenges** — one quiz question a day, streak-tracked
- **Leaderboard** — ranks users by Academy progress and streaks

### Pro & Billing
- **Stripe-powered subscriptions** — Free and Pro tiers (`account_tier` in Supabase), self-serve checkout and billing portal
- **Per-feature quotas** — free-tier usage caps on AI/credit-metered features; Pro bypasses them
- **Admin role** — separate from billing tier; always has Pro-level access plus an internal admin dashboard (AI cost tracking, user feedback)

### Search
- **Command palette** (⌘K / Ctrl+K) — global search across stocks, crypto, and commodities
- **Categorized results** — Crypto / Commodities / Stocks & ETFs in separate groups
- **Smart deduplication** — collapses cross-listings to primary US listing; preserves non-equity instruments

### Social
- **Public profiles** — follow/follower graph
- **Stock theses** — publish and browse investment opinions by ticker
- **Activity feed** and **leaderboard**
- **Shareable cards** — public share links (theses, health scores, portfolio performance) viewable without an account

### AI & Automation
- **Bull chat** — streaming responses, tool calls to live data (Anthropic Claude via the Vercel AI SDK)
- **"Why Today?"** — Anthropic Claude with Brave web search explains daily price moves
- **Daily Brief generation** — Claude writes one shared newsroom-style brief at 6:30 AM UTC
- **SEC ingestion pipeline** — automated 10-K, 10-Q, 8-K ingestion with XBRL extraction and AI summaries
- **Composite signals** — bullish/bearish scoring from filing content

### UX
- **Experience level toggle** — Beginner / Intermediate / Advanced; adapts terminology and shown metrics across the whole app
- **Adaptive terminology** — `TermTooltip` renders plain-language labels for beginners, full finance terms for advanced
- **Your time zone and clock** — times of day show in the zone and 12/24-hour format picked in Settings (e.g. "20:00 your time (2:00 PM ET)")
- **Multi-language support** — 7 locales (English, Norwegian, Japanese, French, German, Spanish, Chinese) via i18next, with an AI-assisted translation pipeline for content locales
- **Guided onboarding** — post-signup flow that captures intent before first use
- **Animated gradient backgrounds** — 4 themes
- **Dark / Light theme**
- **Framer Motion** transitions throughout

---

## Tech Stack

| Area | Technology |
|------|------------|
| **Framework** | [Next.js](https://nextjs.org) 16 (App Router), [React](https://react.dev) 19 |
| **Language** | [TypeScript](https://www.typescriptlang.org) (strict mode) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com) 4 |
| **Database & Auth** | [Supabase](https://supabase.com) — Postgres, Auth, Storage |
| **Client data** | [TanStack Query](https://tanstack.com/query) v5 |
| **Validation** | [Zod](https://zod.dev) |
| **UI** | [Radix UI](https://www.radix-ui.com) / shadcn-ui, [Framer Motion](https://www.framer.com/motion/), [Lucide](https://lucide.dev) icons, cmdk |
| **Charts** | [Lightweight Charts](https://www.tradingview.com/lightweight-charts/) (TradingView — price charts), [Recharts](https://recharts.org) (financials), [D3](https://d3js.org) + d3-sankey (Sankey diagram) |
| **AI — chat** | [Vercel AI SDK](https://sdk.vercel.ai/docs) + Anthropic Claude |
| **AI — analysis** | [Anthropic SDK](https://docs.anthropic.com) — Claude (Why Today?, Daily Brief, Deep Dive, Bull's Weekly Pick, Academy) |
| **Billing** | [Stripe](https://stripe.com) — Pro subscription checkout, billing portal, webhooks |
| **Email** | [Resend](https://resend.com) |
| **Rate limiting & cache** | [Upstash](https://upstash.com) Redis |
| **Brokerage OAuth** | [SnapTrade](https://snaptrade.com) TypeScript SDK |
| **i18n** | [i18next](https://www.i18next.com), react-i18next — 7 locales |
| **Analytics** | [Vercel Analytics](https://vercel.com/analytics), Speed Insights |
| **Ops notifications** | Discord webhooks (changelog announcements, cron/error alerts) |

**Primary market data:** TwelveData (quotes, candles, stats, financials, earnings, logos)  
**News & fallbacks:** Finnhub  
**SEC filings:** EDGAR direct  
**Company logos:** Logo.dev + TwelveData, persisted in Supabase Storage

---

## Data Sources

| Source | Used for |
|--------|----------|
| **TwelveData** | Real-time & historical quotes, candles, statistics, financials, earnings, technical indicators, logos, symbol search |
| **Finnhub** | Market news, fallback quotes |
| **SEC EDGAR** | 10-K, 10-Q, 20-F, 8-K filing ingestion |
| **Anthropic Claude** | Bull chat, "Why Today?" price explanations, Daily Brief, AI Deep Dive reports, Bull's Weekly Pick, Academy content |
| **Resend** | Morning alert email, verification and billing email |
| **SnapTrade** | Brokerage OAuth + live holdings sync |
| **Stripe** | Pro subscription billing |
| **Upstash** | Redis for API rate limiting and market data caching; QStash for the hourly user-alerts schedule |
| **Supabase** | User accounts, holdings, watchlists, theses, daily briefs, Academy progress, company index |
| **Discord** | Changelog announcements, ops/cron alerts (internal webhooks) |
| **Instagram Graph API** | Automated content pipeline (earnings calendar and results, earnings deep dives, market movers, Weekly Pick scoreboard); publishes automatically and confirms in Discord |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm (or pnpm / yarn / bun)

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create `.env.local` in the project root. **[ENV_SETUP.md](./ENV_SETUP.md)** has the full variable list.

**Required for core functionality:**

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY       # Every AI feature (Claude)
TWELVE_DATA_API_KEY     # Primary market data
```

**Optional / production:**

```
FINNHUB_API_KEY         # News + quote fallbacks
RESEND_API_KEY          # Email notifications
CRON_SECRET             # Protect cron endpoints
LOGO_DEV_KEY            # Company logos
NEXT_PUBLIC_APP_URL     # Used in email links
SNAPTRADE_CLIENT_ID     # Brokerage OAuth
SNAPTRADE_CONSUMER_KEY
UPSTASH_REDIS_REST_URL  # Rate limiting / caching
UPSTASH_REDIS_REST_TOKEN
STRIPE_SECRET_KEY       # Pro subscription billing
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_PRO_ANNUAL
DISCORD_CHANGELOG_WEBHOOK_URL  # Discord announcements
DISCORD_INSTAGRAM_WEBHOOK_URL
INSTAGRAM_APP_ID               # Automated Instagram content pipeline
INSTAGRAM_APP_SECRET
INSTAGRAM_ACCESS_TOKEN
INSTAGRAM_USER_ID
```

See **[ENV_SETUP.md](./ENV_SETUP.md)** for the complete, current list.

### 3. Database

Apply Supabase migrations:

```bash
npx supabase db push
```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
BullPen/
├── app/
│   ├── api/                    # 100+ API route handlers
│   ├── stock/[ticker]/         # Stock detail page
│   ├── asset/[slug]/           # Universal crypto/commodity page (BTC-USD, XAU-USD)
│   ├── etf/[ticker]/           # ETF page
│   ├── holdings/               # Portfolio dashboard
│   ├── watchlist/              # Watchlist
│   ├── tools/                  # AI, screener, compare, filings, calendar, heatmap, deep-dive, …
│   ├── academy/                # Courses, daily challenges, leaderboard
│   ├── picks/                  # Bull's Weekly Pick archive
│   ├── pricing/, upgrade/      # Pro subscription pages
│   ├── dashboard/               # Post-login landing dashboard
│   ├── notifications/          # In-app notification center
│   ├── share/[id]/             # Public shareable cards (no auth required)
│   ├── admin/                  # Internal-only: AI cost tracking, feedback
│   ├── social/, users/         # Community features
│   └── (auth, onboarding, brokerage-callback routes)
├── components/                 # React components (organised by domain)
│   ├── asset/                  # Crypto/commodity cards and stats
│   ├── stock/                  # Stock-specific components
│   ├── holdings/               # Portfolio components
│   ├── discover/               # Homepage widgets
│   ├── academy/                # Course cards, challenge cards
│   ├── billing/                # Pricing, checkout, entitlements UI
│   ├── deep-dive/              # AI Deep Dive lens picker and report blocks
│   ├── picks/                  # Weekly Pick hero and history
│   ├── watchlist/
│   ├── ai/                     # AI chat panel
│   ├── i18n/                   # Language switcher
│   └── ui/                     # Shared design system
├── hooks/                      # Shared React hooks
├── lib/
│   ├── ai/                     # Agent, system prompt, tool definitions; deep-dive/ and picks/ subpipelines
│   ├── assets/                 # Asset type utilities (slugToSymbol, inferAssetType)
│   ├── billing/                # Stripe checkout, tiers, quotas, AI cost logging
│   ├── finance/                # Health score, signals, glossary
│   ├── twelvedata/             # TwelveData API client
│   ├── supabase/               # Typed Supabase clients
│   ├── security/               # Rate limiting, input validation
│   ├── currency/               # FX conversion
│   ├── i18n/                   # Locale config + AI translation pipeline
│   ├── discord/                # Ops webhook posting
│   ├── instagram/               # Automated content generation/rendering
│   ├── shares/                 # Public share-link generation
│   ├── onboarding/              # Post-signup flow state
│   └── ingestion/              # SEC filing ingestion pipeline
├── scripts/                    # One-off CLI utilities
└── supabase/migrations/        # SQL migrations
```

---

## Key Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server (localhost:3000) |
| `npm run build` | Production build |
| `npm run lint` | ESLint (primary code-quality gate) |
| `npm run i18n:translate -- --ns=<ns>` | AI-translate new keys in a namespace (review the diff: it can reorder or rewrite other keys) |
| `npm run i18n:pseudo` | Regenerate the `qa` pseudo-locale |
| `npm run test-cron-coverage` | Check every cron route has a scheduler and vice versa |
| `npm run test-no-truncated-text` | Fail on AI-written text cut off without a Show more |
| `npm run trigger-cron` | Manually fire the daily brief cron |
| `npm run trigger-alerts` | Manually fire the user-alerts cron |
| `npm run trigger-instagram-earnings` | Manually fire the Instagram content-generation cron |
| `npm run instagram-publish` | Publish a staged Instagram carousel |
| `npm run test-credit-budget` | Test the shared TwelveData credit-budget guard |
| `npm run test-trends` | Test trend detection |
| `npm run verify-picks-math` | Sanity-check Bull's Weekly Pick performance calculations |
| `npm run set-gold-tier` | Set a user's `account_tier` directly (admin utility) |
| `npm run post-changelog-discord` | Announce a new changelog entry in Discord |

Many more one-off scripts (logo backfills, locale tooling, email/webhook smoke tests) live in `scripts/` — see `package.json` for the full list.

---

## Scheduled Jobs

Split across three schedulers. Every cron route requires the `CRON_SECRET` bearer header, whoever triggers it. The full table with schedules and reasons lives in [docs/agent/scheduled-work.md](./docs/agent/scheduled-work.md); run `npm run test-cron-coverage` after touching any of them.

| Scheduler | Used for | Examples |
|-----------|----------|----------|
| **Vercel cron** (`vercel.json`) | Jobs that run at most once a day | Daily Brief (06:30 UTC), Weekly Pick (Mon 06:30), morning alert email (08:30), earnings/dividend/price-move notifications, economic calendar sync, Academy content, Instagram posts |
| **Upstash QStash** | Sub-daily, time-sensitive jobs | User price/metric alerts, hourly through market hours |
| **GitHub Actions** (`.github/workflows/cron-*.yml`) | Hours-long batch loops paced under the TwelveData rate limit, and jobs that commit to git | Market data and financials prefetch, calendar prefetch, screener refresh, search index refresh, index constituent sync |

Trigger manually with `npm run trigger-cron` (daily brief) or `npm run trigger-alerts` (user alerts).

---

## Deployment

1. Connect the repository to [Vercel](https://vercel.com)
2. Set environment variables (see [ENV_SETUP.md](./ENV_SETUP.md))
3. Push to `main` → production; push to `preview` → stable preview URL

`vercel.json`'s `ignoreCommand` decides which commits build: `main` always builds; Dependabot branches and changelog-only commits (`docs(changelog)…`) are skipped, which keeps deployment storage down.

---

## Documentation

- [ENV_SETUP.md](./ENV_SETUP.md) — Environment variables and service configuration
- [SCHEMA_SETUP.md](./SCHEMA_SETUP.md) — Database schema and migrations
- [PRODUCT.md](./PRODUCT.md) — Product purpose, positioning, and design principles
- [DESIGN.md](./DESIGN.md) — Visual design system
- [ROADMAP.md](./ROADMAP.md) — Living roadmap notes
- [docs/agent/](./docs/agent/) — Architecture, TwelveData rules, scheduled work, environment and legal-compliance notes

---

## License

Proprietary.
