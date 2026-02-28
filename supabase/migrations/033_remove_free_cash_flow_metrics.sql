-- Remove free_cash_flow metrics (computed, not explicitly stated in SEC filings)
-- Per product decision: only store metrics explicitly stated in filings
DELETE FROM financial_metrics WHERE metric_type = 'free_cash_flow';

COMMENT ON TABLE financial_metrics IS 'Stores only metrics explicitly stated in SEC filings (no computed metrics like FCF)';
