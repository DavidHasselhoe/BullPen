-- Extend companies.logo_source to allow 'logo.dev' as a fallback source
-- alongside the existing TwelveData-backed 'brand' value.

ALTER TABLE companies DROP CONSTRAINT companies_logo_source_check;

ALTER TABLE companies
ADD CONSTRAINT companies_logo_source_check
CHECK (logo_source IN ('brand', 'logo.dev', 'wikipedia', 'manual'));

COMMENT ON COLUMN companies.logo_source IS 'Source of logo: brand (TwelveData), logo.dev (fallback), wikipedia, or manual upload';
