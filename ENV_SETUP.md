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

# Finnhub Configuration (required for market data)
FINNHUB_API_KEY=your-finnhub-api-key
```

### Step 3: Get Finnhub API Key (for Market Data)

1. Go to [Finnhub](https://finnhub.io)
2. Sign up for a free account
3. Go to **Dashboard** → **API Key**
4. Copy your API key
5. Add it to `.env.local` as `FINNHUB_API_KEY`

**Note**: The free tier includes:
- 60 API calls per minute
- Market news
- Stock quotes
- Company news

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

## Next Steps

Once `.env.local` is created and configured:

1. Install dependencies: `npm install`
2. Apply database schema: `supabase db push` (if not done already)
3. Test ingestion: `npm run test-ingest:latest 0000320193 10-K`

---

**Template file**: `.env.local.template` (copy this to `.env.local`)
