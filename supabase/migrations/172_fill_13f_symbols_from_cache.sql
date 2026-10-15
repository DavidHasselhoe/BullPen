-- Copies a resolved ticker from cusip_ticker_map onto every 13F holding that
-- still has none.
--
-- Found 2026-10-15: Citadel's latest filing had 13,498 of 13,575 holdings
-- without a symbol, Renaissance 2,835 of 3,140, while cusip_ticker_map already
-- knew 5,252 of them. The resolver read the cache in one .in() over every CUSIP
-- in the filing, which PostgREST caps at 1000 rows, so a big fund saw only part
-- of its own cache (fixed in lib/institutions/resolve-cusip.ts). And a filing
-- is never re-read once ingested, so a CUSIP resolved later (by another fund,
-- or next quarter) never reached the rows stored before it. The weekly sync now
-- calls this to close that gap; it is a no-op once everything is filled.
--
-- Service role only, like the other 13F functions (holdings are Pro data).

create or replace function public.fill_13f_symbols_from_cache()
returns integer
language sql
volatile
security invoker
set search_path = public
as $$
  with filled as (
    update public.institutional_holdings h
    set symbol = m.symbol
    from public.cusip_ticker_map m
    where h.symbol is null
      and m.cusip = h.cusip
      and m.symbol is not null
    returning 1
  )
  select count(*)::int from filled;
$$;

revoke all on function public.fill_13f_symbols_from_cache() from public, anon, authenticated;
grant execute on function public.fill_13f_symbols_from_cache() to service_role;
