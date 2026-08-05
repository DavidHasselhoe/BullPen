# Heatmap "My Stocks" Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in user switch the S&P 500 Sector Heatmap to a "My Stocks" view showing their holdings + watchlist (deduped), sourced from the same broader active-universe data that backs the Screener rather than being limited to S&P 500 membership.

**Architecture:** `GET /api/tools/heatmap` gains a `?mode=my-stocks` branch alongside the existing (now-refactored-but-behaviorally-identical) S&P 500 path — same response shape, different ticker source and sector/market-cap sourcing, auth-gated only on that branch. The client (`HeatmapClientPage.tsx`) gets a mode toggle that swaps the query param, title, and adds an empty state.

**Tech Stack:** Next.js App Router API route, TanStack Query, shadcn `Tabs` primitive, Supabase (service-role server client).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-05-heatmap-my-stocks-mode-design.md` — read it first.
- No test framework in this repo — verification is `npm run lint`, `npx tsc --noEmit`, and manual `curl`/browser checks.
- `mode=sp500` (the default/no-param case) must remain byte-for-byte behaviorally identical to today — same cache key (`heatmap:v2`), same public/no-auth access, same output for the same inputs. This is a hard constraint, not a nice-to-have: it's the page every logged-out visitor and every existing bookmark/link still hits.
- `mode=my-stocks` requires auth via `requireAuth()` (`lib/security/api-security.ts`) — enforced server-side, not just hidden client-side.
- Dual-class shares (`GOOG`/`FOXA`/`NWS` — see `lib/market-data/dual-class-shares.ts`) are deduped in `sp500` mode (unchanged) but **not** in `my-stocks` mode — a user may specifically hold/watch the non-canonical class, and the codebase's own established convention (`app/api/screener/route.ts`'s `symbolAllowlist` exemption) already treats holdings/watchlist views as exempt from this dedup rule.
- Symbols map cap at 60 (post-dedupe, post-crypto/forex filter) for `my-stocks` mode.
- No synthetic market-cap fallback in `my-stocks` mode — real `screener_stats` data (cached or freshly fetched) or the tile doesn't render.

---

### Task 1: `app/api/tools/heatmap/route.ts` — add `my-stocks` mode

**Files:**
- Modify: `app/api/tools/heatmap/route.ts` (full-file replacement — the refactor to share logic between modes touches most of the file, so a full replacement is less error-prone than many small diffs)

**Interfaces:**
- Consumes: `requireAuth` (`lib/security/api-security.ts`, already exists — returns `{ userId: string } | NextResponse`), `fetchAndUpsertScreenerStats` (`lib/market-data/screener-stats.ts`, already exists — `(symbols: string[]) => Promise<ScreenerRow[]>`), `inferAssetType` (`lib/assets/asset-type.ts`, already exists — `(symbol: string) => AssetType`).
- Produces: unchanged `HeatmapStock`, `HeatmapSector`, `HeatmapResponse` exported interfaces (Task 2 imports these, already does today — no change needed there).

- [ ] **Step 1: Replace the full file**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit, requireAuth } from '@/lib/security/api-security';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { SP500_SECTORS } from '@/lib/market-data/sp500-sectors';
import { logger } from '@/lib/utils/logger';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { seedPrices, type SeededQuote } from '@/lib/market-data/seed-prices';
import { isExtendedHoursET } from '@/lib/twelvedata/twelvedata-client';
import { isDuplicateShareClass } from '@/lib/market-data/dual-class-shares';
import { fetchAndUpsertScreenerStats } from '@/lib/market-data/screener-stats';
import { inferAssetType } from '@/lib/assets/asset-type';
import type { Session } from '@/app/api/market/heatmap/stream/route';

export const dynamic = 'force-dynamic';

export interface HeatmapStock {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number;
  change: number;
  price: number;
  previousClose?: number;
  isExtended?: boolean;
}

export interface HeatmapSector {
  name: string;
  totalMarketCap: number;
  avgChange: number;
  stocks: HeatmapStock[];
}

export interface HeatmapResponse {
  success: boolean;
  sectors?: HeatmapSector[];
  session?: Session;
  lastUpdated?: string;
  error?: string;
}

const HEATMAP_CACHE_KEY = 'heatmap:v2';
const HEATMAP_CACHE_TTL_SECONDS = 3 * 60;
const MY_STOCKS_CACHE_TTL_SECONDS = 3 * 60;
/** Post-dedupe, post-crypto/forex-filter cap on how many of a user's tracked
 *  symbols get a tile — bounds the on-demand screener-stats fetch below to a
 *  small, predictable fan-out rather than an unbounded one for a very large
 *  watchlist. Holdings first, then watchlist, both alphabetical. */
const MY_STOCKS_SYMBOL_CAP = 60;

// Shown to the user for any data-fetch failure — never leaks provider names,
// HTTP status codes, or other internals a visitor can't act on.
const GENERIC_LOAD_ERROR = 'Live prices are temporarily unavailable. Please try again in a moment.';

function getCurrentSession(): Session {
  const etStr = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  const [h, m] = etStr.split(':').map(Number);
  const etMins = h * 60 + m;
  const day = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  ).getDay();

  if (day === 0 || day === 6) return 'closed';
  if (etMins >= 240 && etMins < 570) return 'pre';
  if (etMins >= 570 && etMins < 960) return 'regular';
  if (etMins >= 960 && etMins < 1200) return 'post';
  return 'closed';
}

const SECTOR_ORDER = [
  'Information Technology',
  'Health Care',
  'Financials',
  'Consumer Discretionary',
  'Industrials',
  'Communication Services',
  'Consumer Staples',
  'Energy',
  'Real Estate',
  'Materials',
  'Utilities',
];

/** Groups a flat list of already-priced stocks into sectors, sorted by the
 *  app's canonical sector order. Shared by both sp500 and my-stocks modes —
 *  everything downstream of "I have a list of HeatmapStock" is identical
 *  regardless of where that list came from. */
function buildSectors(stocks: HeatmapStock[]): HeatmapSector[] {
  const sectorMap = new Map<string, HeatmapStock[]>();
  for (const stock of stocks) {
    const existing = sectorMap.get(stock.sector) ?? [];
    existing.push(stock);
    sectorMap.set(stock.sector, existing);
  }

  return Array.from(sectorMap.entries())
    .map(([name, group]) => {
      const sorted = [...group].sort((a, b) => b.marketCap - a.marketCap);
      const totalMarketCap = sorted.reduce((sum, s) => sum + s.marketCap, 0);
      const avgChange = sorted.reduce((sum, s) => sum + s.change, 0) / (sorted.length || 1);
      return { name, totalMarketCap, avgChange, stocks: sorted };
    })
    .sort((a, b) => {
      const ai = SECTOR_ORDER.indexOf(a.name);
      const bi = SECTOR_ORDER.indexOf(b.name);
      if (ai === -1 && bi === -1) return b.totalMarketCap - a.totalMarketCap;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
}

/**
 * Resolves the S&P 500 constituent list into fully-priced HeatmapStock rows.
 * Behavior is unchanged from before this file's mode split — same sector
 * sourcing (static map → companies table → 'Other'), same market-cap
 * fallback (real screener_stats value, or a rank-based synthetic estimate),
 * same dual-class dedup.
 */
async function resolveSp500Stocks(): Promise<HeatmapStock[]> {
  const supabase = createServerClient();

  // Fetch market caps from screener_stats for as many tickers as possible.
  // Also fetch name+sector from companies table as a fallback for tickers
  // not in SP500_SECTORS (covers recent additions / reclassifications).
  const [{ data: statsData }, { data: companiesData }] = await Promise.all([
    supabase
      .from('screener_stats')
      .select('ticker, market_cap')
      .in('ticker', SP500_TICKERS),
    supabase
      .from('companies')
      .select('ticker, name, sector')
      .in('ticker', SP500_TICKERS),
  ]);

  const marketCapMap = new Map<string, number>();
  for (const s of statsData ?? []) {
    if (s.market_cap && (s.market_cap as number) > 0) {
      marketCapMap.set(s.ticker, s.market_cap as number);
    }
  }

  const dbNameMap = new Map<string, string>();
  const dbSectorMap = new Map<string, string>();
  for (const c of companiesData ?? []) {
    if (c.name) dbNameMap.set(c.ticker, c.name);
    if (c.sector) dbSectorMap.set(c.ticker, c.sector);
  }

  // Rank-based fallback market cap when screener_stats has no entry
  const BASE_CAP = 3_000_000_000_000;
  const universeRank = new Map(SP500_TICKERS.map((t, i) => [t, i]));

  // Session-level extended-hours flag — every S&P 500 name has extended
  // quotes available on TwelveData in practice, so this is an acceptable
  // simplification of the old per-stock `extended_price != null` check.
  const isExtended = isExtendedHoursET();

  // Route through the shared, Redis-backed, chunk-isolated seeding pipeline
  // (same one the live heatmap stream uses) instead of hand-rolled raw
  // fetches: this shares warm cache with the live stream, batches requests
  // in TwelveData-safe chunks of 100 instead of 26 concurrent unbatched
  // calls, and — critically — isolates each chunk's failures so one
  // rate-limited chunk only drops its own symbols instead of aborting the
  // whole page.
  const quoteMap = new Map<string, SeededQuote>();
  await seedPrices(SP500_TICKERS, (ticker, quote) => {
    quoteMap.set(ticker, quote);
  });

  const stocks: HeatmapStock[] = [];

  for (const ticker of SP500_TICKERS) {
    // One tile per company: GOOG/FOX/NWS are the non-canonical half of a
    // dual-class pair (GOOGL/FOXA/NWSA is kept) — same rule movers and the
    // screener already apply, see lib/market-data/dual-class-shares.ts.
    if (isDuplicateShareClass(ticker)) continue;

    const quote = quoteMap.get(ticker);
    if (!quote || !isFinite(quote.price) || quote.price <= 0) continue;

    const price = quote.price;
    const change = quote.changePercent ?? 0;
    const previousClose = quote.previousClose;

    // Sector: static map → DB → 'Other'
    const sectorName =
      SP500_SECTORS[ticker] ??
      dbSectorMap.get(ticker)?.trim() ??
      'Other';

    // Name: DB → ticker (TwelveData quotes don't carry a company name)
    const name = dbNameMap.get(ticker) ?? ticker;

    const realCap = marketCapMap.get(ticker);
    const rank = universeRank.get(ticker) ?? SP500_TICKERS.length;
    const marketCap = realCap ?? Math.round(BASE_CAP * Math.pow(0.96, rank));

    stocks.push({
      ticker,
      name,
      sector: sectorName,
      marketCap,
      change,
      price,
      previousClose: isFinite(previousClose) ? previousClose : undefined,
      isExtended,
    });
  }

  return stocks;
}

/**
 * Resolves a user's holdings + watchlist into fully-priced HeatmapStock rows,
 * sourced from the broader active-universe screener data (screener_stats,
 * ~1,200 tickers and growing) rather than the S&P-500-only static sector map
 * — a user's tracked stocks are frequently outside the index. Crypto/forex
 * symbols are excluded (a sector heatmap is an equity concept); dual-class
 * shares are NOT deduped here, unlike sp500 mode — a user may specifically
 * hold/watch the non-canonical class, matching the exemption
 * app/api/screener/route.ts already grants symbol-scoped views. No synthetic
 * market-cap fallback: a ticker with no real market_cap data anywhere just
 * doesn't get a tile.
 */
async function resolveMyStocks(userId: string): Promise<HeatmapStock[]> {
  const supabase = createServerClient();

  const [{ data: holdingsRows }, { data: watchlistRows }] = await Promise.all([
    supabase.from('user_holdings').select('symbol').eq('user_id', userId),
    supabase.from('user_watchlist').select('symbol').eq('user_id', userId),
  ]);

  const uniqueSymbols = [
    ...new Set(
      [...(holdingsRows ?? []), ...(watchlistRows ?? [])]
        .map((r) => (r.symbol as string).toUpperCase())
        .filter((sym) => {
          const type = inferAssetType(sym);
          return type !== 'crypto' && type !== 'forex';
        })
    ),
  ]
    .sort()
    .slice(0, MY_STOCKS_SYMBOL_CAP);

  if (uniqueSymbols.length === 0) return [];

  const { data: cachedStats } = await supabase
    .from('screener_stats')
    .select('ticker, name, sector, market_cap')
    .in('ticker', uniqueSymbols);

  const statsMap = new Map<string, { name: string; sector: string | null; market_cap: number | null }>();
  for (const row of cachedStats ?? []) {
    statsMap.set(row.ticker as string, row as { name: string; sector: string | null; market_cap: number | null });
  }

  const missing = uniqueSymbols.filter((sym) => !statsMap.has(sym));
  if (missing.length > 0) {
    try {
      const freshRows = await fetchAndUpsertScreenerStats(missing);
      for (const row of freshRows) {
        statsMap.set(row.ticker, { name: row.name, sector: row.sector, market_cap: row.market_cap });
      }
    } catch (err) {
      // A cold-fetch failure for some symbols shouldn't blank the whole
      // view — those tickers just won't get a tile (same "no data → skip"
      // behavior as a missing quote below), the rest still renders.
      logger.error('Heatmap my-stocks: on-demand screener fetch failed', err);
    }
  }

  const isExtended = isExtendedHoursET();
  const quoteMap = new Map<string, SeededQuote>();
  await seedPrices(uniqueSymbols, (ticker, quote) => {
    quoteMap.set(ticker, quote);
  });

  const stocks: HeatmapStock[] = [];

  for (const ticker of uniqueSymbols) {
    const quote = quoteMap.get(ticker);
    if (!quote || !isFinite(quote.price) || quote.price <= 0) continue;

    const stats = statsMap.get(ticker);
    const marketCap = stats?.market_cap;
    if (!marketCap || marketCap <= 0) continue;

    stocks.push({
      ticker,
      name: stats?.name ?? ticker,
      sector: stats?.sector?.trim() || 'Other',
      marketCap,
      change: quote.changePercent ?? 0,
      price: quote.price,
      previousClose: isFinite(quote.previousClose) ? quote.previousClose : undefined,
      isExtended,
    });
  }

  return stocks;
}

async function handleSp500(): Promise<NextResponse> {
  const cachedHeatmap = await getCached<HeatmapResponse>(HEATMAP_CACHE_KEY);
  if (cachedHeatmap) {
    return NextResponse.json(cachedHeatmap);
  }

  const session = getCurrentSession();

  try {
    const stocks = await resolveSp500Stocks();

    if (stocks.length === 0) {
      // Every symbol failed to resolve — Redis cold and TwelveData
      // unavailable at the same time. Rare, but a live-price hiccup shouldn't
      // blank the page: fall back to the last cached snapshot (however stale)
      // so the user sees yesterday's close instead of an error card. The
      // `lastUpdated` timestamp already shown in the header makes the age
      // honest rather than presenting stale data as live.
      const stale = await getCachedStale<HeatmapResponse>(HEATMAP_CACHE_KEY);
      if (stale?.success) {
        logger.error('Heatmap API: zero symbols resolved from seedPrices, served stale cache');
        return NextResponse.json(stale);
      }
      logger.error('Heatmap API: zero symbols resolved from seedPrices, no stale cache available');
      return NextResponse.json({ success: false, error: GENERIC_LOAD_ERROR });
    }

    const response: HeatmapResponse = {
      success: true,
      sectors: buildSectors(stocks),
      session,
      lastUpdated: new Date().toISOString(),
    };

    void setCached(HEATMAP_CACHE_KEY, 'MARKET', 'heatmap', response, HEATMAP_CACHE_TTL_SECONDS);

    return NextResponse.json(response);
  } catch (err) {
    // Log the real cause server-side; the client only ever sees a generic,
    // provider-agnostic message — no status codes, no vendor names.
    logger.error('Heatmap API error', err);
    const stale = await getCachedStale<HeatmapResponse>(HEATMAP_CACHE_KEY);
    if (stale?.success) {
      logger.error('Heatmap API error, served stale cache');
      return NextResponse.json(stale);
    }
    return NextResponse.json({ success: false, error: GENERIC_LOAD_ERROR });
  }
}

async function handleMyStocks(userId: string): Promise<NextResponse> {
  const cacheKey = `heatmap:my-stocks:v1:${userId}`;
  const cachedHeatmap = await getCached<HeatmapResponse>(cacheKey);
  if (cachedHeatmap) {
    return NextResponse.json(cachedHeatmap);
  }

  const session = getCurrentSession();

  try {
    const stocks = await resolveMyStocks(userId);

    // An empty result here is a legitimate state (no tracked symbols, or
    // none cleared the crypto/forex filter) — not an error. The client
    // renders a dedicated "add a stock" empty state for sectors: [].
    const response: HeatmapResponse = {
      success: true,
      sectors: buildSectors(stocks),
      session,
      lastUpdated: new Date().toISOString(),
    };

    void setCached(cacheKey, 'MY_STOCKS', 'heatmap', response, MY_STOCKS_CACHE_TTL_SECONDS);

    return NextResponse.json(response);
  } catch (err) {
    logger.error('Heatmap My Stocks API error', err);
    const stale = await getCachedStale<HeatmapResponse>(cacheKey);
    if (stale?.success) {
      return NextResponse.json(stale);
    }
    return NextResponse.json({ success: false, error: GENERIC_LOAD_ERROR });
  }
}

async function heatmapHandler(request: NextRequest): Promise<NextResponse> {
  const mode = request.nextUrl.searchParams.get('mode') === 'my-stocks' ? 'my-stocks' : 'sp500';

  if (mode === 'my-stocks') {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;
    return handleMyStocks(authResult.userId);
  }

  return handleSp500();
}

export const GET = withRateLimit(heatmapHandler, { windowMs: 60_000, maxRequests: 5 });
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors mentioning `app/api/tools/heatmap/route.ts`.
Run: `npm run lint` — expect no errors or warnings.

- [ ] **Step 3: Manual verification — sp500 mode unchanged**

Run: `npm run dev`, then:

```bash
curl -s http://localhost:3000/api/tools/heatmap | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('success:', d.success, 'sectors:', d.sectors?.length, 'first sector stocks:', d.sectors?.[0]?.stocks?.length)"
```

Expected: `success: true`, `sectors: 11` (or close to it), a non-zero stock count in the first sector — i.e. the exact same shape the page rendered before this change. Also load `/tools/heatmap` in a browser and confirm it looks identical to before (this is the regression check for the "must remain byte-for-byte behaviorally identical" constraint).

- [ ] **Step 4: Manual verification — my-stocks mode, unauthenticated**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/tools/heatmap?mode=my-stocks
```

