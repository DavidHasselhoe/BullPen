# My Holdings Mode — Plan & Specification

## Overview

A toggle that filters the **Market Context** section (Market Hours, Top Market Movers, Market News) to show only data relevant to the user's portfolio. When enabled, the dashboard becomes personalized: only exchanges where the user holds stocks, movers from their holdings, and news about their companies.

---

## Improved Requirements (Expanded from Original)

### Core Behavior
- **Toggle placement**: In the Market Context section header or as a filter chip
- **Persistence**: Store preference in user settings (so it persists across sessions)
- **Auth gate**: Mode only available when user is logged in and has holdings
- **Fallback**: If no holdings, show empty states with a CTA to add holdings

### Market Hours
- Filter to show **only** exchanges where the user holds listed securities
- **Ticker → Exchange mapping**: US tickers (NYSE, NASDAQ) → show US exchanges; Nordic → OSE, STO; UK → LSE; Germany → XETRA; etc.
- **Default mapping**: Since we don't have `primary_exchange` on companies, use a heuristic:
  - Tickers in our companies DB with US incorporation → NYSE, NASDAQ
  - Fallback: assume all holdings are US (most BullPen users) → NYSE, NASDAQ only
  - Future: add `primary_exchange` to companies or a ticker→exchange lookup table

### Top Market Movers
- **Replace** global movers with movers **from the user's holdings**
- Fetch quotes for user's tickers, sort by `changePercent`, show top gainers and losers
- If user has < 2 holdings: show both in gainers/losers, or pad with "Your holdings" section
- If user has many holdings (>10): show top 5 gainers, top 5 losers from their portfolio
- **Badge**: "From your portfolio" to clarify the data source

### Market News
- **Merge** company news from Finnhub `getCompanyNews` for each holding
- Sort by `datetime` descending (most recent first)
- Limit total (e.g. 10–15 articles) to avoid API rate limits
- **Parallel fetch**: Call getCompanyNews for each ticker, merge, dedupe by headline
- **Fallback**: If a ticker has no news, show others; if none have news, show empty state

---

## Additional Ideas (Beyond Original Prompt)

1. **Sector-aware news**: If user holds NVIDIA and AMD, optionally include broader "semiconductors" or "tech" news (Finnhub `category` param)
2. **Exchange hint on Market Hours**: Show which holding(s) drove each exchange (e.g. "NVDA, AAPL")
3. **Empty state copy**: "Add stocks to your portfolio to personalize Market Context"
4. **Toggle label**: "My portfolio" or "Personalized" with a brief tooltip
5. **Loading states**: When switching modes, show skeleton; avoid layout shift
6. **Rate limiting**: Finnhub free tier has limits; batch news requests, cache per-ticker for 15–30 min
7. **Settings integration**: Add "Market Context: All markets | My portfolio" to user settings for consistency with other preferences

---

## Technical Approach

### Data Flow
```
User Holdings (useHoldings) 
  → tickers: string[]
  → exchangeCodes: string[] (derived from ticker→exchange map)
  → newsSymbols: string[]

Market Hours Card: exchangeCodes (filtered when My Holdings mode)
Top Movers: useTopMovers(limit, symbols?) — new param
Market News: useMarketNews(category, limit, symbols?) — new param
```

### New/Modified APIs
1. **`/api/market/movers`**: Add optional `?symbols=AAPL,NVDA,...` to fetch movers for specific tickers instead of POPULAR_STOCKS
2. **`/api/market/news`**: Add optional `?symbols=AAPL,NVDA,...` to fetch and merge company news
3. **Ticker → exchange**: Add `lib/market/ticker-exchange-map.ts` — simple map or lookup (US default, or from companies table if we add the column)

### Components
1. **MarketContextSection** (or wrap existing): Holds the toggle, passes `holdingsMode` and `holdingsTickers` to children
2. **MarketHoursCard**: Already accepts `exchangeCodes` — parent passes filtered list
3. **TopMoversCard**: Accept optional `symbols`; when provided, use holdings-based movers
4. **MarketNewsCard**: Accept optional `symbols`; when provided, fetch company news

### State
- **Toggle state**: `holdingsMode: boolean` — from `useState` or `useUserSettings`
- **User settings**: Add `market_context_mode: 'all' | 'holdings'` to user settings JSON
- **Holdings**: `useHoldings()` — only fetch when user is authenticated

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Logged out | Toggle hidden or disabled; always show "All" |
| No holdings | Show "Add holdings" empty state; toggle disabled or hidden |
| 1 holding | Market Hours: that exchange; Movers: show that 1 in both gainers/losers or single list; News: that company's news |
| Holdings on 1 exchange | Market Hours: only that exchange |
| Finnhub rate limit | Cache news per symbol; show partial results if some fail |
| Non-US ticker | Use fallback exchange map; if unknown, default to US |

---

## Implementation Order

1. Add `ticker → exchange` mapping (US default for now)
2. Add `/api/market/movers?symbols=` support
3. Add `/api/market/news?symbols=` support (merge company news)
4. Add `useMarketNews(..., symbols?)` and `useTopMovers(..., symbols?)` overloads
5. Add toggle UI and `holdingsMode` state (local first; settings later)
6. Wire Market Context section to use filtered data when mode is on
7. Add user setting persistence for `market_context_mode`
8. Polish empty states and loading
