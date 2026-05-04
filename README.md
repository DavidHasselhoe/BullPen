# BullPen

A stock research and portfolio web app for beginner-to-intermediate investors. Live market data, AI-powered insights, crypto & commodity support, SEC filing analysis, and social features — all in one place.

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
- **Market Context** — live movers, market hours countdown
- **Hot Picks** — trending tickers by visit frequency
- **Recently Viewed** — quick navigation to past assets
- **Earnings Calendar Widget** — switches between market-wide and portfolio mode
- **Email notifications** — price alerts (5%+ moves), upcoming earnings, new SEC filings via Resend

### Investment Tools
- **BullPen AI** — OpenAI-powered research assistant with 15 tools; context-aware of the current page
- **Stock Screener** — filter by revenue, margins, EPS, debt-to-equity, ROE, dividend yield
- **Company Compare** — side-by-side comparison of 2–5 companies
- **Filing Explorer** — browse 10-K, 10-Q, 20-F, 8-K filings with AI summaries
- **Market Events Calendar** — earnings, dividends, splits, IPOs
- **"If You Bought Here"** — historical return calculator vs S&P 500 benchmark
- **Dividend Calculator** — project dividend income over time
- **S&P 500 Heatmap** — treemap by market cap, colored by daily % change

### Search
- **Command palette** (⌘K / Ctrl+K) — global search across stocks, crypto, and commodities
- **Categorized results** — Crypto / Commodities / Stocks & ETFs in separate groups
- **Smart deduplication** — collapses cross-listings to primary US listing; preserves non-equity instruments

### Social
- **Public profiles** — follow/follower graph
- **Stock theses** — publish and browse investment opinions by ticker
- **Activity feed** and **leaderboard**

### AI & Automation
- **BullPen AI chat** — streaming responses, tool calls to live data (OpenAI GPT-4o)
- **"Why Today?"** — Anthropic Claude with Brave web search explains daily price moves
- **Daily Brief generation** — Claude writes a personalized daily market summary at 6:30 AM UTC
- **SEC ingestion pipeline** — automated 10-K, 10-Q, 8-K ingestion with XBRL extraction and AI summaries
- **Composite signals** — bullish/bearish scoring from filing content

### UX
- **Experience level toggle** — Beginner / Intermediate / Advanced; adapts terminology and shown metrics across the whole app
- **Adaptive terminology** — `TermTooltip` renders plain-language labels for beginners, full finance terms for advanced
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
| **AI — analysis** | [Anthropic SDK](https://docs.anthropic.com) — Claude (Why Today?, Daily Brief) |
| **Email** | [Resend](https://resend.com) |
| **Rate limiting & cache** | [Upstash](https://upstash.com) Redis |
| **Brokerage OAuth** | [SnapTrade](https://snaptrade.com) TypeScript SDK |
| **i18n** | [i18next](https://www.i18next.com), react-i18next |
| **Analytics** | [Vercel Analytics](https://vercel.com/analytics), Speed Insights |

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
| **Anthropic Claude** | "Why Today?" price explanations, Daily Brief generation |
| **Resend** | Transactional email (price alerts, earnings notifications) |
| **SnapTrade** | Brokerage OAuth + live holdings sync |
| **Upstash Redis** | API rate limiting, market data caching |
| **Supabase** | User accounts, holdings, watchlists, theses, daily briefs, company index |

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
```

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
│   ├── api/                    # 80+ API route handlers
│   ├── stock/[ticker]/         # Stock detail page
│   ├── asset/[slug]/           # Universal crypto/commodity page (BTC-USD, XAU-USD)
│   ├── holdings/               # Portfolio dashboard
│   ├── watchlist/              # Watchlist
│   ├── tools/                  # AI, screener, compare, filings, calendar, heatmap, …
│   ├── social/, users/         # Community features
│   └── (auth routes)
├── components/                 # React components (organised by domain)
│   ├── asset/                  # Crypto/commodity cards and stats
│   ├── stock/                  # Stock-specific components
│   ├── holdings/               # Portfolio components
│   ├── discover/               # Homepage widgets
│   ├── watchlist/
│   ├── ai/                     # AI chat panel
│   └── ui/                     # Shared design system
├── hooks/                      # Shared React hooks
├── lib/
│   ├── ai/                     # Agent, system prompt, tool definitions
│   ├── assets/                 # Asset type utilities (slugToSymbol, inferAssetType)
│   ├── finance/                # Health score, signals, glossary
│   ├── twelvedata/             # TwelveData API client
│   ├── supabase/               # Typed Supabase clients
│   ├── security/               # Rate limiting, input validation
│   ├── currency/               # FX conversion
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
| `npm run test-ai` | Test AI analysis pipeline |
| `npm run test-signals` | Test signal generation |
| `npm run test-score` | Test health score calculation |
| `npm run trigger-cron` | Manually fire the daily cron |

---

## Scheduled Jobs

| Endpoint | Schedule (UTC) | Purpose |
|----------|---------------|---------|
| `/api/cron/update-stale-companies` | 08:00 daily | Re-ingest SEC filings for the 10 stalest companies; send filing alerts |
| `/api/cron/check-earnings-upcoming` | 08:00 daily | Email users about upcoming earnings in held/watched stocks |
| `/api/cron/check-price-moves` | 21:30 weekdays | Email on 5%+ price moves for held/watched stocks |
| `/api/cron/generate-daily-brief` | 06:30 daily | Generate AI daily brief for Pro users |
| `/api/cron/prefetch-market-data` | 05:00 daily | Pre-cache S&P 500 + NASDAQ 100 stats/financials |

All cron endpoints require the `CRON_SECRET` header. Trigger manually with `npm run trigger-cron`.

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

---

## License

Proprietary.
