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
- **Daily Brief** — AI-generated market summary delivered each morning (Pro)
- **Bull's Weekly Pick** — one AI-selected stock published every Monday pre-market; a three-stage Scout → Ground → Commit pipeline (Claude sources candidates, the app grounds them against real data, Claude commits to one and argues it from the numbers) with performance tracked against the entry price
- **Market Context** — live movers, market hours countdown
- **Hot Picks** — trending tickers by visit frequency
- **Recently Viewed** — quick navigation to past assets
- **Earnings Calendar Widget** — switches between market-wide and portfolio mode
- **In-app notification center** — unified feed for alerts, earnings, and academy activity, separate from email
- **Email notifications** — price alerts (5%+ moves), upcoming earnings, new SEC filings via Resend

### Investment Tools
- **BullPen AI** — OpenAI-powered research assistant with 15+ tools; context-aware of the current page
- **AI Deep Dive** — five analysis lenses (Full, Bull/Bear, Valuation, Risk, For You) generate a structured Claude report on a company (Pro)
- **Stock Screener** — filter by revenue, margins, EPS, debt-to-equity, ROE, dividend yield
- **Company Compare** — side-by-side comparison of 2–5 companies
- **Filing Explorer** — browse 10-K, 10-Q, 20-F, 8-K filings with AI summaries
- **Market Events Calendar** — earnings, dividends, splits, IPOs
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
- **BullPen AI chat** — streaming responses, tool calls to live data (OpenAI GPT-4o)
- **"Why Today?"** — Anthropic Claude with Brave web search explains daily price moves
- **Daily Brief generation** — Claude writes a personalized daily market summary at 6:30 AM UTC
- **SEC ingestion pipeline** — automated 10-K, 10-Q, 8-K ingestion with XBRL extraction and AI summaries
- **Composite signals** — bullish/bearish scoring from filing content

### UX
- **Experience level toggle** — Beginner / Intermediate / Advanced; adapts terminology and shown metrics across the whole app
- **Adaptive terminology** — `TermTooltip` renders plain-language labels for beginners, full finance terms for advanced
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
| **AI — chat** | [Vercel AI SDK](https://sdk.vercel.ai/docs) + OpenAI GPT-4o |
| **AI — analysis** | [Anthropic SDK](https://docs.anthropic.com) — Claude (Why Today?, Daily Brief, Deep Dive, Bull's Weekly Pick) |
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
| **OpenAI** | BullPen AI research assistant |
| **Anthropic Claude** | "Why Today?" price explanations, Daily Brief, AI Deep Dive reports, Bull's Weekly Pick |
| **Resend** | Transactional email (price alerts, earnings notifications) |
| **SnapTrade** | Brokerage OAuth + live holdings sync |
| **Stripe** | Pro subscription billing |
| **Upstash Redis** | API rate limiting, market data caching |
| **Supabase** | User accounts, holdings, watchlists, theses, daily briefs, Academy progress, company index |
| **Discord** | Changelog announcements, ops/cron alerts (internal webhooks) |
| **Instagram Graph API** | Automated weekly earnings-calendar content pipeline (staged for manual review, not auto-published) |

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
OPENAI_API_KEY          # BullPen AI chat
ANTHROPIC_API_KEY       # Why Today? + Daily Brief
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
| `npm run trigger-cron` | Manually fire the daily brief cron |
| `npm run trigger-alerts` | Manually fire the user-alerts cron |
| `npm run trigger-instagram-earnings` | Manually fire the Instagram content-generation cron |
| `npm run instagram-publish` | Publish a staged Instagram carousel |
| `npm run test-credit-budget` | Test the shared TwelveData credit-budget guard |
| `npm run test-trends` | Test trend detection |
| `npm run verify-picks-math` | Sanity-check Bull's Weekly Pick performance calculations |
| `npm run generate-daily-challenges` | Draft a reviewable SQL seed of Academy quiz questions |
| `npm run set-gold-tier` | Set a user's `account_tier` directly (admin utility) |
| `npm run post-changelog-discord` | Announce a new changelog entry in Discord |

Many more one-off scripts (logo backfills, locale tooling, email/webhook smoke tests) live in `scripts/` — see `package.json` for the full list.

---

## Scheduled Jobs

Split across two schedulers. All cron routes require the `CRON_SECRET` bearer header regardless of who triggers them.

**Vercel cron** (`vercel.json`) — time-critical, capped at 2 on the Hobby plan:

| Endpoint | Schedule (UTC) | Purpose |
|----------|---------------|---------|
| `/api/cron/generate-daily-brief` | 06:30 daily | Generate AI daily brief for Pro users |

**GitHub Actions crons** (`.github/workflows/cron-*.yml`) — time-tolerant, paced in batches to stay under the TwelveData rate limit:

| Endpoint | Schedule (UTC) | Purpose |
|----------|---------------|---------|
| `/api/cron/check-user-alerts` | Hourly, 14:30–21:30 weekdays | Evaluate user-defined price/metric alerts through market hours |
| `/api/cron/check-earnings-upcoming` | 08:00 daily | Email users about upcoming earnings in held/watched stocks |
| `/api/cron/check-price-moves` | 21:30 weekdays | Email on 5%+ price moves for held/watched stocks |
| `/api/cron/prefetch-market-data` | 05:00 daily | Pre-cache stats for the active screener universe |
| `/api/cron/prefetch-market-data?phase=financials` | 12:00 daily | Warm income statement / balance sheet / cash flow into cache, one symbol at a time |
| `/api/screener/refresh` | 22:00 daily | Refresh screener financial data, top half of the active universe |
| `/api/screener/refresh` (extended + discovery) | 03:00 daily | Refresh the rest of the active universe; sweep the long tail for newly significant tickers |
| `/api/cron/generate-weekly-pick` | 06:30 Mondays | Generate and publish Bull's Weekly Pick |
| `/api/cron/instagram-earnings-weekly` | 12:00 Sundays | Stage next week's earnings-calendar Instagram carousel for review |

Trigger manually with `npm run trigger-cron` (daily brief) or `npm run trigger-alerts` (user alerts).

---

## Deployment

1. Connect the repository to [Vercel](https://vercel.com)
2. Set environment variables (see [ENV_SETUP.md](./ENV_SETUP.md))
3. Push to `main` → production; push to `preview` → stable preview URL

Only `main` and `preview` branches trigger Vercel builds (configured via Ignored Build Step).

---

## Documentation

- [ENV_SETUP.md](./ENV_SETUP.md) — Environment variables and service configuration
- [SCHEMA_SETUP.md](./SCHEMA_SETUP.md) — Database schema and migrations
- [PRODUCT.md](./PRODUCT.md) — Product purpose, positioning, and design principles
- [DESIGN.md](./DESIGN.md) — Visual design system
- [ROADMAP.md](./ROADMAP.md) — Living roadmap notes

---

## License

Proprietary.
