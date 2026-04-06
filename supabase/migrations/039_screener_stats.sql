-- Screener statistics cache
-- Populated by /api/screener/refresh from TwelveData /statistics endpoint
-- Acts as the data layer for the stock screener; avoids repeated expensive API calls.

create table if not exists screener_stats (
  ticker              text primary key,
  name                text not null,
  sector              text,
  industry            text,
  logo_url            text,
  exchange            text,
  currency            text default 'USD',

  -- Valuation
  market_cap          bigint,
  pe_ratio            real,
  forward_pe          real,
  pb_ratio            real,
  ps_ratio            real,
  ev_to_ebitda        real,

  -- Growth & profitability
  eps_ttm             real,
  revenue_ttm         bigint,
  profit_margin       real,      -- 0..1
  revenue_growth_yoy  real,      -- percent
  earnings_growth_yoy real,      -- percent

  -- Risk & income
  beta                real,
  dividend_yield      real,      -- percent
  payout_ratio        real,      -- percent

  -- Price
  week52_high         real,
  week52_low          real,
  day50_ma            real,
  day200_ma           real,

  updated_at          timestamptz not null default now()
);

-- Allow all authenticated users to read; only the service-role key (backend) can write
alter table screener_stats enable row level security;

create policy "screener_stats_read" on screener_stats
  for select using (true);

-- Index for common filter patterns
create index if not exists screener_stats_sector_idx   on screener_stats (sector);
create index if not exists screener_stats_market_cap   on screener_stats (market_cap desc nulls last);
create index if not exists screener_stats_updated_at   on screener_stats (updated_at);
