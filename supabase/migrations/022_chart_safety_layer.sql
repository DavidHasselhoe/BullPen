-- Chart Safety Layer
-- Phase 6: Create safe views for chart queries
-- UI components must not query base tables directly

-- =====================================================
-- SAFE_QUARTERLY_EPS VIEW
-- =====================================================
-- Only returns quarterly EPS metrics that meet all safety criteria:
-- - Split-adjusted
-- - Has fiscal_quarter
-- - Value within acceptable bounds (0 <= value <= 1.25)
-- - Re-ingested (ingested_at >= fiscal_refactor_release_date)

CREATE OR REPLACE VIEW safe_quarterly_eps AS
SELECT 
  fm.*,
  c.ticker,
  c.name as company_name
FROM financial_metrics fm
JOIN companies c ON c.id = fm.company_id
WHERE 
  fm.metric_type IN ('eps_basic', 'eps_diluted')
  AND fm.period_type = 'quarterly'
  AND fm.split_adjusted = true
  AND fm.fiscal_quarter IS NOT NULL
  AND fm.fiscal_year IS NOT NULL
  AND fm.value >= 0
  AND fm.value <= 1.25
  AND fm.ingested_at >= '2025-01-15T00:00:00Z'::timestamptz;

COMMENT ON VIEW safe_quarterly_eps IS 'Safe quarterly EPS metrics for charting. Only includes split-adjusted, fiscally-correct, re-ingested metrics.';

-- =====================================================
-- SAFE_QUARTERLY_METRICS VIEW
-- =====================================================
-- Safe view for all quarterly metrics (not just EPS)

CREATE OR REPLACE VIEW safe_quarterly_metrics AS
SELECT 
  fm.*,
  c.ticker,
  c.name as company_name
FROM financial_metrics fm
JOIN companies c ON c.id = fm.company_id
WHERE 
  fm.period_type = 'quarterly'
  AND fm.fiscal_quarter IS NOT NULL
  AND fm.fiscal_year IS NOT NULL
  AND fm.ingested_at >= '2025-01-15T00:00:00Z'::timestamptz;

COMMENT ON VIEW safe_quarterly_metrics IS 'Safe quarterly metrics for charting. Only includes fiscally-correct, re-ingested metrics.';

-- =====================================================
-- SAFE_ANNUAL_METRICS VIEW
-- =====================================================
-- Safe view for annual metrics

CREATE OR REPLACE VIEW safe_annual_metrics AS
SELECT 
  fm.*,
  c.ticker,
  c.name as company_name
FROM financial_metrics fm
JOIN companies c ON c.id = fm.company_id
WHERE 
  fm.period_type = 'annual'
  AND fm.fiscal_year IS NOT NULL
  AND fm.fiscal_quarter IS NULL
  AND fm.ingested_at >= '2025-01-15T00:00:00Z'::timestamptz;

COMMENT ON VIEW safe_annual_metrics IS 'Safe annual metrics for charting. Only includes fiscally-correct, re-ingested metrics.';

-- =====================================================
-- INDEXES FOR VIEWS
-- =====================================================
-- Views use indexes on underlying tables, but we can add covering indexes if needed
-- The existing indexes on financial_metrics should be sufficient
