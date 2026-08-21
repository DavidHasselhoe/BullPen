-- Asian Exchange Data Seed - 2026
-- Trading hours and holiday calendars for Tokyo, Korea, and Shanghai.
-- Tokyo and Shanghai both have a midday trading halt (see migration 113);
-- Korea trades continuously.
--
-- Sources (cross-checked against each other and against day-of-week
-- arithmetic for every date; see conversation for the full reconciliation):
--   Japan:  Japan Exchange Group public holiday calendar (JPX.co.jp) via
--           aggregated calendar trackers (calendarlabs.com, tradinghours.com)
--   Korea:  Korea Times, Seoul Economic Daily, Korea Herald, Arirang, BigGo
--           Finance (for the two 2026-specific closures: Jun 3 local
--           elections, Jul 17 Constitution Day reinstated after 18 years)
--   China:  Shanghai/Shenzhen Stock Exchange 2026 Spring Festival notices
--           (via longbridge.com, futunn.com, investinglive.com), Shanghai
--           Futures Exchange's published 2026 holiday circular for the
--           other windows (Qingming/Labour Day/Dragon Boat/Mid-Autumn/
--           National Day), which mirrors the SSE/SZSE equity calendar.
--
-- Confidence note: the Feb 13, 2026 SSE early-close (noon) is corroborated
-- by two independent sources but contradicted by a third that claimed no
-- 2026 half-days — included here as the better-supported case, but worth
-- a spot-check against SSE's own circular closer to the date.

-- =====================================================
-- EXCHANGES - Regular Trading Hours (Local Timezone)
-- =====================================================

INSERT INTO public.exchanges (code, name, country, timezone, open_time, close_time, midday_close_time, midday_open_time) VALUES
('TSE', 'Tokyo Stock Exchange', 'JP', 'Asia/Tokyo', '09:00', '15:30', '11:30', '12:30'),
('KRX', 'Korea Exchange', 'KR', 'Asia/Seoul', '09:00', '15:30', NULL, NULL),
('SSE', 'Shanghai Stock Exchange', 'CN', 'Asia/Shanghai', '09:30', '15:00', '11:30', '13:00')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  country = EXCLUDED.country,
  timezone = EXCLUDED.timezone,
  open_time = EXCLUDED.open_time,
  close_time = EXCLUDED.close_time,
  midday_close_time = EXCLUDED.midday_close_time,
  midday_open_time = EXCLUDED.midday_open_time;

-- =====================================================
-- EXCHANGE HOLIDAYS - 2026
-- =====================================================

