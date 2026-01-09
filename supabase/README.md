# BullPen Supabase Setup

This directory contains database migrations and seeds for the BullPen platform.

## Prerequisites

1. **Supabase CLI**: Install from [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli)
   ```bash
   npm install -g supabase
   ```

2. **Supabase Project**: Create a project at [supabase.com](https://supabase.com)

## Initial Setup

### 1. Link to Your Supabase Project

```bash
supabase link --project-ref your-project-ref
```

Get your project ref from your Supabase project settings (Project Settings > General > Reference ID).

### 2. Apply Migrations

Run the initial schema migration:

```bash
supabase db push
```

This will create all tables, indexes, and constraints defined in `migrations/001_initial_schema.sql`.

### 3. Seed Sample Data (Optional)

Populate with test companies:

```bash
supabase db seed
```

This runs all files in `supabase/seeds/` including sample tech companies.

## Database Structure

See [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) for comprehensive schema documentation.

### Tables Overview

- **companies**: Public companies tracked in BullPen
- **filings**: SEC filing documents (10-K, 10-Q, 8-K)
- **filing_sections**: Parsed sections from filings
- **financial_metrics**: Structured financial data extracted from filings
- **ai_insights**: AI-generated summaries and analysis
- **signals**: Trading and analytical signals derived from filings

## Local Development

### Start Local Supabase

```bash
supabase start
```

This starts a local Supabase instance with:
- Postgres database
- Studio UI (http://localhost:54323)
- Auth server
- Storage server

### Access Local Studio

```bash
supabase studio
```

Opens the Supabase Studio UI for local development.

### Reset Local Database

```bash
supabase db reset
```

Drops the database, reapplies migrations, and reseeds data.

## Creating New Migrations

### Generate a New Migration File

```bash
supabase migration new add_user_watchlists
```

This creates a new timestamped file in `supabase/migrations/`.

### Example: Adding a Watchlists Table

```sql
-- supabase/migrations/002_add_watchlists.sql
CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  company_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_watchlists_user_id ON watchlists(user_id);
```

### Apply New Migration

```bash
supabase db push
```

## TypeScript Types

Database types are maintained in `lib/types/database.ts` and should be kept in sync with migrations.

After schema changes, update:
1. The migration SQL file
2. The TypeScript types file
3. The DATABASE_DESIGN.md documentation

## Row Level Security (RLS)

RLS is enabled on all tables but policies are initially permissive. Configure based on your authentication requirements:

### Example: Public Read, Authenticated Write

```sql
-- Allow anyone to read companies
CREATE POLICY "public_read_companies" ON companies
  FOR SELECT USING (true);

-- Only authenticated users can create filings
CREATE POLICY "auth_create_filings" ON filings
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Service role has full access for background jobs
-- (Service role bypasses RLS by default)
```

Apply policies:

```bash
supabase db push
```

## Environment Variables

Add to your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Get these from Supabase Project Settings > API.

## Production Deployment

### Deploy to Supabase Cloud

Migrations are automatically applied when you push to your repository if you have GitHub integration enabled.

Alternatively, manually apply:

```bash
supabase db push --linked
```

### Backup Strategy

Supabase provides:
- Automatic daily backups (Pro plan)
- Point-in-time recovery (Team plan)

Manual backup:

```bash
supabase db dump > backup.sql
```

## Monitoring

- **Logs**: `supabase logs db`
- **Performance**: Monitor in Supabase Dashboard > Database > Performance
- **Storage**: Track table sizes in Studio > Table Editor

## Troubleshooting

### Migration Failed

```bash
# View migration status
supabase migration list

# Repair migration state
supabase migration repair --status applied <timestamp>
```

### Connection Issues

```bash
# Check project status
supabase status

# Restart local services
supabase stop
supabase start
```

### Reset Everything

```bash
# Nuclear option: destroy and recreate
supabase db reset --linked
```

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Postgres Documentation](https://www.postgresql.org/docs/)
- [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) - Schema details
