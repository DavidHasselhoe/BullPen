# Twelve Data Venture Plan – Analysis & API Test Results

## Venture Plan Limits (Business Pricing)

| Metric | Value |
|--------|-------|
| **API credits per minute** | 610 (base tier); 1,597 or 2,584 with higher tiers |
| **WebSocket credits** | 500 |
| **Daily limits** | None (unlimited within minute scope) |
| **Price** | $499/mo ($414/mo annual) |
| **Markets** | 75 global markets |
| **SLA** | 99.95% |

## Key Venture Plan Features

- **Real-time US stocks** – Low-latency live prices
- **EOD global equities and ETFs** – End-of-day prices
- **Pre/post market data** – For US equities at 1min, 5min, 15min, 30min intervals
- **Fundamentals** – Income statement, balance sheet, cash flow (full history on Enterprise)
- **Dividends, splits, earnings** – Historical corporate actions
- **Technical indicators** – 100+ pre-calculated
- **ETFs, mutual funds, commodities, bonds**
- **External display** – Can show data on client-facing apps/sites

## Time Series API

- **outputsize**: 1–5,000 data points per request
- **start_date / end_date**: Format `2006-01-02` or `2006-01-02T15:04:05`
- **Intervals**: 1min, 5min, 15min, 30min, 45min, 1h, 2h, 4h, 5h, 1day, 1week, 1month
- **API cost**: 1 credit per symbol
- With `start_date`/`end_date` set, outputsize defaults to maximum (5,000)

## API Test Results (using `apikey=demo`)

### Earliest Timestamp

| Symbol | Interval | Earliest datetime | Notes |
|--------|----------|-------------------|-------|
| AAPL | 1day | **1980-12-12** | ~45 years of daily history |
| AAPL | 1min | **2020-03-24 10:07** | ~5 years of intraday |

### Time Series

| Request | Result |
|---------|--------|
| AAPL, `start_date=1980-12-12`, `interval=1day` | 1,276 points (1980-12-12 → 1985-12-30). Demo key likely caps deep history. |
| AAPL, default (no date params), `outputsize=5000` | Data from ~2025-10-20 to 2026-03-13 (~5 months, 5000 points). |
| TSLA `earliest_timestamp` | 401 on demo – needs real key for some symbols. |

### Findings

1. **Daily data**: Earliest daily data for AAPL is **1980-12-12**.
2. **Intraday (1min)**: Earliest 1min data for AAPL is **March 2020**.
3. **Demo limits**: Demo key appears to cap deep history (e.g. only ~5 years when requesting from 1980).
4. With a real Venture key, full history up to `earliest_timestamp` should be available.

## Comparison with Finnhub (Current)

| Capability | Finnhub (free) | Twelve Data Venture |
|------------|---------------|---------------------|
| Daily history depth | ~2 years (typical) | Decades (e.g. 1980+) |
| Intraday 1min depth | Limited | ~5 years |
| API rate limit | 60/min | 610/min |
| Fundamentals | Limited | Full (Pro/Venture) |
| Dividends/splits | Limited | Yes |
| Pre/post market | No | Yes (Pro/Venture) |
| Technical indicators | No | 100+ built-in |

## 610 API/min – Capacity

- ~610 symbols per minute at 1 credit each
- Bulk requests (batch) can retrieve multiple symbols per call
- With caching, 610/min is enough for many portfolio apps
- Typical use: quotes, time series, fundamentals, dividends, etc.

## Recommendation

The Venture plan is a good fit if you need:

- Deeper historical daily data
- Intraday 1min history (~5 years)
- Pre/post market for US equities
- Fundamentals and corporate actions (dividends, splits, earnings)
- Higher throughput (610/min) and no daily cap

Caveats:

- Income statement / balance sheet / cash flow: full history only on Ultra/Enterprise
- ETFs directory: 50 records on Venture; full 40k+ ETFs on Ultra/Enterprise
- Demo key has restrictions; verify full behavior with a real key before committing
