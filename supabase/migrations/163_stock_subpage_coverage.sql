-- Which of a given set of tickers have congress trades / tracked-fund 13F
-- holdings. Feeds the sitemap and robots allow-list for the stock subpages
-- (/stock/[ticker]/congress-trades, /fund-holders), so empty pages are never
-- offered to crawlers.
--
-- Functions rather than selects: both tables hold far more rows than
-- PostgREST's 1000-row cap, and a plain distinct over them would be silently
-- truncated. Taking the candidate list keeps the result to at most its size.
-- Service role only: the 13F side is Pro data.

create or replace function public.congress_symbols_among(p_symbols text[])
returns table (symbol text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct t.symbol
  from public.congress_trades t
  where t.symbol = any (p_symbols);
$$;

create or replace function public.fund_symbols_among(p_symbols text[])
returns table (symbol text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct h.symbol
  from public.institutional_holdings h
  where h.symbol = any (p_symbols)
    and h.put_call is null;
$$;

revoke all on function public.congress_symbols_among(text[]) from public, anon, authenticated;
revoke all on function public.fund_symbols_among(text[]) from public, anon, authenticated;
grant execute on function public.congress_symbols_among(text[]) to service_role;
grant execute on function public.fund_symbols_among(text[]) to service_role;
