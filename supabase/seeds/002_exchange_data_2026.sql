-- Exchange Data Seed - 2026
-- Trading hours and holiday calendars for major exchanges
-- Source: https://www.nordnet.no/no/marked/borsens-apningstider

-- =====================================================
-- EXCHANGES - Regular Trading Hours (Local Timezone)
-- =====================================================

INSERT INTO public.exchanges (code, name, country, timezone, open_time, close_time) VALUES
-- Nordic Exchanges
('OSE', 'Oslo Børs', 'NO', 'Europe/Oslo', '09:00', '16:25'),
('STO', 'Stockholmsbørsen', 'SE', 'Europe/Stockholm', '09:00', '17:30'),
('CPH', 'Københavnsbørsen', 'DK', 'Europe/Copenhagen', '09:00', '17:00'),
('HEL', 'Helsinkibørsen', 'FI', 'Europe/Helsinki', '09:00', '17:30'),

-- North American Exchanges
('NYSE', 'NYSE', 'US', 'America/New_York', '09:30', '16:00'),
('NASDAQ', 'NASDAQ', 'US', 'America/New_York', '09:30', '16:00'),
('TSX', 'Toronto Stock Exchange', 'CA', 'America/Toronto', '09:30', '16:00'),

-- European Exchanges
('LSE', 'London Stock Exchange', 'GB', 'Europe/London', '08:00', '16:30'),
('XETRA', 'Xetra', 'DE', 'Europe/Berlin', '09:00', '17:30'),
('SIX', 'SIX Swiss Exchange', 'CH', 'Europe/Zurich', '09:00', '17:30'),
('BIT', 'Borsa Italiana', 'IT', 'Europe/Rome', '09:00', '17:35'),
('BME', 'Bolsa de Madrid', 'ES', 'Europe/Madrid', '09:00', '17:35'),
('WSE', 'Warsaw Stock Exchange', 'PL', 'Europe/Warsaw', '09:00', '16:50'),

-- Euronext Exchanges
('EPA', 'Euronext Paris', 'FR', 'Europe/Paris', '09:00', '17:35'),
('AMS', 'Euronext Amsterdam', 'NL', 'Europe/Amsterdam', '09:00', '17:35'),
('EBR', 'Euronext Brussels', 'BE', 'Europe/Brussels', '09:00', '17:35'),
('ELI', 'Euronext Lisbon', 'PT', 'Europe/Lisbon', '09:00', '17:35'),
('EDH', 'Euronext Dublin', 'IE', 'Europe/Dublin', '09:00', '17:30'),

-- Other European Exchanges
('WBAG', 'Wiener Börse', 'AT', 'Europe/Vienna', '09:00', '17:35')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  country = EXCLUDED.country,
  timezone = EXCLUDED.timezone,
  open_time = EXCLUDED.open_time,
  close_time = EXCLUDED.close_time;

-- =====================================================
-- EXCHANGE HOLIDAYS - 2026
-- =====================================================

