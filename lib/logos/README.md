# Logo System

Fetches, stores, and serves company logos. Live traffic is served entirely by the
self-healing proxy at `app/api/logo/[ticker]/route.ts`; the files in this directory
are the building blocks it (and the backfill scripts) share.

## Architecture

Resolution order, on a cache miss:

1. **TwelveData `/logo`** (`getLogoUrl()` in `lib/twelvedata/twelvedata-client.ts`) — tried
   first. The metadata call can return a URL whose CDN entry doesn't actually resolve, so
   the response is downloaded and validated (real `image/*` content-type, non-empty body)
   before it's trusted. If it validates, resolution stops here.
2. **logo.dev ticker API** (`https://img.logo.dev/ticker/{TICKER}`) — only tried when step 1
   fails to produce a real image. Requested with `fallback=404` so an unmapped ticker comes
   back as a real miss instead of a generated monogram placeholder that would otherwise pass
   the image-content-type check.

Whichever source resolves is downloaded once and:

1. **Logo Storage** (`logos-storage.ts`)
   - Uploads the image to Supabase Storage bucket `company-logos`
   - Generates the public URL for the stored logo
   - Removes any other-extension object for the same ticker so a source/format change
     across runs never leaves an orphaned duplicate in the bucket

2. **Logo Database** (`logos-db.ts`)
   - Persists `logo_url` / `logo_source` (`'brand'` for TwelveData, `'logo.dev'` for the
     fallback) / `logo_updated_at` on the `companies` row, when one exists
   - Queries for companies needing logos (`getCompaniesNeedingLogos`)

3. **Logo Manifest** (`logo-manifest.ts`)
   - Reads bucket contents to let calendar/grid views emit a direct storage URL up front
     instead of paying the `/api/logo` redirect round trip per tile

## Configuration

- API Key: `LOGO_DEV_KEY` (server-only — never prefix with `NEXT_PUBLIC_`, it has no rate
  limiting of its own to protect otherwise)
- Storage Bucket: `company-logos` (public read)
- File Naming: `{ticker}.{extension}` (e.g. `nvda.png`), lowercased

## Constraints

- No client ever calls TwelveData or logo.dev directly — everything goes through
  `/api/logo/[ticker]`, which is the only thing that writes to the bucket/DB on the
  live request path
- Graceful fallback to ticker initials in `<CompanyLogo>` if both sources miss
- Non-fatal: logo failures never block ingestion or page rendering
