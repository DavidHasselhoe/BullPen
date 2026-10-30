-- Earnings-results emails for visitors without an account: "Get Micron's
-- results the morning after". One row per (email, symbol). Double opt-in:
-- nothing is sent until confirmed_at is set by the link in the confirm email.
-- `token` doubles as the confirm and unsubscribe key. Service role only.

create table if not exists public.email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  symbol text not null,
  token uuid not null unique default gen_random_uuid(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  -- Report date of the last results email sent, so each report goes out once.
  last_sent_date date,
  created_at timestamptz not null default now(),
  unique (email, symbol)
);

create index if not exists email_subscriptions_symbol_live
  on public.email_subscriptions (symbol)
  where confirmed_at is not null and unsubscribed_at is null;

alter table public.email_subscriptions enable row level security;
