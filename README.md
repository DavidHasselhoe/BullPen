# BullPen

A stock research and portfolio web app: live market data, company and financial views, optional SEC filing / XBRL tooling, AI-assisted insights, and community features.

## Features

- **Market data** – Quotes, candles, calendars, screeners, and more (Twelve Data as the primary provider; Finnhub available for news and fallbacks)
- **Stock pages** – Prices, charts, technical indicators, financial health, press releases, insider activity, company profiles
- **Portfolio** – Manual holdings or **SnapTrade**-connected brokerages with live quotes and performance views
- **Social** – Public profiles, follows, watchlists, stock theses
- **SEC / XBRL (where used)** – Filing ingestion (10-K, 10-Q, 8-K), structured metrics extraction, AI summaries and composite-style signals
- **Charts & UX** – D3 / Recharts visualizations, adaptive experience levels, internationalization (i18n)

## Tech stack

| Area | Technology |
|------|------------|
| **Framework** | [Next.js](https://nextjs.org) 16 (App Router), [React](https://react.dev) 19 |
| **Language** | [TypeScript](https://www.typescriptlang.org) (strict mode) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com) 4 |
| **Data & auth** | [Supabase](https://supabase.com) – Postgres, Auth, Storage; [`@supabase/ssr`](https://supabase.com/docs/guides/auth/server-side/nextjs) for cookie-based sessions |
| **Client data** | [TanStack Query](https://tanstack.com/query) (React Query) |
| **Validation** | [Zod](https://zod.dev) |
| **UI** | [Radix UI](https://www.radix-ui.com) primitives, [Framer Motion](https://www.framer.com/motion/), [Lucide](https://lucide.dev) icons |
| **Charts** | [D3](https://d3js.org), [Recharts](https://recharts.org), [Lightweight Charts](https://www.tradingview.com/lightweight-charts/) |
| **AI** | [Vercel AI SDK](https://sdk.vercel.ai/docs) / [`ai`](https://www.npmjs.com/package/ai), OpenAI-compatible providers |
| **Email** | [Resend](https://resend.com) |
| **Limits / cache** | [Upstash](https://upstash.com) Redis (rate limiting, etc.) |
| **Web3 (optional)** | [wagmi](https://wagmi.sh), [viem](https://viem.sh) |
| **Brokerage OAuth** | [SnapTrade](https://snaptrade.com) TypeScript SDK |
| **i18n** | [i18next](https://www.i18next.com), [react-i18next](https://react.i18next.com) |
| **Analytics** | [Vercel Analytics](https://vercel.com/analytics), [Speed Insights](https://vercel.com/docs/speed-insights) |

**External APIs (typical)** – `TWELVE_DATA_API_KEY` (primary market data), `FINNHUB_API_KEY` (news / fallbacks), `OPENAI_API_KEY`, optional `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY` for brokerage linking.

## Getting started

### Prerequisites

- **Node.js** 20+ (recommended; project uses modern Next.js / React)
- **npm** (or pnpm / yarn / bun)

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create `.env.local` in the project root. **[ENV_SETUP.md](./ENV_SETUP.md)** has the full variable list and explanations.

**Commonly required for local dev:**

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `TWELVE_DATA_API_KEY` and/or `FINNHUB_API_KEY` (see ENV guide)
- `CRON_SECRET`, `RESEND_API_KEY` (as needed for those features)

### 3. Database

Apply Supabase migrations (see [SCHEMA_SETUP.md](./SCHEMA_SETUP.md) if you need context):

```bash
npx supabase db push
```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
BullPen/
├── app/                 # Next.js App Router (pages, layouts, API routes)
│   ├── api/             # Route handlers (REST, server logic)
│   ├── stock/[ticker]/  # Stock detail
│   ├── holdings/        # Portfolio
│   └── ...
├── components/          # React components (by domain)
├── hooks/               # Shared React hooks
├── lib/                 # Clients, helpers, Twelvedata, Supabase, currency, etc.
├── scripts/             # CLI utilities and one-off tasks
└── supabase/            # SQL migrations
```

## Key scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |

See `package.json` for ingestion tests, cron triggers, logo scripts, and other tooling.

## Deployment

### Vercel (recommended)

1. Connect the Git repository to Vercel  
2. Configure environment variables (Production / Preview) to match **[ENV_SETUP.md](./ENV_SETUP.md)**  
3. Deploy  

Cron jobs and platform settings are described in **ENV_SETUP.md** and **`vercel.json`** where applicable.

## Documentation

- [ENV_SETUP.md](./ENV_SETUP.md) – Environment variables and services  
- [SCHEMA_SETUP.md](./SCHEMA_SETUP.md) – Database setup  
- [supabase/README.md](./supabase/README.md) – Supabase notes  

## License

Proprietary.