Expected: `401`.

- [ ] **Step 5: Manual verification — my-stocks mode, authenticated**

Sign in as the QA test account (`qa-test-agent@bullpen.no` — credentials in this project's Claude memory, `reference-qa-test-account.md`; it holds MSFT and NVDA, both S&P 500 members, so first confirm this baseline works, then see the note below about testing the actual non-S&P-500 gap). Using the browser's cookies, or by extracting a session token via the password grant (see the memory file for the pattern used earlier this session), hit:

```bash
curl -s http://localhost:3000/api/tools/heatmap?mode=my-stocks -H "Cookie: <session-cookie-from-browser>" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(JSON.stringify(d.sectors?.map(s => ({sector: s.name, tickers: s.stocks.map(st => st.ticker)})), null, 2))"
```

Expected: sectors containing `MSFT` and `NVDA`.

**To verify the actual non-S&P-500 gap this feature closes**, temporarily add a holding that is NOT in the S&P 500 (e.g. a smaller-cap name) to the QA test account via the Holdings page or a direct `user_holdings` insert, re-run the query above, and confirm that ticker gets a tile with a real sector (not `'Other'` unless it genuinely has no sector data) and real market cap — this is the scenario the old `SP500_SECTORS`-only logic could never handle correctly.

- [ ] **Step 6: Commit**

```bash
git add app/api/tools/heatmap/route.ts
git commit -m "feat: add my-stocks mode to the heatmap API"
```

---

### Task 2: Client — mode toggle, title swap, empty state

**Files:**
- Modify: `app/tools/heatmap/HeatmapClientPage.tsx`

**Interfaces:**
- Consumes: `useAuth` (`@/components/auth/AuthProvider`, already exists — `{ isAuthenticated: boolean, ... }`), `Tabs`/`TabsList`/`TabsTrigger` (`@/components/ui/tabs`, already exists, already used the same way in `components/auth/AuthModal.tsx`).

- [ ] **Step 1: Add imports and mode state**

Find:

```tsx
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Treemap, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Grid3X3, AlertCircle, Search, X, ListOrdered } from 'lucide-react';
import { useHeatmapStream } from '@/hooks/use-heatmap-stream';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { HeatmapResponse, HeatmapStock, HeatmapSector } from '@/app/api/tools/heatmap/route';
import type { Session } from '@/app/api/market/heatmap/stream/route';
```

Replace with:

```tsx
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Treemap, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Grid3X3, AlertCircle, Search, X, ListOrdered } from 'lucide-react';
import { useHeatmapStream } from '@/hooks/use-heatmap-stream';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { HeatmapResponse, HeatmapStock, HeatmapSector } from '@/app/api/tools/heatmap/route';
import type { Session } from '@/app/api/market/heatmap/stream/route';

type HeatmapMode = 'sp500' | 'my-stocks';
```

- [ ] **Step 2: Add mode state, gate it on auth, and switch the query**

Find:

```tsx
export default function HeatmapClientPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { prices: livePrices, session: liveSession, connected } = useHeatmapStream();
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<HeatmapResponse>({
    queryKey: ['heatmap'],
    queryFn: () => fetch('/api/tools/heatmap').then((r) => r.json()),
    staleTime: 3 * 60_000,
    refetchInterval: false,
  });
```

Replace with:

```tsx
export default function HeatmapClientPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<HeatmapMode>('sp500');
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { prices: livePrices, session: liveSession, connected } = useHeatmapStream();
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<HeatmapResponse>({
    queryKey: ['heatmap', mode],
    queryFn: () => fetch(`/api/tools/heatmap?mode=${mode}`).then((r) => r.json()),
    staleTime: 3 * 60_000,
    refetchInterval: false,
  });
```

- [ ] **Step 3: Add the toggle and title/subtitle swap in the header**

Find:

```tsx
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Grid3X3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">S&amp;P 500 Sector Heatmap</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Sized by market cap · colored by today&apos;s performance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <SessionBadge session={session} connected={connected} />
            {!connected && lastUpdated && (
              <span className="text-xs text-muted-foreground tabular-nums">As of {lastUpdated}</span>
            )}
          </div>
        </motion.div>
```

Replace with:

```tsx
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Grid3X3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {mode === 'my-stocks' ? 'My Stocks Heatmap' : 'S&P 500 Sector Heatmap'}
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Sized by market cap · colored by today&apos;s performance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isAuthenticated && (
              <Tabs value={mode} onValueChange={(v) => setMode(v as HeatmapMode)}>
                <TabsList>
                  <TabsTrigger value="sp500">S&amp;P 500</TabsTrigger>
                  <TabsTrigger value="my-stocks">My Stocks</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <SessionBadge session={session} connected={connected} />
            {!connected && lastUpdated && (
              <span className="text-xs text-muted-foreground tabular-nums">As of {lastUpdated}</span>
            )}
          </div>
        </motion.div>
```

- [ ] **Step 4: Add the "My Stocks" empty state**

Find:

```tsx
          ) : treemapData.length === 0 ? (
            <div className="flex h-[55vh] items-center justify-center text-muted-foreground text-sm sm:h-[65vh]">
              {sectorFilter ? `No data for ${sectorFilter}` : 'No heatmap data available'}
            </div>
          ) : (
```

Replace with:

```tsx
          ) : treemapData.length === 0 ? (
            <div className="flex h-[55vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground text-sm sm:h-[65vh]">
              {mode === 'my-stocks' && !sectorFilter ? (
                <>
                  <p>Nothing to show yet — add a stock to your holdings or watchlist to see it here.</p>
                  <div className="flex gap-3 text-xs">
                    <Link href="/holdings" className="text-primary underline-offset-4 hover:underline">
                      Go to Holdings
                    </Link>
                    <Link href="/watchlist" className="text-primary underline-offset-4 hover:underline">
                      Go to Watchlist
                    </Link>
                  </div>
                </>
              ) : (
                <p>{sectorFilter ? `No data for ${sectorFilter}` : 'No heatmap data available'}</p>
              )}
            </div>
          ) : (
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors mentioning `HeatmapClientPage.tsx`.
Run: `npm run lint` — expect no errors or warnings.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`.

1. Logged out: load `/tools/heatmap` — expect no toggle, page identical to before this change.
2. Logged in (QA test account): load `/tools/heatmap` — expect the "S&P 500 / My Stocks" toggle next to the title. Click "My Stocks" — expect the title to change to "My Stocks Heatmap," the treemap to reload via a new request to `?mode=my-stocks`, and tiles for MSFT/NVDA (the QA account's seeded holdings) to appear.
3. With a logged-in account that has zero holdings/watchlist entries (or temporarily clear the QA account's), switch to "My Stocks" — expect the empty state with links to Holdings/Watchlist instead of a blank treemap or the generic "No heatmap data available" text.
4. Switch back to "S&P 500" — expect the original full treemap to reappear (confirming the `['heatmap', mode]` query key correctly caches both modes independently rather than clobbering each other).

- [ ] **Step 7: Commit**

```bash
git add app/tools/heatmap/HeatmapClientPage.tsx
git commit -m "feat: add My Stocks toggle to the S&P 500 heatmap"
```
