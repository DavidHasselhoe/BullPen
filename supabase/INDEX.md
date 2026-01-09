# BullPen Database Schema - Documentation Index

## 📚 Quick Navigation

### Getting Started
1. **[README.md](./README.md)** - Start here for setup instructions
2. **[../SCHEMA_SETUP.md](../SCHEMA_SETUP.md)** - Quick-start guide and installation steps

### Understanding the Schema
3. **[DATABASE_DESIGN.md](./DATABASE_DESIGN.md)** - Comprehensive design documentation
4. **[SCHEMA_DIAGRAM.md](./SCHEMA_DIAGRAM.md)** - Visual diagrams and query patterns

### Implementation Files
- **[migrations/001_initial_schema.sql](./migrations/001_initial_schema.sql)** - SQL migration file
- **[seeds/001_sample_companies.sql](./seeds/001_sample_companies.sql)** - Sample data
- **[../lib/types/database.ts](../lib/types/database.ts)** - TypeScript types
- **[../lib/supabase/client.ts](../lib/supabase/client.ts)** - Supabase client utilities

## 📖 Documentation Guide

### For Project Setup
Read in this order:
1. SCHEMA_SETUP.md - Overview and installation
2. README.md - Detailed setup commands
3. Test with sample seed data

### For Understanding Schema
Read in this order:
1. SCHEMA_DIAGRAM.md - Visual overview
2. DATABASE_DESIGN.md - Detailed table descriptions
3. migrations/001_initial_schema.sql - Actual SQL

### For Development
Reference these files:
- lib/types/database.ts - Type definitions
- lib/supabase/client.ts - Client utilities
- DATABASE_DESIGN.md - Query patterns

## 🎯 Key Features

### Tables (6)
- ✅ companies - Company master data
- ✅ filings - SEC filing documents
- ✅ filing_sections - Parsed filing sections
- ✅ financial_metrics - Structured financial data
- ✅ ai_insights - AI-generated analysis
- ✅ signals - Trading/analytical signals

### Data Types
- ✅ Custom ENUMs for type safety
- ✅ JSONB for flexible metadata
- ✅ UUID primary keys
- ✅ Timestamps with auto-update triggers

### Relationships
- ✅ Foreign keys with CASCADE
- ✅ Compound indexes for performance
- ✅ Unique constraints for data integrity

### Features
- ✅ Row Level Security enabled
- ✅ Automatic timestamp updates
- ✅ Processing status tracking
- ✅ Model versioning for AI outputs
- ✅ Signal strength scoring

## 🔧 Common Tasks

### View All Tables
```sql
\dt
```

### Describe a Table
```sql
\d companies
\d filings
\d signals
```

### Check Indexes
```sql
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public';
```

### Sample Queries

**Get company with recent filings**:
```sql
SELECT c.*, 
  COUNT(f.id) as filing_count,
  MAX(f.filing_date) as latest_filing
FROM companies c
LEFT JOIN filings f ON f.company_id = c.id
WHERE c.ticker = 'AAPL'
GROUP BY c.id;
```

**Get active signals**:
```sql
SELECT s.*, c.ticker, c.name
FROM signals s
JOIN companies c ON c.id = s.company_id
WHERE s.is_active = true
ORDER BY s.strength DESC;
```

## 📊 Schema Statistics

- **6 main tables** with clear relationships
- **8 ENUM types** for constrained values
- **20+ indexes** for query optimization
- **Full TypeScript coverage** with type-safe client
- **Audit trail** with timestamps and model versions
- **JSONB fields** for extensibility

## 🚀 Next Steps After Setup

1. **Configure RLS policies** based on auth requirements
2. **Build ingestion pipeline** for SEC filings
3. **Implement AI analysis** for insights generation
4. **Create signal generation** logic
5. **Build dashboard UI** to display data

## 💡 Design Principles

✅ **Normalized** - No data duplication  
✅ **Type-safe** - Full TypeScript types  
✅ **Performant** - Strategic indexing  
✅ **Auditable** - Timestamps and versioning  
✅ **Flexible** - JSONB for extensibility  
✅ **Secure** - RLS enabled  
✅ **Future-proof** - Extensible ENUMs  

## 📞 Support Resources

- [Supabase Docs](https://supabase.com/docs)
- [Postgres Docs](https://www.postgresql.org/docs/)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)

## 🔄 Schema Version

**Current Version**: 1.0.0  
**Last Migration**: 001_initial_schema.sql  
**Created**: 2026-01-08  

---

**Ready to deploy!** Follow the setup guide in README.md to get started.
