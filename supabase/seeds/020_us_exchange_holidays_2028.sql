-- US market holidays and early closes for 2028 (NYSE, NASDAQ).
--
-- Source: NYSE's published holiday table (nyse.com/markets/hours-calendars),
-- read 2026-09-16. Nasdaq follows the same schedule. Same row shape as the 2027
-- rows in 019_us_exchange_holidays_2027.sql.
--
-- 2028 has no New Year's Day closure: Jan 1 2028 is a Saturday, and NYSE does
-- not observe it on the preceding Friday because that Friday falls in 2027.
-- Every other holiday lands on a weekday, so there are no observed closures.
--
-- Two early closes: Mon Jul 3 (day before Independence Day, which is a Tuesday)
-- and Fri Nov 24 (day after Thanksgiving). There is no Christmas Eve early
-- close, since Dec 24 2028 is a Sunday.
--
-- The July 3 row was missing from the first read of NYSE's page and only turned
-- up on a second, early-close-specific read. Same failure as Jul 5 2027 during
-- the 2027 seed. Read the page twice before trusting a year is complete.
--
-- The market movers crons depend on these: without them, a week ending in a
-- closure posts on the wrong day (see lib/instagram/movers-period.ts).

INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('NYSE', '2028-01-17', 'closed', NULL, 'Martin Luther King Jr. Day'),
('NYSE', '2028-02-21', 'closed', NULL, 'Presidents'' Day'),
('NYSE', '2028-04-14', 'closed', NULL, 'Good Friday'),
('NYSE', '2028-05-29', 'closed', NULL, 'Memorial Day'),
('NYSE', '2028-06-19', 'closed', NULL, 'Juneteenth'),
('NYSE', '2028-07-03', 'early_close', '13:00', 'Independence Day Eve'),
('NYSE', '2028-07-04', 'closed', NULL, 'Independence Day'),
('NYSE', '2028-09-04', 'closed', NULL, 'Labor Day'),
('NYSE', '2028-11-23', 'closed', NULL, 'Thanksgiving'),
('NYSE', '2028-11-24', 'early_close', '13:00', 'Day after Thanksgiving'),
('NYSE', '2028-12-25', 'closed', NULL, 'Christmas Day'),
('NASDAQ', '2028-01-17', 'closed', NULL, 'Martin Luther King Jr. Day'),
('NASDAQ', '2028-02-21', 'closed', NULL, 'Presidents'' Day'),
('NASDAQ', '2028-04-14', 'closed', NULL, 'Good Friday'),
('NASDAQ', '2028-05-29', 'closed', NULL, 'Memorial Day'),
('NASDAQ', '2028-06-19', 'closed', NULL, 'Juneteenth'),
('NASDAQ', '2028-07-03', 'early_close', '13:00', 'Independence Day Eve'),
('NASDAQ', '2028-07-04', 'closed', NULL, 'Independence Day'),
('NASDAQ', '2028-09-04', 'closed', NULL, 'Labor Day'),
('NASDAQ', '2028-11-23', 'closed', NULL, 'Thanksgiving'),
('NASDAQ', '2028-11-24', 'early_close', '13:00', 'Day after Thanksgiving'),
('NASDAQ', '2028-12-25', 'closed', NULL, 'Christmas Day')
ON CONFLICT (exchange_code, date) DO NOTHING;
