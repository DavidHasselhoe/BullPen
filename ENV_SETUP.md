# Environment Setup Guide

## Create .env.local File

The `.env.local` file contains your Supabase credentials and is **not tracked by git** (for security).

### Step 1: Get Your Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your BullPen project
3. Go to **Settings** → **API**
4. You'll see:
   - **Project URL** (e.g., `https://abcdefghijklmnop.supabase.co`)
   - **anon public** key (starts with `eyJ...`)
   - **service_role** key (starts with `eyJ...`)

### Step 2: Create .env.local

In your project root (`C:\BullPen\`), create a file named `.env.local` with this content:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI Configuration (required for AI analysis)
OPENAI_API_KEY=sk-...your-openai-api-key

# Market Data: use either Twelve Data or Finnhub
# When TWELVE_DATA_API_KEY is set, Twelve Data is used for quotes, candles, movers, earnings.
# When not set, Finnhub is used. News always uses Finnhub (Twelve Data has no news).
TWELVE_DATA_API_KEY=                    # Optional: Twelve Data API key (twelvedata.com) — enables full historical charts
FINNHUB_API_KEY=your-finnhub-api-key    # Required for news; also fallback for price data when Twelve Data key is not set

# Cron Job Secret (required for autonomous filing updates)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRON_SECRET=your-random-secret-here

# Resend (required for sending emails)
# Get your API key at https://resend.com/api-keys
RESEND_API_KEY=re_your_key_here

# Logo.dev (required for company logo fetching) — server-only, never use NEXT_PUBLIC_
# Get your API key at https://logo.dev
LOGO_DEV_KEY=your-logo-dev-key

# Optional: override default sender (default: BullPen <hello@updates.bullpen.no>)
# RESEND_FROM_EMAIL=BullPen <noreply@updates.bullpen.no>

# Optional: app URL for email links (default: https://bullpen.no)
# NEXT_PUBLIC_APP_URL=https://bullpen.no
```

### Step 3: Get Market Data API Key(s)

**Option A: Twelve Data (recommended for full historical charts)**  
1. Go to [Twelve Data](https://twelvedata.com)
2. Sign up (free Basic tier: 8 req/min for testing)
3. Get your API key from the dashboard
4. Add `TWELVE_DATA_API_KEY=your-key` to `.env.local`  
When set, Twelve Data is used for quotes, candles, movers, earnings, recommendations. Full historical data (40+ years daily).

**Option B: Finnhub (required for news; fallback when Twelve Data key not set)**  
1. Go to [Finnhub](https://finnhub.io)
2. Sign up for a free account
3. Go to **Dashboard** → **API Key**
4. Add `FINNHUB_API_KEY=your-key` to `.env.local`  
Used for: market news, company news. Also powers price data when `TWELVE_DATA_API_KEY` is not set.

### Step 4: Get OpenAI API Key (for AI Analysis)

1. Go to [OpenAI Platform](https://platform.openai.com)
2. Sign up or log in
3. Go to **API keys** → **Create new secret key**
4. Copy the key (starts with `sk-...`)
5. **Important**: Store it securely - you won't be able to see it again

### Step 5: Replace Placeholder Values

- Replace `https://your-project-ref.supabase.co` with your **Project URL**
- Replace the first `eyJ...` with your **anon** key
- Replace the second `eyJ...` with your **service_role** key
- Replace `sk-...your-openai-api-key` with your **OpenAI API key**
- Replace `your-finnhub-api-key` with your **Finnhub API key**
- Replace `re_xxxxxxxxx` with your **Resend API key** (get it at [resend.com/api-keys](https://resend.com/api-keys))

### Windows PowerShell Method

You can create the file using PowerShell:

```powershell
# Create .env.local file
@"
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
"@ | Out-File -FilePath .env.local -Encoding utf8
```

Then edit `.env.local` in your code editor and paste in your actual credentials.

### VS Code / Cursor Method

1. In the file explorer, right-click on the `BullPen` folder
2. Select **New File**
3. Name it `.env.local`
4. Paste the template content
5. Replace with your actual Supabase values

### Verify Setup

After creating `.env.local`, verify it works:

```bash
# Start Next.js dev server
npm run dev

# In another terminal, check if env vars are loaded
node -e "require('dotenv').config({ path: '.env.local' }); console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"
```

## Security Notes

⚠️ **IMPORTANT**:

- `.env.local` is already in `.gitignore` - never commit it!
- The `NEXT_PUBLIC_*` variables are exposed to the browser (safe for anon key)
- The `SUPABASE_SERVICE_ROLE_KEY` is server-side only (never expose to client)
- The service role key bypasses Row Level Security - use with caution

## Troubleshooting

### Error: "Missing Supabase environment variables"

This means `.env.local` is not being loaded. Check:

1. File is named exactly `.env.local` (not `.env.local.txt`)
2. File is in project root (`C:\BullPen\.env.local`)
3. Restart Next.js dev server after creating the file

### Error: "Invalid credentials"

Your keys may be incorrect. Verify:

1. Keys are copied completely (they're very long, ~300+ characters)
2. No extra spaces or newlines
3. Using the correct project's keys

### Check if File Exists

```powershell
# Windows PowerShell
Test-Path .env.local
# Should return: True
```

```bash
# Git Bash / WSL
ls -la .env.local
# Should show the file
```

## Autonomous Filing Updates (Cron Job)

BullPen includes a Vercel Cron Job that automatically re-ingests company data whenever the SEC publishes a new quarterly or annual report.

### How it works

- `vercel.json` schedules `/api/cron/update-stale-companies` to run **daily at 08:00 UTC**
- Each run checks the 10 most-stale tracked companies for new 10-K / 10-Q / 20-F filings
- If a new filing is detected, the XBRL pipeline re-runs automatically (15–30 seconds per company)
- Upgrade to Vercel Pro to run the cron **hourly** by changing the schedule in `vercel.json` to `0 * * * *`

### Setting up CRON_SECRET

`CRON_SECRET` protects the cron endpoint from being called by anyone other than Vercel.

**Generate a secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Add to local `.env.local`:**
```env
CRON_SECRET=your-64-char-hex-string
```

**Add to Vercel:**
1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add `CRON_SECRET` with the same value
3. Vercel will automatically send `Authorization: Bearer <CRON_SECRET>` when invoking cron jobs

### Manual trigger (development)

You can test the cron locally by calling it with the secret:
```bash
curl -H "Authorization: Bearer your-secret" http://localhost:3000/api/cron/update-stale-companies
```

### Staleness threshold

Companies are also auto-refreshed on the **next user page visit** if their data is older than **45 days**, regardless of whether the cron job has run. This ensures users always see current data even if the cron has not yet processed their company.

## Next Steps

Once `.env.local` is created and configured:

1. Install dependencies: `npm install`
2. Apply database schema: `supabase db push` (if not done already)
3. Test ingestion: `npm run test-ingest:latest 0000320193 10-K`

---

**Template file**: `.env.local.template` (copy this to `.env.local`)
