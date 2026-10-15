-- Counts behind the stock subpages, so the sitemap can leave out the thinnest
-- ones (Search Console 2026-10-15: 155 subpages "crawled, not indexed", most
-- of them a sentence and one to three rows).
--
-- Fund holders count only each active fund's latest filing, the same rule
-- /stock/[ticker]/fund-holders renders with (lib/stock/subpage-data.ts), so a
-- ticker a fund sold out of is never offered as a page that then reads "none".
-- Same shape and grants as migration 163; its functions stay for code still
-- deployed on main.

create or replace function public.congress_trade_counts_among(p_symbols text[])
returns table (symbol text, trades int)
language sql
stable
security invoker
set search_path = public
as $$
  select t.symbol, count(*)::int
  from public.congress_trades t
  where t.symbol = any (p_symbols)
  group by t.symbol;
$$;

create or replace function public.fund_holder_counts_among(p_symbols text[])
returns table (symbol text, funds int)
language sql
stable
security invoker
set search_path = public
as $$
  with latest as (
    select distinct on (f.investor_id) f.id, f.investor_id
    from public.institutional_filings f
    join public.institutional_investors i on i.id = f.investor_id
    where f.parse_status = 'ok' and i.is_active
    order by f.investor_id, f.period_of_report desc
  )
  select h.symbol, count(distinct l.investor_id)::int
  from public.institutional_holdings h
  join latest l on l.id = h.filing_id
  where h.symbol = any (p_symbols)
    and h.put_call is null
  group by h.symbol;
$$;

revoke all on function public.congress_trade_counts_among(text[]) from public, anon, authenticated;
revoke all on function public.fund_holder_counts_among(text[]) from public, anon, authenticated;
grant execute on function public.congress_trade_counts_among(text[]) to service_role;
grant execute on function public.fund_holder_counts_among(text[]) to service_role;