-- Norway (Oslo Børs) - OSE
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('OSE', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('OSE', '2026-04-01', 'early_close', '13:00', 'Half trading day'),
('OSE', '2026-04-02', 'closed', NULL, 'Easter'),
('OSE', '2026-04-03', 'closed', NULL, 'Easter'),
('OSE', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('OSE', '2026-05-01', 'closed', NULL, 'Labour Day'),
('OSE', '2026-05-14', 'closed', NULL, 'Ascension Day'),
('OSE', '2026-05-25', 'closed', NULL, 'Whit Monday'),
('OSE', '2026-12-24', 'closed', NULL, 'Christmas Eve'),
('OSE', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('OSE', '2026-12-31', 'closed', NULL, 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Sweden (Stockholmsbørsen) - STO
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('STO', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('STO', '2026-01-05', 'early_close', '13:00', 'Half trading day'),
('STO', '2026-01-06', 'closed', NULL, 'Epiphany'),
('STO', '2026-04-02', 'early_close', '13:00', 'Half trading day'),
('STO', '2026-04-03', 'closed', NULL, 'Easter'),
('STO', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('STO', '2026-04-30', 'early_close', '13:00', 'Half trading day'),
('STO', '2026-05-01', 'closed', NULL, 'Labour Day'),
('STO', '2026-05-13', 'early_close', '13:00', 'Half trading day'),
('STO', '2026-05-14', 'closed', NULL, 'Ascension Day'),
('STO', '2026-06-19', 'closed', NULL, 'Midsummer Eve'),
('STO', '2026-10-30', 'early_close', '13:00', 'Half trading day'),
('STO', '2026-12-24', 'closed', NULL, 'Christmas Eve'),
('STO', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('STO', '2026-12-31', 'closed', NULL, 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Denmark (Københavnsbørsen) - CPH
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('CPH', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('CPH', '2026-04-02', 'closed', NULL, 'Easter'),
('CPH', '2026-04-03', 'closed', NULL, 'Easter'),
('CPH', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('CPH', '2026-05-14', 'closed', NULL, 'Ascension Day'),
('CPH', '2026-05-15', 'closed', NULL, 'Day after Ascension'),
('CPH', '2026-05-25', 'closed', NULL, 'Whit Monday'),
('CPH', '2026-06-05', 'closed', NULL, 'Constitution Day'),
('CPH', '2026-12-24', 'closed', NULL, 'Christmas Eve'),
('CPH', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('CPH', '2026-12-31', 'closed', NULL, 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Finland (Helsinkibørsen) - HEL
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('HEL', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('HEL', '2026-01-06', 'closed', NULL, 'Epiphany'),
('HEL', '2026-04-03', 'closed', NULL, 'Easter'),
('HEL', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('HEL', '2026-05-01', 'closed', NULL, 'Labour Day'),
('HEL', '2026-05-14', 'closed', NULL, 'Ascension Day'),
('HEL', '2026-06-19', 'closed', NULL, 'Midsummer Eve'),
('HEL', '2026-12-24', 'closed', NULL, 'Christmas Eve'),
('HEL', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('HEL', '2026-12-31', 'closed', NULL, 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- USA (NYSE, NASDAQ)
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('NYSE', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('NYSE', '2026-01-19', 'closed', NULL, 'Martin Luther King Jr. Day'),
('NYSE', '2026-02-16', 'closed', NULL, 'Presidents'' Day'),
('NYSE', '2026-04-03', 'closed', NULL, 'Good Friday'),
('NYSE', '2026-05-25', 'closed', NULL, 'Memorial Day'),
('NYSE', '2026-06-19', 'closed', NULL, 'Juneteenth'),
('NYSE', '2026-07-03', 'closed', NULL, 'Independence Day (observed)'),
('NYSE', '2026-09-07', 'closed', NULL, 'Labor Day'),
('NYSE', '2026-10-12', 'early_close', '13:00', 'Columbus Day'),
('NYSE', '2026-11-11', 'early_close', '13:00', 'Veterans Day'),
('NYSE', '2026-11-26', 'closed', NULL, 'Thanksgiving'),
('NYSE', '2026-11-27', 'early_close', '13:00', 'Day after Thanksgiving'),
('NYSE', '2026-12-24', 'early_close', '13:00', 'Christmas Eve'),
('NYSE', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('NASDAQ', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('NASDAQ', '2026-01-19', 'closed', NULL, 'Martin Luther King Jr. Day'),
('NASDAQ', '2026-02-16', 'closed', NULL, 'Presidents'' Day'),
('NASDAQ', '2026-04-03', 'closed', NULL, 'Good Friday'),
('NASDAQ', '2026-05-25', 'closed', NULL, 'Memorial Day'),
('NASDAQ', '2026-06-19', 'closed', NULL, 'Juneteenth'),
('NASDAQ', '2026-07-03', 'closed', NULL, 'Independence Day (observed)'),
('NASDAQ', '2026-09-07', 'closed', NULL, 'Labor Day'),
('NASDAQ', '2026-10-12', 'early_close', '13:00', 'Columbus Day'),
('NASDAQ', '2026-11-11', 'early_close', '13:00', 'Veterans Day'),
('NASDAQ', '2026-11-26', 'closed', NULL, 'Thanksgiving'),
('NASDAQ', '2026-11-27', 'early_close', '13:00', 'Day after Thanksgiving'),
('NASDAQ', '2026-12-24', 'early_close', '13:00', 'Christmas Eve'),
('NASDAQ', '2026-12-25', 'closed', NULL, 'Christmas Day')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Canada (TSX)
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('TSX', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('TSX', '2026-02-16', 'closed', NULL, 'Family Day'),
('TSX', '2026-04-03', 'closed', NULL, 'Good Friday'),
('TSX', '2026-05-18', 'closed', NULL, 'Victoria Day'),
('TSX', '2026-07-01', 'closed', NULL, 'Canada Day'),
('TSX', '2026-08-03', 'closed', NULL, 'Civic Holiday'),
('TSX', '2026-09-04', 'closed', NULL, 'Labor Day'),
('TSX', '2026-09-30', 'early_close', '13:00', 'National Day for Truth and Reconciliation'),
('TSX', '2026-10-12', 'closed', NULL, 'Thanksgiving'),
('TSX', '2026-11-11', 'early_close', '13:00', 'Remembrance Day'),
('TSX', '2026-12-24', 'early_close', '13:00', 'Christmas Eve'),
('TSX', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('TSX', '2026-12-28', 'closed', NULL, 'Boxing Day (observed)')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Germany (Xetra) - XETRA
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('XETRA', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('XETRA', '2026-04-03', 'closed', NULL, 'Good Friday'),
('XETRA', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('XETRA', '2026-05-01', 'closed', NULL, 'Labour Day'),
('XETRA', '2026-12-24', 'closed', NULL, 'Christmas Eve'),
('XETRA', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('XETRA', '2026-12-31', 'closed', NULL, 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Great Britain (LSE) - LSE
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('LSE', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('LSE', '2026-04-03', 'closed', NULL, 'Good Friday'),
('LSE', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('LSE', '2026-05-04', 'closed', NULL, 'Early May Bank Holiday'),
('LSE', '2026-05-25', 'closed', NULL, 'Spring Bank Holiday'),
('LSE', '2026-08-31', 'closed', NULL, 'Summer Bank Holiday'),
('LSE', '2026-12-24', 'early_close', '12:30', 'Christmas Eve'),
('LSE', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('LSE', '2026-12-28', 'closed', NULL, 'Boxing Day (observed)'),
('LSE', '2026-12-31', 'early_close', '12:30', 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- France (Euronext Paris) - EPA
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('EPA', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('EPA', '2026-04-03', 'closed', NULL, 'Easter'),
('EPA', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('EPA', '2026-05-01', 'closed', NULL, 'Labour Day'),
('EPA', '2026-12-24', 'early_close', '14:05', 'Christmas Eve'),
('EPA', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('EPA', '2026-12-31', 'early_close', '14:05', 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Netherlands (Euronext Amsterdam) - AMS
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('AMS', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('AMS', '2026-04-03', 'closed', NULL, 'Easter'),
('AMS', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('AMS', '2026-05-01', 'closed', NULL, 'Labour Day'),
('AMS', '2026-12-24', 'early_close', '14:05', 'Christmas Eve'),
('AMS', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('AMS', '2026-12-31', 'early_close', '14:05', 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Belgium (Euronext Brussels) - EBR
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('EBR', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('EBR', '2026-04-03', 'closed', NULL, 'Easter'),
('EBR', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('EBR', '2026-05-01', 'closed', NULL, 'Labour Day'),
('EBR', '2026-12-24', 'early_close', '14:05', 'Christmas Eve'),
('EBR', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('EBR', '2026-12-31', 'early_close', '14:05', 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Portugal (Euronext Lisbon) - ELI
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('ELI', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('ELI', '2026-04-03', 'closed', NULL, 'Easter'),
('ELI', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('ELI', '2026-05-01', 'closed', NULL, 'Labour Day'),
('ELI', '2026-12-24', 'early_close', '14:05', 'Christmas Eve'),
('ELI', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('ELI', '2026-12-31', 'early_close', '14:05', 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Ireland (Euronext Dublin) - EDH
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('EDH', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('EDH', '2026-04-03', 'closed', NULL, 'Easter'),
('EDH', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('EDH', '2026-05-01', 'closed', NULL, 'Labour Day'),
('EDH', '2026-05-04', 'closed', NULL, 'Early May Bank Holiday'),
('EDH', '2026-12-24', 'early_close', '14:05', 'Christmas Eve'),
('EDH', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('EDH', '2026-12-28', 'closed', NULL, 'St. Stephen''s Day (observed)'),
('EDH', '2026-12-31', 'early_close', '14:05', 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Switzerland (SIX Swiss Exchange) - SIX
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('SIX', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('SIX', '2026-01-02', 'closed', NULL, 'Berchtold''s Day'),
('SIX', '2026-04-03', 'closed', NULL, 'Good Friday'),
('SIX', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('SIX', '2026-05-01', 'closed', NULL, 'Labour Day'),
('SIX', '2026-05-14', 'closed', NULL, 'Ascension Day'),
('SIX', '2026-05-25', 'closed', NULL, 'Whit Monday'),
('SIX', '2026-12-24', 'closed', NULL, 'Christmas Eve'),
('SIX', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('SIX', '2026-12-31', 'closed', NULL, 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Italy (Borsa Italiana) - BIT
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('BIT', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('BIT', '2026-04-03', 'closed', NULL, 'Easter'),
('BIT', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('BIT', '2026-05-01', 'closed', NULL, 'Labour Day'),
('BIT', '2026-12-24', 'closed', NULL, 'Christmas Eve'),
('BIT', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('BIT', '2026-12-31', 'closed', NULL, 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Spain (Bolsa de Madrid) - BME
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('BME', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('BME', '2026-04-03', 'closed', NULL, 'Easter'),
('BME', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('BME', '2026-05-01', 'closed', NULL, 'Labour Day'),
('BME', '2026-12-24', 'early_close', '14:00', 'Christmas Eve'),
('BME', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('BME', '2026-12-31', 'early_close', '14:00', 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Poland (Warsaw Stock Exchange) - WSE
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('WSE', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('WSE', '2026-01-06', 'closed', NULL, 'Epiphany'),
('WSE', '2026-04-03', 'closed', NULL, 'Easter'),
('WSE', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('WSE', '2026-05-01', 'closed', NULL, 'Labour Day'),
('WSE', '2026-06-04', 'closed', NULL, 'Corpus Christi'),
('WSE', '2026-11-11', 'closed', NULL, 'Independence Day'),
('WSE', '2026-12-24', 'closed', NULL, 'Christmas Eve'),
('WSE', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('WSE', '2026-12-31', 'closed', NULL, 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- Austria (Wiener Börse) - WBAG
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('WBAG', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('WBAG', '2026-04-03', 'closed', NULL, 'Easter'),
('WBAG', '2026-04-06', 'closed', NULL, 'Easter Monday'),
('WBAG', '2026-05-01', 'closed', NULL, 'Labour Day'),
('WBAG', '2026-10-26', 'closed', NULL, 'National Day'),
('WBAG', '2026-12-24', 'closed', NULL, 'Christmas Eve'),
('WBAG', '2026-12-25', 'closed', NULL, 'Christmas Day'),
('WBAG', '2026-12-31', 'closed', NULL, 'New Year''s Eve')
ON CONFLICT (exchange_code, date) DO NOTHING;
