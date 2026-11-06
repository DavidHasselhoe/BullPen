-- Level alerts (price above/below, near the 52-week high/low) fire once when the
-- price crosses the level, then wait until it crosses back before they can fire
-- again. Before this they re-fired every 24h for as long as the price stayed
-- past the level (one "below" alert fired 28 times). check-user-alerts sets
-- armed = false when it fires and true again once the condition is false.
-- Additive with a default: code that doesn't know the column is unaffected.
alter table public.user_alerts add column if not exists armed boolean not null default true;
