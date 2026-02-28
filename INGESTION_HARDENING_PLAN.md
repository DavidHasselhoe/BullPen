# SEC Ingestion Pipeline Hardening Plan

## Objective
Harden the SEC ingestion pipeline so that:
- Only economically valid quarterly EPS can exist
- Legacy misclassified metrics are impossible
- Full historical re-ingestion (S&P 500) produces clean, fiscal-correct, split-correct datasets
- The system fails closed, not open

---

## Phase 1 — Destructive Reset (Explicitly Allowed)

### Required Actions
1. ✅ Add `ingested_at` timestamp to `financial_metrics`
2. ✅ Add hard reset utility to delete filings + metrics for company/index
3. ✅ Gate all charts behind re-ingested data only (ingested_at >= fiscal_refactor_release_date)
4. ✅ No legacy fallback rendering

**Status**: In Progress

---

## Phase 2 — Filing → Metric Contract (Tighten Semantics)

### Filing-Type Contracts

#### 10-Q
- **May produce**: Quarterly EPS, Quarterly revenue
- **Must include**: fiscal_year, fiscal_quarter, period_end_date
- **Must NOT produce**: TTM metrics, Annual metrics

#### 10-K / 20-F
- **May produce**: Annual EPS, Annual revenue
- **Must NOT produce**: Quarterly metrics

#### 6-K
- **Conditional**: Only produce metrics if filing explicitly states "Quarter Ended"
- If half-year or YTD → store as metric_type = ytd (non-chartable)
- Any violation → reject the metric

**Status**: Pending

---

## Phase 3 — EPS-Specific Invariants (Non-Negotiable)

### EPS Guardrails
- For `metric_name = 'eps'` AND `metric_type = 'quarterly'`:
  - Upper bound: value <= 1.25 (default, configurable)
  - Split enforcement: EPS must be normalized if split exists
  - One EPS per quarter: UNIQUE(company_id, fiscal_year, fiscal_quarter, accounting_basis)

**Status**: Pending

---

## Phase 4 — Stock Split Authority (Mandatory)

### Requirements
- Source splits from SEC filings (8-K / 6-K) OR authoritative market data API
- Persist in `stock_splits` table
- All EPS must pass through `applyAllSplits()` at ingest
- No split logic at render or query time
- If split data is missing → block EPS ingestion

**Status**: Pending

---

## Phase 5 — Re-Ingestion Strategy (S&P 500)

### Execution Plan
- Delete filings + metrics for each S&P 500 company
- Re-ingest filings in chronological order
- Apply fiscal calendar + splits
- Validate every metric
- Log and surface: Rejected metrics, Ambiguous 6-Ks, EPS validation failures
- Produce reconciliation report

**Status**: Pending

---

## Phase 6 — Chart Safety Layer (Final Lock)

### Safe View
```sql
CREATE VIEW safe_quarterly_eps AS
SELECT *
FROM financial_metrics
WHERE
  metric_type IN ('eps_basic', 'eps_diluted')
  AND period_type = 'quarterly'
  AND split_adjusted = true
  AND fiscal_quarter IS NOT NULL
  AND value BETWEEN 0 AND 1.25;
```

- UI components must not query base tables directly

**Status**: Pending

---

## Expected Outcome

After completion:
- ✅ NVIDIA Q4 FY2025 EPS = ~0.60 (split-adjusted)
- ✅ EPS > 1.0 post-split becomes impossible
- ✅ Fiscal/calendar mismatches are structurally blocked
- ✅ Legacy corruption is eliminated
- ✅ S&P 500 EPS charts are institution-grade

---

## Definition of Done

- [ ] All S&P 500 companies re-ingested
- [ ] No EPS validation warnings
- [ ] No mixed metric types
- [ ] No calendar-derived quarters
- [ ] No chartable legacy data
