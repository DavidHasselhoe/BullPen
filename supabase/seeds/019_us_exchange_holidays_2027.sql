-- US market holidays and early closes for 2027 (NYSE, NASDAQ).
--
-- Source: NYSE's published holiday table (nyse.com/markets/hours-calendars),
-- read 2026-09-14. Nasdaq follows the same schedule. Same row shape as the 2026
-- rows in 002_exchange_data_2026.sql.
--
-- 2027 has three observed closures, since the actual holiday falls on a
-- weekend: Juneteenth (Sat Jun 19) on Fri Jun 18, Independence Day (Sun Jul 4)
-- on Mon Jul 5, Christmas (Sat Dec 25) on Fri Dec 24. New Year's Day 2028 is a
-- Saturday and NYSE does not close for it on Fri Dec 31 2027.
--
-- The market movers crons depend on these: without them, a week ending in a
-- closure posts on the wrong day (see lib/instagram/movers-period.ts).

INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('NYSE', '2027-01-01', 'closed', NULL, 'New Year''s Day'),
('NYSE', '2027-01-18', 'closed', NULL, 'Martin Luther King Jr. Day'),
('NYSE', '2027-02-15', 'closed', NULL, 'Presidents'' Day'),
('NYSE', '2027-03-26', 'closed', NULL, 'Good Friday'),
('NYSE', '2027-05-31', 'closed', NULL, 'Memorial Day'),
('NYSE', '2027-06-18', 'closed', NULL, 'Juneteenth (observed)'),
('NYSE', '2027-07-05', 'closed', NULL, 'Independence Day (observed)'),
('NYSE', '2027-09-06', 'closed', NULL, 'Labor Day'),
('NYSE', '2027-11-25', 'closed', NULL, 'Thanksgiving'),
('NYSE', '2027-11-26', 'early_close', '13:00', 'Day after Thanksgiving'),
('NYSE', '2027-12-24', 'closed', NULL, 'Christmas Day (observed)'),
('NASDAQ', '2027-01-01', 'closed', NULL, 'New Year''s Day'),
('NASDAQ', '2027-01-18', 'closed', NULL, 'Martin Luther King Jr. Day'),
('NASDAQ', '2027-02-15', 'closed', NULL, 'Presidents'' Day'),
('NASDAQ', '2027-03-26', 'closed', NULL, 'Good Friday'),
('NASDAQ', '2027-05-31', 'closed', NULL, 'Memorial Day'),
('NASDAQ', '2027-06-18', 'closed', NULL, 'Juneteenth (observed)'),
('NASDAQ', '2027-07-05', 'closed', NULL, 'Independence Day (observed)'),
('NASDAQ', '2027-09-06', 'closed', NULL, 'Labor Day'),
('NASDAQ', '2027-11-25', 'closed', NULL, 'Thanksgiving'),
('NASDAQ', '2027-11-26', 'early_close', '13:00', 'Day after Thanksgiving'),
('NASDAQ', '2027-12-24', 'closed', NULL, 'Christmas Day (observed)')
ON CONFLICT (exchange_code, date) DO NOTHING;
