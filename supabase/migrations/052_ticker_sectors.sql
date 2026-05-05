-- Lightweight sector cache for any ticker symbol.
-- Stores TwelveData-resolved sectors for tickers that may not have a full
-- row in the companies table (e.g. recent IPOs, foreign ADRs).
create table if not exists ticker_sectors (
  ticker text primary key,
  sector text not null,
  updated_at timestamptz not null default now()
);
