# S&P 500 Bulk Ingestion — Feasibility Evaluation

## Executive Summary

**Verdict: Yes, it's possible.** BullPen already has most of the infrastructure. The main decision is **scope** (full pipeline vs. metrics-only vs. logos-only) and **execution strategy** (batch script vs. cron vs. manual).

---

## Current State

### What You Already Have

| Component | Status | Location |
|-----------|--------|----------|
| **S&P 500 logo download** | ✅ Ready to run | `npm run download-sp500-logos` |
| **Lazy ingestion pipeline** | ✅ Full pipeline (metrics + AI + logos) | `lazyIngestCompany()` in `lib/search/lazy-ingestion.ts` |
| **Re-ingest S&P 500 script** | ⚠️ Partial — filing fetch "not yet implemented" | `scripts/re-ingest-sp500.ts` |
| **Company index bootstrap** | ✅ Populates ~12k companies from SEC | `scripts/bootstrap-company-index.ts` |
| **AI tools** | ✅ Ready — `getCompanyMetrics`, `searchCompanies`, etc. | `lib/ai/tools.ts` |

### Data Flow Today

1. **company_index** — Populated by bootstrap from SEC `company_tickers.json`. Has ticker, name, cik, `has_data`.
2. **companies** — Created when **lazy ingestion** runs for a ticker. Stores profile, logo_url, etc.
3. **Metrics** — Extracted from SEC XBRL Company Facts API during lazy ingestion (no AI for metrics).
4. **Logos** — served by the self-healing `/api/logo/[ticker]` proxy (TwelveData first, logo.dev fallback — see `lib/logos/README.md`), which uploads to Supabase Storage and updates `companies.logo_url` on first request for a ticker. `scripts/backfill-logos.ts` runs the same resolution eagerly for every company row missing a logo.

### Top Market Movers & Logos

- **Top Movers** data comes from Finnhub (symbols, prices, changes).
- **CompanyLogo** looks up `companies.logo_url` or falls back to the `/api/logo/[ticker]` proxy, which resolves and uploads to storage `company-logos/{ticker}.{ext}` on demand.
- If a mover (e.g. AMZN, NVDA) isn’t in `companies`, the logo still resolves and uploads to storage via the proxy — the `companies.logo_url` persist step is best-effort and simply no-ops until the company is ingested.

---

## Options for S&P 500 Coverage

### Option A: Logos Only (Fastest)

**Goal:** Show logos on Discover, Top Movers, etc.

**Steps:**
1. Ensure S&P 500 tickers exist in `company_index` (bootstrap covers this).
2. Run `npm run download-sp500-logos`.

**Time:** ~15–25 minutes (500 logos, batches of 10, 2s delay).  
**Cost:** Logo.dev free tier / API limits.  
**AI impact:** None — no new metrics for AI.

---

### Option B: Metrics + Logos (Recommended for AI)

**Goal:** AI can answer questions about revenue, EPS, etc. for S&P 500 companies.

**Steps:**
1. Run lazy ingestion for each S&P 500 ticker (creates companies, filings, XBRL metrics).
2. Run logo download script.

**Pipeline per company (from `lazyIngestCompany`):**
- SEC Submissions → upsert filings
- XBRL Company Facts (1 API call) → extract metrics
- Download filing text for 1× 10-K + 4× 10-Q
- AI analysis (MD&A, risk factors)
- Trends, signals, composite scores
- Logo fetch

**Time estimate:**
- SEC: 10 req/sec → ~2–5 SEC calls/company → ~30s SEC per company.
- XBRL: 1 call per company.
- AI: ~5 filings × ~10–30s each → ~1–2.5 min per company.
- **Total:** ~2–4 min per company.
- **500 companies:** ~17–33 hours if fully sequential.
- **Parallelization:** 3–5 companies in parallel with rate limiting → **~4–8 hours**.

**Costs:**
- SEC: Free.
- Logo.dev: Check plan/limits.
- OpenAI: ~500 × 5 filings × ~$0.01–0.05 ≈ **$25–125**.

---

### Option C: Metrics-Only (No AI Narrative)

**Goal:** Financial metrics for AI tools, no MD&A/risk narrative.

**Approach:** New “light ingestion” path that:
1. Fetches SEC Submissions.
2. Runs XBRL extraction.
3. Skips filing text download and AI analysis.
4. Optionally fetches logo.

**Time:** ~1–2 min per company → **~8–17 hours** for 500 companies (or ~2–4 hours with parallelism).  
**Cost:** No OpenAI.

---

## Recommendations

### For “display logos on main page”

1. Run `npm run download-sp500-logos` after ensuring S&P 500 tickers are in `company_index`.
2. Update Top Movers (and similar UIs) to resolve logos via:
   - `companies` where available, or
   - Storage at `company-logos/{ticker}.jpg` (same path logo script uses).

### For “AI can answer about every S&P 500 company”

1. Use **Option B** (full pipeline) for maximum coverage, or  
2. Use **Option C** (metrics-only) if you want metrics quickly without AI cost.
3. Run as a **batch script** (e.g. `scripts/ingest-sp500-batch.ts`) that:
   - Accepts an S&P 500 ticker list.
   - Processes companies with concurrency (e.g. 3–5) and rate limiting.
   - Logs progress and supports resume.
   - Has a dry-run mode.
4. Optionally run overnight or via cron.

---

## Technical Considerations

### Rate Limits

- **SEC EDGAR:** 10 req/sec (already handled).
- **Logo.dev:** Check docs; script uses 2s between batches.
- **OpenAI:** Account-specific; batch runs may need throttling.

### Resume / Idempotency

- Lazy ingestion checks for existing data and can skip or refresh.
- Logo script can skip companies that already have `logo_url`.

### S&P 500 Ticker List

- `download-sp500-logos.ts` has a built-in list (~200+ tickers, needs update for full 500).
- Consider maintaining a CSV or pulling from a maintained source (e.g. Wikipedia, index provider).

---

## Next Steps

1. **Immediate:** Run `npm run download-sp500-logos` to populate logos.
2. **Short-term:** Add batch ingestion script that runs `lazyIngestCompany` for S&P 500 tickers with concurrency and progress.
3. **Optional:** Implement Option C (metrics-only) for faster, cheaper bulk ingestion.
4. **UI:** Ensure Top Movers and similar components use `CompanyLogo` with logo resolution from both `companies` and storage.
