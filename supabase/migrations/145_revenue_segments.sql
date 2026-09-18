-- Revenue parts for the Sankey diagram's left edge, read from SEC XBRL.
--
-- One row per ticker and period, holding the parts as JSONB because they are
-- always read and written whole. `parts` is NULL when the filing was read
-- successfully and simply has no breakdown worth showing (geography only, or
-- a single bucket): that is a real answer and is cached so a multi-megabyte
-- instance document is not downloaded again to rediscover it.
--
-- Replaces company_revenue_segments, dropped by migration 038. The old shape
-- carried a per-row confidence and an 'ai_extracted' source for a planned
-- model-based extraction; neither is needed, because every figure here is
-- machine-tagged in the filing and is either exact or refused.
create table if not exists public.revenue_segments (
  ticker         text        not null,
  period_end     date        not null,
  form           text        not null,
  accession      text        not null,
  basis          text,
  parts          jsonb,
  total          numeric,
  checked_at     timestamptz not null default now(),
  primary key (ticker, period_end)
);

comment on column public.revenue_segments.parts is
  'Ordered [{label, value}] summing to the period revenue within 1%, or NULL when the filing has no breakdown worth showing.';

comment on column public.revenue_segments.basis is
  'product or segment. NULL alongside a NULL parts, meaning nothing worth showing.';

create index if not exists revenue_segments_ticker_idx
  on public.revenue_segments (ticker, period_end desc);

alter table public.revenue_segments enable row level security;

-- Written only by the service role, which bypasses RLS. Readable by anyone:
-- this is public filing data, same as the other market-data caches here.
drop policy if exists revenue_segments_read on public.revenue_segments;
create policy revenue_segments_read on public.revenue_segments
  for select using (true);