-- Japan (Tokyo Stock Exchange) - TSE
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('TSE', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('TSE', '2026-01-02', 'closed', NULL, 'New Year Holiday'),
('TSE', '2026-01-12', 'closed', NULL, 'Coming-of-Age Day'),
('TSE', '2026-02-11', 'closed', NULL, 'National Foundation Day'),
('TSE', '2026-02-23', 'closed', NULL, 'Emperor''s Birthday'),
('TSE', '2026-03-20', 'closed', NULL, 'Vernal Equinox Day'),
('TSE', '2026-04-29', 'closed', NULL, 'Showa Day'),
('TSE', '2026-05-04', 'closed', NULL, 'Greenery Day'),
('TSE', '2026-05-05', 'closed', NULL, 'Children''s Day'),
('TSE', '2026-05-06', 'closed', NULL, 'Substitute Holiday (Constitution Memorial Day)'),
('TSE', '2026-07-20', 'closed', NULL, 'Marine Day'),
('TSE', '2026-08-11', 'closed', NULL, 'Mountain Day'),
('TSE', '2026-09-21', 'closed', NULL, 'Respect for the Aged Day'),
('TSE', '2026-09-22', 'closed', NULL, 'Citizens'' Holiday'),
('TSE', '2026-09-23', 'closed', NULL, 'Autumnal Equinox Day'),
('TSE', '2026-10-12', 'closed', NULL, 'Sports Day'),
('TSE', '2026-11-03', 'closed', NULL, 'Culture Day'),
('TSE', '2026-11-23', 'closed', NULL, 'Labor Thanksgiving Day'),
('TSE', '2026-12-31', 'closed', NULL, 'Year-End Holiday')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- South Korea (Korea Exchange) - KRX
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('KRX', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('KRX', '2026-02-16', 'closed', NULL, 'Seollal Holiday'),
('KRX', '2026-02-17', 'closed', NULL, 'Seollal (Lunar New Year)'),
('KRX', '2026-02-18', 'closed', NULL, 'Seollal Holiday'),
('KRX', '2026-03-02', 'closed', NULL, 'Substitute Holiday (Independence Movement Day)'),
('KRX', '2026-05-01', 'closed', NULL, 'Labor Day'),
('KRX', '2026-05-05', 'closed', NULL, 'Children''s Day'),
('KRX', '2026-05-25', 'closed', NULL, 'Substitute Holiday (Buddha''s Birthday)'),
('KRX', '2026-06-03', 'closed', NULL, 'Local Election Day'),
('KRX', '2026-07-17', 'closed', NULL, 'Constitution Day'),
('KRX', '2026-08-17', 'closed', NULL, 'Substitute Holiday (Liberation Day)'),
('KRX', '2026-09-24', 'closed', NULL, 'Chuseok Holiday'),
('KRX', '2026-09-25', 'closed', NULL, 'Chuseok (Korean Thanksgiving)'),
('KRX', '2026-10-05', 'closed', NULL, 'Substitute Holiday (National Foundation Day)'),
('KRX', '2026-10-09', 'closed', NULL, 'Hangul Day'),
('KRX', '2026-12-25', 'closed', NULL, 'Christmas Day')
ON CONFLICT (exchange_code, date) DO NOTHING;

-- China (Shanghai Stock Exchange) - SSE
INSERT INTO public.exchange_holidays (exchange_code, date, type, early_close_time, description) VALUES
('SSE', '2026-01-01', 'closed', NULL, 'New Year''s Day'),
('SSE', '2026-01-02', 'closed', NULL, 'New Year Holiday'),
('SSE', '2026-02-13', 'early_close', '12:00', 'Spring Festival Eve (half day)'),
('SSE', '2026-02-16', 'closed', NULL, 'Spring Festival Holiday'),
('SSE', '2026-02-17', 'closed', NULL, 'Spring Festival (Chinese New Year)'),
('SSE', '2026-02-18', 'closed', NULL, 'Spring Festival Holiday'),
('SSE', '2026-02-19', 'closed', NULL, 'Spring Festival Holiday'),
('SSE', '2026-02-20', 'closed', NULL, 'Spring Festival Holiday'),
('SSE', '2026-02-23', 'closed', NULL, 'Spring Festival Holiday'),
('SSE', '2026-04-06', 'closed', NULL, 'Qingming Festival'),
('SSE', '2026-05-01', 'closed', NULL, 'Labour Day'),
('SSE', '2026-05-04', 'closed', NULL, 'Labour Day Holiday'),
('SSE', '2026-05-05', 'closed', NULL, 'Labour Day Holiday'),
('SSE', '2026-06-19', 'closed', NULL, 'Dragon Boat Festival'),
('SSE', '2026-09-25', 'closed', NULL, 'Mid-Autumn Festival'),
('SSE', '2026-10-01', 'closed', NULL, 'National Day'),
('SSE', '2026-10-02', 'closed', NULL, 'National Day Holiday'),
('SSE', '2026-10-05', 'closed', NULL, 'National Day Holiday'),
('SSE', '2026-10-06', 'closed', NULL, 'National Day Holiday'),
('SSE', '2026-10-07', 'closed', NULL, 'National Day Holiday')
ON CONFLICT (exchange_code, date) DO NOTHING;
