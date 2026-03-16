# Pre-Paid Twelve Data Plan – Planning Checklist

Before upgrading from Basic (8 API/min) to a paid plan (Venture, Pro, Grow), work through this checklist. See `twelve-data-venture-analysis.md` for plan limits and features.

---

## 1. Technical Readiness

### Error handling ✓
- **TwelveDataRateLimitError** – Thrown when rate limit exceeded; API routes return 429 with `Retry-After: 60`.
- User-facing message: *"Market data rate limit exceeded. Please try again in a minute."*
- Holdings, batch quotes, movers, buy-here, earnings, recommendations all handle 429.

### Fallback behavior
- **Finnhub fallback** – When `TWELVE_DATA_API_KEY` is not set, price data uses Finnhub (quotes, candles, movers, earnings, recommendations).
- **Degraded state** – When rate limited, users see the message and can retry; no silent failure.
- **WebSocket movers** – Uses Twelve Data WebSocket for "All markets" to reduce REST usage; falls back to REST on error.

---

## 2. Usage & Cost Modeling

### Current API usage (Basic tier: 8 credits/min, 800/day)
- **Quote** – 1 credit per symbol.
- **Time series** – 1 credit per symbol per request (5000 pts).
- **Earnings calendar** – 1 credit per request.
- **Company earnings** – 1 credit per symbol.
- **Recommendations** – 1 credit per symbol.

### Usage logging
Set `TWELVE_DATA_USAGE_LOG=true` to enable JSON logs for cost modeling:
```json
{"ts":1234567890,"source":"twelvedata","endpoint":"quote","symbol":"AAPL"}
```

### Caching (reduce API load)
- **Quotes** – `staleTime: 3min`, `gcTime: 15min` (holdings); 60s Cache-Control on batch endpoint.
- **Movers** – Uses WebSocket stream when available (no REST polling).
- **Earnings / recommendations** – No explicit cache; consider adding per-symbol cache if needed.

### Peak usage estimate (Venture: 610/min)
| Scenario | Requests/min |
|----------|--------------|
| 10 holdings batch load | 10 quote + logo DB |
| 1 movers page (stream) | ~0 REST (WebSocket) |
| 1 buy-here (stock + SPY) | 2 time_series |
| 5 stock pages (earnings, recs) | ~10 |
| **Typical peak** | **~25/min** |

610/min comfortably supports many concurrent users at these patterns.

---

## 3. Monetization Alignment

### Features powered by Twelve Data
- Quote (price, change) on holdings, portfolio summary, stock pages.
- Market movers (gainers/losers).
- Buy-here historical calculator.
- Earnings calendar, company earnings (EPS surprises), recommendation trends.

### Free vs paid (example)
- **Free** – Limited holdings quotes, movers (or cached), basic features.
- **Paid** – Full real-time, historical depth, earnings, recommendations, portfolio analytics.

### Break-even (example)
- Venture ~$120/mo (annual) → ~15–25 paid users at $5–8/mo.
- Define tier gating before upgrading.

---

## 4. News API

- **Current** – Finnhub for market and company news.
- **Twelve Data** – No news; Finnhub remains for news.
- **Consider** – Finnhub production terms; alternatives (FMP, Benzinga, Polygon) if migrating later.

---

## 5. Operations & Monitoring

### Usage tracking
- Enable `TWELVE_DATA_USAGE_LOG=true` during trial to measure calls.
- Twelve Data dashboard: `/api_usage` or response headers `api-credits-used`, `api-credits-left`.

### Alerts
- Set alerts when usage nears ~80% of plan limits.
- Log 429 responses and retry patterns.

### Venture terms
- Confirm attribution and display requirements.
- Check SLA (99.95%) and data freshness expectations.

---

## 6. Launch Sequence

1. **Finish on Basic** – Integration, rate-limit handling, usage logging in place ✓  
2. **Validate** – Run with Basic key; confirm throttling and 429 handling.  
3. **Usage run** – Enable `TWELVE_DATA_USAGE_LOG`; estimate peak requests/min.  
4. **Tier gating** – Decide and implement free vs paid features.  
5. **Upgrade** – Subscribe to Venture (or chosen plan).  
6. **Relax throttling** – Remove/minimize 8s spacing in batch when 610/min available.  
7. **Monitor** – Track usage, add alerts, iterate.

---

## Summary

| Item | Status |
|------|--------|
| Rate limit error handling | ✓ |
| User-facing 429 messages | ✓ |
| Usage logging (opt-in) | ✓ |
| Finnhub fallback | ✓ |
| Caching strategy | ✓ |
| Pre-paid planning doc | ✓ |
| Tier gating | To decide |
| Upgrade decision | When ready |
