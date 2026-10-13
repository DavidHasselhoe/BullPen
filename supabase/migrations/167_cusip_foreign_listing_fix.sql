-- 13F CUSIPs that resolved to a foreign cross-listing (Frankfurt "1E8" for
-- Pershing Square USA, Mexican/Indian/Düsseldorf listings for others). Every
-- 13(f) security trades in the US; resolve-cusip.ts now refuses non-US
-- listings. These were re-resolved by name on 2026-10-13: the eleven below
-- matched a US listing with the identical instrument name, the rest found no
-- US listing and are cleared to NULL (shown by issuer name, no price) rather
-- than left on a ticker that prices a different market in a different currency.

WITH fixed(cusip, symbol, mic) AS (VALUES
  ('059460303', 'BBD',  'XNYS'),
  ('71531T105', 'PSUS', 'XNYS'),
  ('486917107', 'KEEL', 'XNMS'),
  ('83443Q103', 'SOLS', 'XNGS'),
  ('04650F101', 'ATAI', 'XNMS'),
  ('92556W104', 'VIA',  'XNGS'),
  ('23306J309', 'DBVT', 'XNCM'),
  ('349381103', 'FIGR', 'XNGS'),
  ('15743P104', 'CHA',  'XNGS'),
  ('53229X101', 'LFTO', 'XNGS'),
  ('64073B103', 'NP',   'XNYS')
)
UPDATE cusip_ticker_map m SET symbol = f.symbol, mic_code = f.mic, currency = 'USD', resolved_at = now()
FROM fixed f WHERE m.cusip = f.cusip;

UPDATE cusip_ticker_map
SET symbol = NULL, mic_code = NULL, currency = NULL, resolution_method = 'unresolved', resolved_at = now()
WHERE cusip IN ('770701100', '471024109', '04681Y103', '018522300', '00162Q866', '131193104',
                '88428H101', 'G47791101', '88428J107', '40054J109');

UPDATE institutional_holdings h SET symbol = m.symbol
FROM cusip_ticker_map m
WHERE h.cusip = m.cusip
  AND m.cusip IN ('059460303', '71531T105', '486917107', '83443Q103', '04650F101', '92556W104', '23306J309',
                  '349381103', '15743P104', '53229X101', '64073B103', '770701100', '471024109', '04681Y103',
                  '018522300', '00162Q866', '131193104', '88428H101', 'G47791101', '88428J107', '40054J109')
  AND h.symbol IS DISTINCT FROM m.symbol;
