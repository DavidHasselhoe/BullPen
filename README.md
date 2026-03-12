# BullPen

A financial analysis platform that ingests SEC filings (10-K, 10-Q, 8-K), extracts structured metrics from XBRL, and provides AI-powered insights for stock research.

## Features

- **SEC Filing Ingestion** – Automatic ingestion of 10-K, 10-Q, and 8-K filings from EDGAR
- **XBRL Metrics Extraction** – Revenue, EPS, cash flow, and other financial metrics from structured data
- **AI Analysis** – Narrative summaries, risk factors, MD&A insights via OpenAI
- **Composite Scores** – Bullish/bearish signals with strength scoring
- **Time-Series Charts** – Quarterly and annual financial metrics visualization
- **Company Profiles** – Sector, industry, fiscal year end, employee count
- **Earnings Calendar** – SEC-reported and Finnhub earnings dates
- **User Holdings** – Portfolio tracking with live quotes

## Tech Stack

- **Next.js 15** (App Router)
- **Supabase** – Postgres database, auth, storage
- **OpenAI** – AI analysis and embeddings
- **Finnhub** – Market data, quotes, news

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create `.env.local` in the project root. See [ENV_SETUP.md](./ENV_SETUP.md) for a detailed guide.

**Required variables:**
- `NEXT_PUBLIC_SUPABASE_URL` – Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` – Supabase service role key
- `OPENAI_API_KEY` – OpenAI API key
- `FINNHUB_API_KEY` – Finnhub API key
- `CRON_SECRET` – Secret for cron/auth endpoints
- `RESEND_API_KEY` – Resend for emails

### 3. Database Setup

Apply the Supabase schema and migrations. See [SCHEMA_SETUP.md](./SCHEMA_SETUP.md) for details.

```bash
supabase db push
```

### 4. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
BullPen/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   ├── stock/[ticker]/     # Stock detail page
│   └── ...
├── components/             # React components
├── lib/                    # Shared logic
│   ├── ingestion/          # Filing ingestion pipeline
│   ├── metrics/            # Financial metrics & charts
│   ├── logos/              # Company logo fetching
│   ├── search/             # Search & lazy ingestion
│   └── utils/              # Logger, helpers
├── scripts/                # CLI tools (ingestion, tests)
└── supabase/               # Migrations, schema
```

## Key Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npx tsx scripts/test-ingestion.ts` | Test ingestion pipeline |
| `npx tsx scripts/extract-all-metrics.ts <TICKER>` | Extract XBRL metrics for a company |

## Deployment

### Vercel (recommended)

1. Connect your repo to Vercel
2. Add environment variables (Settings → Environment Variables)
3. Deploy

The app includes a Vercel cron job (`vercel.json`) that runs `/api/cron/update-stale-companies` daily to refresh stale company data.

### Staleness & Background Ingestion

- Companies are auto-refreshed when their data is older than **45 days**
- Lazy ingestion runs on first visit or via cron
- See [ENV_SETUP.md](./ENV_SETUP.md) for cron setup details

## Documentation

- [ENV_SETUP.md](./ENV_SETUP.md) – Environment variables and configuration
- [SCHEMA_SETUP.md](./SCHEMA_SETUP.md) – Database schema and setup
- [supabase/README.md](./supabase/README.md) – Supabase-specific docs

## License

Proprietary.
