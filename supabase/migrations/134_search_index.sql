-- Search index: the client-side symbol catalogue behind instant search.
--
-- Separate from screener_universe on purpose. That table drives which tickers
-- the screener refresh crons fetch stats for, so adding ~11k ETFs to it would
-- quietly multiply that job's TwelveData spend. This table is read-only
-- reference data for search and nothing iterates it per-ticker.
--
-- Refreshed weekly by /api/cron/refresh-search-index from TwelveData's /stocks
-- and /etf reference lists.

create table if not exists search_index (
  ticker      text primary key,
  name        text not null,
  -- 's' = stock/ADR/REIT, 'e' = ETF. One character because this ships to the
  -- browser as a text payload where every byte is multiplied by ~17k rows.
  kind        char(1) not null,
  exchange    text,
  -- 0-99 popularity used to break ties at query time, precomputed here so the
  -- client never has to. Market-cap magnitude for stocks, heuristic for ETFs.
  rank        smallint not null default 0,
  updated_at  timestamptz not null default now()
);

-- The read endpoint pulls every row ordered by rank; this keeps that a scan of
-- the index rather than a sort of the whole table.
create index if not exists search_index_rank_idx on search_index (rank desc);

alter table search_index enable row level security;

-- Public reference data: readable by anyone, writable only by the service role
-- (the refresh cron). No policy for insert/update/delete means no client can.
drop policy if exists "search_index readable by all" on search_index;
create policy "search_index readable by all" on search_index for select using (true);
