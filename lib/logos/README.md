# Logo System

Fetches, stores, and serves company logos using the img.logo.dev API.

## Architecture

1. **Logo Fetcher** (`logo-fetcher.ts`)
   - Fetches logos from img.logo.dev API
   - Returns image buffer and mime type

2. **Logo Storage** (`logos-storage.ts`)
   - Uploads logos to Supabase Storage bucket `company-logos`
   - Generates public URLs for stored logos

3. **Logo Database** (`logos-db.ts`)
   - Updates company records with logo URLs and metadata
   - Queries for companies needing logos

4. **Logo Orchestrator** (`logos-orchestrator.ts`)
   - Coordinates the full pipeline: fetch → store → update DB

## Configuration

- API Key: `LOGO_DEV_KEY` (server-only, from `.env.local`)
- Storage Bucket: `company-logos` (must be created in Supabase Dashboard)
- File Naming: `{ticker}.{extension}` (e.g., `nvda.png`)

## Usage

Logos are automatically fetched during company ingestion via `lazyIngestCompany()`.

To manually fetch logos:

```typescript
import { ingestCompanyLogo } from '@/lib/logos/logos-orchestrator';

const result = await ingestCompanyLogo(ticker, companyName, companyId);
```

## Database Schema

Companies table includes:
- `logo_url`: Public URL to stored logo
- `logo_source`: 'brand' | 'wikipedia' | 'manual' | null
- `logo_updated_at`: Timestamp of last update

## Constraints

- Logos are fetched from img.logo.dev API
- Logos are permanently cached in Supabase Storage
- No runtime external fetches (all logos are pre-cached)
- Graceful fallback to ticker initials if logo unavailable
- Non-fatal: Logo failures don't block ingestion pipeline
