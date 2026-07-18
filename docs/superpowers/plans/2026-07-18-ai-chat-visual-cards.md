# Bull Chat Visual Cards + Write-Action Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Bull's chat with visual result cards for `screenCompanies`, `getCompanyMetrics`, and a new `getInsiderActivity` tool; upgrade the existing `getEarningsData`/`getKeyStatistics` cards to use `DeltaBar`/`RangeBar`; and replace the four write-action tools' silently-failing client actions with real pending/success/error receipt cards.

**Architecture:** Split `components/ai/ToolResultCard.tsx` (currently 316 lines, 6 cases) into `components/ai/cards/` — one file per card, `ToolResultCard.tsx` reduced to a thin dispatcher. Three existing AI tools get small additive `*Raw` numeric fields (their existing formatted-string fields are untouched) so the new visual primitives have real numbers to draw with. The write-action receipt system adds a small outcome-tracking state to `BullpenChat.tsx` and unifies tool-call/client-action extraction into one indexed array (`lib/ai/tool-ux.ts`) so render and mutation logic can never disagree about which action is which.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, Vercel AI SDK (`ai`, `@ai-sdk/react`), TanStack Query, `lucide-react` icons.

## Global Constraints

- **No unit test framework exists in this repo** (confirmed: no jest/vitest/@testing-library/playwright-test in `package.json`; `CLAUDE.md` states scripts run via `tsx`, no test runner). Every task's "test" steps in this plan are therefore: (1) `npm run lint` — must report the same warning count as the current baseline (0 errors) and zero new warnings; (2) a manual verification in the running dev server using Playwright browser tools, following the exact steps given in the task. This replaces the pytest-style write-test-first loop from the standard template — do not invent a test framework or add one.
- **Dev server:** before any manual verification step, confirm a dev server is reachable at `http://localhost:3000` (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`; expect `200`). If not running, start one with `npm run dev` (background) and wait for it to report ready before proceeding.
- **Chat-prompt nondeterminism:** manual verification steps ask Bull a natural-language question and expect it to call a specific tool. The model usually does, but is not 100% deterministic. If the expected tool/card doesn't appear on the first try, rephrase the prompt to be more explicit about the data needed (e.g. add "using live data" or name the exact metric) and retry once or twice before treating it as a real failure.
- **Design tokens:** every new/modified card must stay inside the existing `CardShell` container styling (`rounded-xl border border-border/60 bg-background/60 p-3 text-xs`) and the file's existing arbitrary-value text-size convention (`text-[10px]`, `text-[11px]`) — this file predates the `text-xs`/`text-sm` convention used elsewhere in the app; match what's already there, don't "fix" it.
- **Color convention:** emerald = positive/success, red = negative/error, amber = neutral/caution — matches `DESIGN.md`'s One Signal Rule already followed throughout this file. Never introduce a new color.
- **Branch:** work happens on the `preview` branch per `CLAUDE.md`. Commit after each task. Do **not** merge to `main` — that only happens when the user explicitly says "end session."
- Never leave `console.log` in committed code.

---

## Task 1: Split `ToolResultCard.tsx` into `components/ai/cards/`

Pure mechanical refactor — no behavior or visual change. Moves the 6 existing card implementations into their own files and reduces `ToolResultCard.tsx` to a dispatcher. This is the foundation every later task builds on.

**Files:**
- Create: `components/ai/cards/CardPrimitives.tsx`
- Create: `components/ai/cards/HealthScoreResultCard.tsx`
- Create: `components/ai/cards/LiveQuoteResultCard.tsx`
- Create: `components/ai/cards/KeyStatisticsResultCard.tsx`
- Create: `components/ai/cards/CompanyProfileResultCard.tsx`
- Create: `components/ai/cards/CompanyFinancialsResultCard.tsx`
- Create: `components/ai/cards/EarningsResultCard.tsx`
- Modify: `components/ai/ToolResultCard.tsx` (rewrite in place, same exported `ToolResultCard` name/signature)

**Interfaces:**
- Produces: `CardShell({children})`, `StatCell({label, value})`, `isNegative(formatted?: string): boolean` — exported from `CardPrimitives.tsx`, consumed by every card file (this task and later tasks).
- Produces: `HealthScoreOutput`, `LiveQuoteOutput`, `KeyStatisticsOutput`, `CompanyProfileOutput`, `CompanyFinancialsRow`, `EarningsRow` — exported types from their respective card files, consumed by `ToolResultCard.tsx`'s dispatcher (this task) and extended by Tasks 2/3 (`LiveQuoteOutput`, `KeyStatisticsOutput`, `EarningsRow`).
- `ToolResultCard({ toolName, output }: { toolName: string; output: unknown })` — same signature as today. Task 2 adds `siblingCalls`; Task 8 adds `clientAction`/`actionOutcome`/`isHistorical`/`onRetryAction`.

- [ ] **Step 1: Create `components/ai/cards/CardPrimitives.tsx`**

```tsx
'use client';

/**
 * Shared building blocks for AI tool-result cards (components/ai/cards/*).
 */

export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 rounded-xl border border-border/60 bg-background/60 p-3 text-xs last:mb-0">
      {children}
    </div>
  );
}

export function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="tabular-nums font-medium text-foreground">{value}</div>
    </div>
  );
}

/** True when a formatted numeric string (e.g. "-2.34%", "-$1.2M") represents a negative value. */
export function isNegative(formatted: string | undefined): boolean {
  return typeof formatted === 'string' && formatted.trim().startsWith('-');
}
```

- [ ] **Step 2: Create `components/ai/cards/HealthScoreResultCard.tsx`**

```tsx
'use client';

import { cn } from '@/lib/utils';
import { CardShell } from './CardPrimitives';

export interface HealthScoreOutput {
  ticker: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: Array<{ name: string; score: number; max: number; label: string }>;
}

function gradeBadgeClass(grade: string): string {
  if (grade === 'A' || grade === 'B') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (grade === 'C') return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
  return 'bg-red-500/10 text-red-500 border-red-500/20';
}

function barColor(ratio: number): string {
  if (ratio >= 0.7) return 'bg-emerald-500';
  if (ratio >= 0.45) return 'bg-amber-400';
  return 'bg-red-500';
}

export function HealthScoreResultCard({ output }: { output: HealthScoreOutput }) {
  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.ticker} Financial Health</span>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', gradeBadgeClass(output.grade))}>
          {output.score}/100 · {output.grade}
        </span>
      </div>
      <div className="space-y-1.5">
        {output.categories.map((c) => {
          const unavailable = c.label?.startsWith('N/A');
          const ratio = c.max > 0 ? c.score / c.max : 0;
          return (
            <div key={c.name} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{c.name}</span>
                <span className="tabular-nums text-muted-foreground">{unavailable ? 'N/A' : `${c.score}/${c.max}`}</span>
              </div>
              {!unavailable && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', barColor(ratio))} style={{ width: `${ratio * 100}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}
```

- [ ] **Step 3: Create `components/ai/cards/LiveQuoteResultCard.tsx`**

```tsx
'use client';

import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardShell, StatCell, isNegative } from './CardPrimitives';

export interface LiveQuoteOutput {
  ticker: string;
  price: string;
  change: string;
  changePercent: string;
  open?: string;
  high?: string;
  low?: string;
}

export function LiveQuoteResultCard({ output }: { output: LiveQuoteOutput }) {
  const negative = isNegative(output.change);
  const flat = output.change === '0.00';
  const color = flat ? 'text-muted-foreground' : negative ? 'text-red-500' : 'text-emerald-500';
  const Icon = flat ? Minus : negative ? ArrowDownRight : ArrowUpRight;
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-foreground">{output.ticker}</div>
          <div className="text-lg font-semibold tabular-nums text-foreground">{output.price}</div>
        </div>
        <div className={cn('flex items-center gap-1 text-sm font-medium tabular-nums', color)}>
          <Icon className="h-3.5 w-3.5" />
          {output.changePercent}
        </div>
      </div>
      {(output.open || output.high || output.low) && (
        <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border/40 pt-2">
          <StatCell label="Open" value={output.open ?? '—'} />
          <StatCell label="High" value={output.high ?? '—'} />
          <StatCell label="Low" value={output.low ?? '—'} />
        </div>
      )}
    </CardShell>
  );
}
```

- [ ] **Step 4: Create `components/ai/cards/KeyStatisticsResultCard.tsx`**

```tsx
'use client';

import { CardShell, StatCell } from './CardPrimitives';

export interface KeyStatisticsOutput {
  ticker: string;
  marketCap: string;
  peRatioTTM: string;
  pbRatio: string;
  evToEbitda: string;
  beta: string;
  dividendYield: string;
  profitMargin: string;
}

export function KeyStatisticsResultCard({ output }: { output: KeyStatisticsOutput }) {
  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">{output.ticker} Valuation</div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        <StatCell label="Market Cap" value={output.marketCap} />
        <StatCell label="P/E (TTM)" value={output.peRatioTTM} />
        <StatCell label="P/B" value={output.pbRatio} />
        <StatCell label="EV/EBITDA" value={output.evToEbitda} />
        <StatCell label="Beta" value={output.beta} />
        <StatCell label="Div Yield" value={output.dividendYield} />
      </div>
    </CardShell>
  );
}
```

- [ ] **Step 5: Create `components/ai/cards/CompanyProfileResultCard.tsx`**

```tsx
'use client';

import { CardShell, StatCell } from './CardPrimitives';

export interface CompanyProfileOutput {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  /** Only present from getLiveCompanyProfile (TwelveData) — absent from the Supabase-backed getCompanyProfile. */
  ceo?: string | null;
  employees?: number | null;
  headquarters?: string | null;
}

export function CompanyProfileResultCard({ output }: { output: CompanyProfileOutput }) {
  return (
    <CardShell>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{output.ticker}</span>
      </div>
      {(output.sector || output.industry) && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {output.sector && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{output.sector}</span>
          )}
          {output.industry && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{output.industry}</span>
          )}
        </div>
      )}
      {(output.ceo || output.employees != null || output.headquarters) && (
        <div className="mb-1.5 grid grid-cols-3 gap-x-3 gap-y-1.5">
          {output.ceo && <StatCell label="CEO" value={output.ceo} />}
          {output.employees != null && <StatCell label="Employees" value={output.employees.toLocaleString()} />}
          {output.headquarters && <StatCell label="HQ" value={output.headquarters} />}
        </div>
      )}
      {output.description && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{output.description}</p>
      )}
    </CardShell>
  );
}
```

- [ ] **Step 6: Create `components/ai/cards/CompanyFinancialsResultCard.tsx`**

```tsx
'use client';

import { CardShell, StatCell } from './CardPrimitives';

export type CompanyFinancialsRow = Record<string, string> & { period: string };

function detectFinancialType(row: CompanyFinancialsRow): 'income' | 'balance' | 'cashflow' | null {
  if ('revenue' in row) return 'income';
  if ('totalAssets' in row) return 'balance';
  if ('operatingCashFlow' in row) return 'cashflow';
  return null;
}

export function CompanyFinancialsResultCard({ output }: { output: CompanyFinancialsRow[] }) {
  const row = output[0];
  if (!row) return null;
  const type = detectFinancialType(row);
  if (!type) return null;

  const fields: Record<typeof type, Array<{ key: string; label: string }>> = {
    income: [
      { key: 'revenue', label: 'Revenue' },
      { key: 'netIncome', label: 'Net Income' },
      { key: 'epsDiluted', label: 'EPS (diluted)' },
    ],
    balance: [
      { key: 'totalAssets', label: 'Total Assets' },
      { key: 'totalLiabilities', label: 'Total Liabilities' },
      { key: 'equity', label: 'Equity' },
    ],
    cashflow: [
      { key: 'operatingCashFlow', label: 'Operating CF' },
      { key: 'freeCashFlow', label: 'Free Cash Flow' },
      { key: 'capitalExpenditures', label: 'CapEx' },
    ],
  };

  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground capitalize">{type} statement</span>
        <span className="text-[11px] text-muted-foreground">{row.period}</span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        {fields[type].map((f) => (
          <StatCell key={f.key} label={f.label} value={row[f.key] ?? '—'} />
        ))}
      </div>
    </CardShell>
  );
}
```

- [ ] **Step 7: Create `components/ai/cards/EarningsResultCard.tsx`**

```tsx
'use client';

import { cn } from '@/lib/utils';
import { CardShell } from './CardPrimitives';

export interface EarningsRow {
  period: string;
  epsActual: string;
  epsEstimate: string;
  result: string;
  surprise: string;
}

export function EarningsResultCard({ output }: { output: EarningsRow[] }) {
  const rows = output.slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">Earnings history</div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const beat = r.result === 'Beat';
          const missed = r.result === 'Missed';
          return (
            <div key={r.period} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{r.period}</span>
              <span className="tabular-nums text-foreground">{r.epsActual} vs {r.epsEstimate} est.</span>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                  beat && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
                  missed && 'border-red-500/20 bg-red-500/10 text-red-500',
                  !beat && !missed && 'border-border/60 bg-muted/40 text-muted-foreground'
                )}
              >
                {r.result}
              </span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}
```

- [ ] **Step 8: Rewrite `components/ai/ToolResultCard.tsx` as a thin dispatcher**

Replace the entire file content with:

```tsx
'use client';

import { HealthScoreResultCard, type HealthScoreOutput } from './cards/HealthScoreResultCard';
import { LiveQuoteResultCard, type LiveQuoteOutput } from './cards/LiveQuoteResultCard';
import { KeyStatisticsResultCard, type KeyStatisticsOutput } from './cards/KeyStatisticsResultCard';
import { CompanyProfileResultCard, type CompanyProfileOutput } from './cards/CompanyProfileResultCard';
import { CompanyFinancialsResultCard, type CompanyFinancialsRow } from './cards/CompanyFinancialsResultCard';
import { EarningsResultCard, type EarningsRow } from './cards/EarningsResultCard';

/**
 * Dispatches a completed AI tool call to its matching visual card instead of
 * leaving the numbers buried in prose. Falls back to `null` for tool outputs
 * it doesn't recognize (e.g. errors, chart actions, navigation results),
 * letting the assistant's text stand alone.
 *
 * Shared by BullpenChat and the in-chart AI assistant so tool results look
 * the same regardless of which surface the user is on.
 */
export function ToolResultCard({ toolName, output }: { toolName: string; output: unknown }) {
  if (!output || typeof output !== 'object') return null;
  if ('error' in (output as Record<string, unknown>)) return null;

  switch (toolName) {
    case 'getHealthScore': {
      const o = output as Partial<HealthScoreOutput>;
      if (!o.categories || typeof o.score !== 'number') return null;
      return <HealthScoreResultCard output={o as HealthScoreOutput} />;
    }
    case 'getLiveQuote': {
      const o = output as Partial<LiveQuoteOutput>;
      if (!o.price || !o.changePercent) return null;
      return <LiveQuoteResultCard output={o as LiveQuoteOutput} />;
    }
    case 'getKeyStatistics': {
      const o = output as Partial<KeyStatisticsOutput>;
      if (!o.marketCap) return null;
      return <KeyStatisticsResultCard output={o as KeyStatisticsOutput} />;
    }
    case 'getCompanyProfile':
    case 'getLiveCompanyProfile': {
      const o = output as Partial<CompanyProfileOutput>;
      if (!o.name) return null;
      return <CompanyProfileResultCard output={o as CompanyProfileOutput} />;
    }
    case 'getCompanyFinancials': {
      if (!Array.isArray(output)) return null;
      return <CompanyFinancialsResultCard output={output as CompanyFinancialsRow[]} />;
    }
    case 'getEarningsData': {
      if (!Array.isArray(output)) return null;
      return <EarningsResultCard output={output as EarningsRow[]} />;
    }
    default:
      return null;
  }
}
```

- [ ] **Step 9: Lint**

Run: `npm run lint`
Expected: 0 errors, same warning count as before this task (no new warnings — every new file has no unused imports).

- [ ] **Step 10: Manual regression check in the browser**

1. Confirm dev server is up (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` → `200`; start `npm run dev` in background if not).
2. Navigate to `http://localhost:3000` and open the Ask Bull chat panel.
3. Send: `What is AAPL trading at, and what's its financial health score?`
4. Confirm both a live-quote card (price, change, Open/High/Low) and a health-score card (score/grade badge, 5 category bars) render exactly as they did before this refactor — same visuals, same data.

- [ ] **Step 11: Commit**

```bash
git add components/ai/cards/ components/ai/ToolResultCard.tsx
git commit -m "refactor: split ToolResultCard into components/ai/cards/"
```

---

## Task 2: `getKeyStatistics` gains `RangeBar` (52-week position)

Adds the current-price marker via a same-message sibling lookup at `getLiveQuote`.

**Files:**
- Modify: `lib/ai/tools.ts` (the `getLiveQuote` and `getKeyStatistics` tool definitions)
- Modify: `components/ai/cards/LiveQuoteResultCard.tsx`
- Modify: `components/ai/cards/KeyStatisticsResultCard.tsx`
- Modify: `components/ai/ToolResultCard.tsx`
- Modify: `components/ai/BullpenChat.tsx` (render loop only)

**Interfaces:**
- Consumes: `RangeBar` from `components/viz/RangeBar.tsx` — `{ low: number; high: number; current?: number | null; format?: (v: number) => string; lowLabel?: string; highLabel?: string; srLabel: string; className?: string }` (unchanged from the stock-page redesign).
- Consumes: `getCompletedToolCalls(message)` from `lib/ai/tool-ux.ts` — unchanged this task.
- Produces: `KeyStatisticsResultCard` gains an optional `livePrice?: number | null` prop.
- Produces: `ToolResultCard` gains an optional `siblingCalls?: Array<{ toolName: string; output: unknown }>` prop.

- [ ] **Step 1: Add `priceRaw` to `getLiveQuote` in `lib/ai/tools.ts`**

Find the `getLiveQuote` tool's `execute` return (the object with `ticker`, `price`, `change`, ...) and add one field, leaving every existing field untouched:

```ts
  execute: async ({ ticker }) => {
    try {
      const q = await getStockQuote(ticker.toUpperCase());
      // StockQuote uses short Finnhub-style fields: c=close, d=change, dp=changePercent,
      // h=high, l=low, o=open, pc=previousClose, t=timestamp
      const changeSign = (q.d ?? 0) >= 0 ? '+' : '';
      return {
        ticker: ticker.toUpperCase(),
        price: q.c != null ? `$${q.c.toFixed(2)}` : 'N/A',
        priceRaw: q.c ?? null,
        change: q.d != null ? `${changeSign}${q.d.toFixed(2)}` : 'N/A',
        changePercent: q.dp != null ? `${changeSign}${q.dp.toFixed(2)}%` : 'N/A',
        open: q.o != null ? `$${q.o.toFixed(2)}` : 'N/A',
        high: q.h != null ? `$${q.h.toFixed(2)}` : 'N/A',
        low: q.l != null ? `$${q.l.toFixed(2)}` : 'N/A',
        previousClose: q.pc != null ? `$${q.pc.toFixed(2)}` : 'N/A',
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch quote for ${ticker}: ${(err as Error).message}` };
    }
  },
```

- [ ] **Step 2: Add `week52HighRaw`/`week52LowRaw` to `getKeyStatistics` in `lib/ai/tools.ts`**

```ts
  execute: async ({ ticker }) => {
    try {
      const s = await getStatistics(ticker.toUpperCase());
      return {
        ticker: s.symbol,
        marketCap: fmt(s.marketCap),
        peRatioTTM: s.peRatioTTM?.toFixed(2) ?? 'N/A',
        peRatioForward: s.peRatioForward?.toFixed(2) ?? 'N/A',
        pbRatio: s.pbRatio?.toFixed(2) ?? 'N/A',
        evToEbitda: s.evToEbitda?.toFixed(2) ?? 'N/A',
        beta: s.beta?.toFixed(2) ?? 'N/A',
        dividendYield: fmtPct(s.dividendYield),
        profitMargin: fmtPct(s.profitMargin),
        shortRatio: s.shortRatio?.toFixed(2) ?? 'N/A',
        week52High: s.week52High != null ? `$${s.week52High.toFixed(2)}` : 'N/A',
        week52Low: s.week52Low != null ? `$${s.week52Low.toFixed(2)}` : 'N/A',
        week52HighRaw: s.week52High ?? null,
        week52LowRaw: s.week52Low ?? null,
        revenueGrowthTTM: fmtPct(s.revenueGrowthTTM),
        epsGrowthTTM: fmtPct(s.epsGrowthTTM),
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch statistics for ${ticker}: ${(err as Error).message}` };
    }
  },
```

- [ ] **Step 3: Add `priceRaw` to `LiveQuoteOutput` in `components/ai/cards/LiveQuoteResultCard.tsx`**

Add one line to the interface (no render change needed — this card doesn't use it itself, it's read by `ToolResultCard`'s sibling lookup):

```ts
export interface LiveQuoteOutput {
  ticker: string;
  price: string;
  change: string;
  changePercent: string;
  priceRaw?: number | null;
  open?: string;
  high?: string;
  low?: string;
}
```

- [ ] **Step 4: Add `RangeBar` to `components/ai/cards/KeyStatisticsResultCard.tsx`**

Replace the file's contents:

```tsx
'use client';

import { RangeBar } from '@/components/viz/RangeBar';
import { CardShell, StatCell } from './CardPrimitives';

export interface KeyStatisticsOutput {
  ticker: string;
  marketCap: string;
  peRatioTTM: string;
  pbRatio: string;
  evToEbitda: string;
  beta: string;
  dividendYield: string;
  profitMargin: string;
  week52HighRaw?: number | null;
  week52LowRaw?: number | null;
}

export function KeyStatisticsResultCard({
  output,
  livePrice,
}: {
  output: KeyStatisticsOutput;
  /** Current price from a sibling getLiveQuote call in the same message, if any — powers the RangeBar marker. */
  livePrice?: number | null;
}) {
  const hasRange =
    output.week52HighRaw != null && output.week52LowRaw != null && output.week52HighRaw > output.week52LowRaw;

  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">{output.ticker} Valuation</div>
      {hasRange && (
        <div className="mb-2.5 border-b border-border/40 pb-2.5">
          <RangeBar
            low={output.week52LowRaw!}
            high={output.week52HighRaw!}
            current={livePrice ?? null}
            srLabel={`52-week range $${output.week52LowRaw!.toFixed(2)} to $${output.week52HighRaw!.toFixed(2)}${
              livePrice != null ? `, currently $${livePrice.toFixed(2)}` : ''
            }`}
          />
        </div>
      )}
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        <StatCell label="Market Cap" value={output.marketCap} />
        <StatCell label="P/E (TTM)" value={output.peRatioTTM} />
        <StatCell label="P/B" value={output.pbRatio} />
        <StatCell label="EV/EBITDA" value={output.evToEbitda} />
        <StatCell label="Beta" value={output.beta} />
        <StatCell label="Div Yield" value={output.dividendYield} />
      </div>
    </CardShell>
  );
}
```

- [ ] **Step 5: Wire sibling-price lookup into `components/ai/ToolResultCard.tsx`**

Add a `siblingCalls` prop and a `resolveLivePrice` helper. Update the file:

```tsx
'use client';

import { HealthScoreResultCard, type HealthScoreOutput } from './cards/HealthScoreResultCard';
import { LiveQuoteResultCard, type LiveQuoteOutput } from './cards/LiveQuoteResultCard';
import { KeyStatisticsResultCard, type KeyStatisticsOutput } from './cards/KeyStatisticsResultCard';
import { CompanyProfileResultCard, type CompanyProfileOutput } from './cards/CompanyProfileResultCard';
import { CompanyFinancialsResultCard, type CompanyFinancialsRow } from './cards/CompanyFinancialsResultCard';
import { EarningsResultCard, type EarningsRow } from './cards/EarningsResultCard';

/**
 * Dispatches a completed AI tool call to its matching visual card instead of
 * leaving the numbers buried in prose. Falls back to `null` for tool outputs
 * it doesn't recognize (e.g. errors, chart actions, navigation results),
 * letting the assistant's text stand alone.
 *
 * Shared by BullpenChat and the in-chart AI assistant so tool results look
 * the same regardless of which surface the user is on.
 */

interface SiblingCall {
  toolName: string;
  output: unknown;
}

/** Finds a live price for `ticker` from a sibling getLiveQuote call in the same message, if any. */
function resolveLivePrice(siblingCalls: SiblingCall[] | undefined, ticker: string | undefined): number | null {
  if (!siblingCalls || !ticker) return null;
  for (const call of siblingCalls) {
    if (call.toolName !== 'getLiveQuote') continue;
    const o = call.output as { ticker?: string; priceRaw?: number | null } | null;
    if (o && o.ticker === ticker && typeof o.priceRaw === 'number') return o.priceRaw;
  }
  return null;
}

export function ToolResultCard({
  toolName,
  output,
  siblingCalls,
}: {
  toolName: string;
  output: unknown;
  /** Every completed tool call in the same message — used for cross-call lookups. */
  siblingCalls?: SiblingCall[];
}) {
  if (!output || typeof output !== 'object') return null;
  if ('error' in (output as Record<string, unknown>)) return null;

  switch (toolName) {
    case 'getHealthScore': {
      const o = output as Partial<HealthScoreOutput>;
      if (!o.categories || typeof o.score !== 'number') return null;
      return <HealthScoreResultCard output={o as HealthScoreOutput} />;
    }
    case 'getLiveQuote': {
      const o = output as Partial<LiveQuoteOutput>;
      if (!o.price || !o.changePercent) return null;
      return <LiveQuoteResultCard output={o as LiveQuoteOutput} />;
    }
    case 'getKeyStatistics': {
      const o = output as Partial<KeyStatisticsOutput> & { ticker?: string };
      if (!o.marketCap) return null;
      return <KeyStatisticsResultCard output={o as KeyStatisticsOutput} livePrice={resolveLivePrice(siblingCalls, o.ticker)} />;
    }
    case 'getCompanyProfile':
    case 'getLiveCompanyProfile': {
      const o = output as Partial<CompanyProfileOutput>;
      if (!o.name) return null;
      return <CompanyProfileResultCard output={o as CompanyProfileOutput} />;
    }
    case 'getCompanyFinancials': {
      if (!Array.isArray(output)) return null;
      return <CompanyFinancialsResultCard output={output as CompanyFinancialsRow[]} />;
    }
    case 'getEarningsData': {
      if (!Array.isArray(output)) return null;
      return <EarningsResultCard output={output as EarningsRow[]} />;
    }
    default:
      return null;
  }
}
```

- [ ] **Step 6: Pass `siblingCalls` from the render loop in `components/ai/BullpenChat.tsx`**

Find this block (inside the assistant-message render branch, currently around line 504):

```tsx
                    {getCompletedToolCalls(message).map((call, i) => (
                      <ToolResultCard key={`${message.id}-tool-${i}`} toolName={call.toolName} output={call.output} />
                    ))}
```

Replace with:

```tsx
                    {getCompletedToolCalls(message).map((call, i) => (
                      <ToolResultCard
                        key={`${message.id}-tool-${i}`}
                        toolName={call.toolName}
                        output={call.output}
                        siblingCalls={getCompletedToolCalls(message)}
                      />
                    ))}
```

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 8: Manual verification in the browser**

1. Open the Ask Bull chat panel.
2. Send: `What's AAPL trading at, and is it expensive right now?` (this should trigger both `getLiveQuote` and `getKeyStatistics` in the same turn).
3. Confirm the Valuation card now shows a horizontal range bar above the stat grid, with a marker positioned between the low/high ends roughly matching the live price shown in the quote card above it.
4. Send a second message: `What's NVDA's P/E ratio?` alone (no price question — should trigger only `getKeyStatistics`).
5. Confirm the range bar still renders (low/high labels) but with **no** marker dot, since there's no sibling live-quote call this turn.

- [ ] **Step 9: Commit**

```bash
git add lib/ai/tools.ts components/ai/cards/LiveQuoteResultCard.tsx components/ai/cards/KeyStatisticsResultCard.tsx components/ai/ToolResultCard.tsx components/ai/BullpenChat.tsx
git commit -m "feat: add 52-week RangeBar to the Key Statistics chat card"
```

---

## Task 3: `getEarningsData` gains `DeltaBar` (beat/miss magnitude)

**Files:**
- Modify: `lib/ai/tools.ts` (the `getEarningsData` tool)
- Modify: `components/ai/cards/EarningsResultCard.tsx`

**Interfaces:**
- Consumes: `DeltaBar` from `components/viz/DeltaBar.tsx` — `{ estimate: number | null; actual: number | null; format?: (v: number) => string; srLabel: string; className?: string }` (unchanged from the stock-page redesign).

- [ ] **Step 1: Add `epsActualRaw`/`epsEstimateRaw` to `getEarningsData` in `lib/ai/tools.ts`**

```ts
  execute: async ({ ticker }) => {
    try {
      const earnings = await getCompanyEarnings(ticker.toUpperCase(), 8);
      return earnings.map((e) => {
        const beat = e.actual != null && e.estimate != null
          ? e.actual >= e.estimate ? 'Beat' : 'Missed'
          : 'N/A';
        return {
          period: e.period,
          epsActual: e.actual?.toFixed(2) ?? 'N/A',
          epsEstimate: e.estimate?.toFixed(2) ?? 'N/A',
          epsActualRaw: e.actual ?? null,
          epsEstimateRaw: e.estimate ?? null,
          result: beat,
          surprise: e.surprisePercent != null ? `${e.surprisePercent > 0 ? '+' : ''}${e.surprisePercent.toFixed(1)}%` : 'N/A',
        };
      });
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch earnings for ${ticker}: ${(err as Error).message}` };
    }
  },
```

- [ ] **Step 2: Replace the Beat/Missed badge with `DeltaBar` in `components/ai/cards/EarningsResultCard.tsx`**

Replace the file's contents:

```tsx
'use client';

import { DeltaBar } from '@/components/viz/DeltaBar';
import { CardShell } from './CardPrimitives';

export interface EarningsRow {
  period: string;
  epsActual: string;
  epsEstimate: string;
  epsActualRaw?: number | null;
  epsEstimateRaw?: number | null;
  result: string;
  surprise: string;
}

export function EarningsResultCard({ output }: { output: EarningsRow[] }) {
  const rows = output.slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">Earnings history</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.period} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{r.period}</span>
            <DeltaBar
              estimate={r.epsEstimateRaw ?? null}
              actual={r.epsActualRaw ?? null}
              srLabel={
                r.epsActualRaw != null && r.epsEstimateRaw != null
                  ? `Earned $${r.epsActualRaw.toFixed(2)} per share vs $${r.epsEstimateRaw.toFixed(2)} expected (${r.surprise} surprise)`
                  : `Estimate $${r.epsEstimateRaw?.toFixed(2) ?? '—'} per share`
              }
            />
          </div>
        ))}
      </div>
    </CardShell>
  );
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 4: Manual verification in the browser**

1. Open the Ask Bull chat panel.
2. Send: `Show me NVDA's recent earnings history and whether it beat estimates`.
3. Confirm the earnings card now shows, per row, an actual-vs-estimate bar with a signed delta chip (e.g. `▲ +$0.05 (+4%)`) instead of the old plain "Beat"/"Missed" pill.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/tools.ts components/ai/cards/EarningsResultCard.tsx
git commit -m "feat: add DeltaBar to the Earnings chat card"
```

---

## Task 4: `ScreenerResultCard` (new card for `screenCompanies`)

**Files:**
- Create: `components/ai/cards/ScreenerResultCard.tsx`
- Modify: `components/ai/ToolResultCard.tsx`

**Interfaces:**
- Consumes: `isNegative` from `./CardPrimitives` (Task 1).
- Consumes `screenCompanies`'s existing output shape (unchanged, `lib/ai/tools.ts` lines ~345-360): `{ count: number; companies: Array<{ ticker, name, sector, revenue, grossMargin, netMargin, epsDiluted, freeCashFlow, revenueGrowth }> }` (all fields pre-formatted strings).

- [ ] **Step 1: Create `components/ai/cards/ScreenerResultCard.tsx`**

```tsx
'use client';

import { cn } from '@/lib/utils';
import { CardShell, isNegative } from './CardPrimitives';

interface ScreenerCompany {
  ticker: string;
  name: string;
  sector: string;
  revenue: string;
  grossMargin: string;
  netMargin: string;
  epsDiluted: string;
  freeCashFlow: string;
  revenueGrowth: string;
}

export interface ScreenerOutput {
  count: number;
  companies: ScreenerCompany[];
}

const VISIBLE_ROWS = 5;

function growthColor(growth: string): string {
  if (growth === 'N/A') return 'text-muted-foreground';
  return isNegative(growth) ? 'text-red-500' : 'text-emerald-500';
}

export function ScreenerResultCard({ output }: { output: ScreenerOutput }) {
  if (!output.companies || output.companies.length === 0) return null;
  const visible = output.companies.slice(0, VISIBLE_ROWS);
  const remaining = output.companies.length - visible.length;

  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">{output.count} companies matched</div>
      <div className="space-y-1.5">
        {visible.map((c) => (
          <div key={c.ticker} className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate">
              <span className="font-medium text-foreground">{c.ticker}</span>
              <span className="ml-1.5 text-[11px] text-muted-foreground">{c.name}</span>
            </div>
            <span className={cn('shrink-0 tabular-nums text-[11px] font-medium', growthColor(c.revenueGrowth))}>
              {c.revenueGrowth} rev growth
            </span>
          </div>
        ))}
      </div>
      {remaining > 0 && <div className="mt-1.5 text-[11px] text-muted-foreground">and {remaining} more</div>}
    </CardShell>
  );
}
```

- [ ] **Step 2: Add the `screenCompanies` case to `components/ai/ToolResultCard.tsx`**

Add the import near the other card imports:

```tsx
import { ScreenerResultCard, type ScreenerOutput } from './cards/ScreenerResultCard';
```

Add this case inside the `switch (toolName)` block, after the `getEarningsData` case and before `default`:

```tsx
    case 'screenCompanies': {
      const o = output as Partial<ScreenerOutput>;
      if (!Array.isArray(o.companies)) return null;
      return <ScreenerResultCard output={o as ScreenerOutput} />;
    }
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 4: Manual verification in the browser**

1. Open the Ask Bull chat panel.
2. Send: `Show me the top technology companies with revenue over 10 billion dollars`.
3. Confirm a card renders below the assistant's text with a "N companies matched" header and up to 5 rows (ticker, name, revenue-growth figure colored emerald/red), plus an "and N more" line if the screener returned more than 5.

- [ ] **Step 5: Commit**

```bash
git add components/ai/cards/ScreenerResultCard.tsx components/ai/ToolResultCard.tsx
git commit -m "feat: add visual card for the screenCompanies chat tool"
```

---

## Task 5: `CompanyMetricsResultCard` (new card for `getCompanyMetrics`)

**Files:**
- Create: `components/ai/cards/CompanyMetricsResultCard.tsx`
- Modify: `components/ai/ToolResultCard.tsx`

**Interfaces:**
- Consumes: `TrendBars` from `components/viz/TrendBars.tsx` — `{ values: (number | null)[]; height?: number; signed?: boolean; srLabel: string; className?: string }` (unchanged from the stock-page redesign).
- Consumes `getCompanyMetrics`'s existing output shape (unchanged, `lib/ai/tools.ts` lines ~161-193): `{ ticker, company, metric, period, rows: Array<{ period, periodEnd, value: number | null, formatted: string }> }`, rows ordered **newest-first**. The no-data variant returns `{ ticker, company, metric, period, note: string, rows: [] }`.

- [ ] **Step 1: Create `components/ai/cards/CompanyMetricsResultCard.tsx`**

```tsx
'use client';

import { TrendBars } from '@/components/viz/TrendBars';
import { CardShell } from './CardPrimitives';

interface MetricRow {
  period: string;
  periodEnd: string;
  value: number | null;
  formatted: string;
}

export interface CompanyMetricsOutput {
  ticker: string;
  company: string;
  metric: string;
  period: string;
  rows: MetricRow[];
}

export function CompanyMetricsResultCard({ output }: { output: CompanyMetricsOutput }) {
  if (!output.rows || output.rows.length === 0) return null;
  // Tool returns rows newest-first; TrendBars expects oldest-to-newest.
  const oldestToNewest = output.rows.slice().reverse();
  const latest = output.rows[0];

  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.company} · {output.metric}</span>
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
          {latest.period}: {latest.formatted}
        </span>
      </div>
      <TrendBars
        values={oldestToNewest.map((r) => r.value)}
        height={28}
        signed
        srLabel={`${output.metric} for ${output.company} across ${oldestToNewest.length} periods, latest ${latest.formatted}`}
        className="text-foreground"
      />
    </CardShell>
  );
}
```

- [ ] **Step 2: Add the `getCompanyMetrics` case to `components/ai/ToolResultCard.tsx`**

Add the import:

```tsx
import { CompanyMetricsResultCard, type CompanyMetricsOutput } from './cards/CompanyMetricsResultCard';
```

Add this case after the `screenCompanies` case:

```tsx
    case 'getCompanyMetrics': {
      const o = output as Partial<CompanyMetricsOutput>;
      if (!Array.isArray(o.rows) || o.rows.length === 0) return null;
      return <CompanyMetricsResultCard output={o as CompanyMetricsOutput} />;
    }
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 4: Manual verification in the browser**

1. Open the Ask Bull chat panel.
2. Send: `Show me AAPL's revenue history over the last few years`.
3. Confirm a card renders with the company/metric name, the latest period + formatted value in the header, and a horizontal bar-sparkline below it (oldest period on the left, most recent — emphasized — on the right).

- [ ] **Step 5: Commit**

```bash
git add components/ai/cards/CompanyMetricsResultCard.tsx components/ai/ToolResultCard.tsx
git commit -m "feat: add visual card for the getCompanyMetrics chat tool"
```

---

## Task 6: New `getInsiderActivity` tool + `InsiderActivityResultCard`

**Files:**
- Modify: `lib/ai/tools.ts` (new tool + import + `BULLPEN_TOOLS` entry)
- Modify: `lib/ai/systemPrompt.ts` (new tool doc + workflow line)
- Modify: `lib/ai/tool-ux.ts` (`STATUS_LABELS`/`FOLLOWUPS` entries)
- Create: `components/ai/cards/InsiderActivityResultCard.tsx`
- Modify: `components/ai/ToolResultCard.tsx`

**Interfaces:**
- Consumes: `getInsiderTransactions(symbol: string): Promise<InsiderTransaction[]>` and `InsiderTransaction` from `lib/twelvedata/twelvedata-client.ts` (existing, already used by the stock page's Insiders card) — `InsiderTransaction = { full_name, position, date_reported, is_direct, shares, value, description, transaction_type: 'buy'|'sell'|'other' }`.
- Consumes: `FlowBar` from `components/viz/FlowBar.tsx` — `{ inflow: number; inLabel: string; outflow: number; outLabel: string; netLabel?: string; srLabel: string; className?: string }` (unchanged from the stock-page redesign).
- Produces: new tool `getInsiderActivity`, output shape `{ ticker, buyValue, sellValue, netValue, buyValueRaw, sellValueRaw, netValueRaw, tradeCount, sentiment, topTransactions }` (see Step 1) — consumed only by `InsiderActivityResultCard`.

- [ ] **Step 1: Add the `getInsiderActivity` tool to `lib/ai/tools.ts`**

Add `getInsiderTransactions` to the existing `@/lib/twelvedata/twelvedata-client` import block near the top of the file:

```ts
import {
  getStockQuote,
  getStatistics,
  getCompanyEarnings,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  getCompanyProfile as getTwelveDataProfile,
  getInsiderTransactions,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';
```

Add the new tool definition immediately before the `const getHealthScore = tool({` block:

```ts
const getInsiderActivity = tool({
  description:
    'Fetch recent insider trading activity for a stock — buys and sells by executives, directors, and ' +
    '10%+ shareholders, aggregated into net buy/sell value plus the top individual trades. ' +
    'Use only when the user explicitly asks about insider buying/selling, executive trades, or insider ' +
    'sentiment — do not call this speculatively. Costs ~200 API credits.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol' },
    },
    required: ['ticker'],
  }),
  execute: async ({ ticker }) => {
    try {
      const symbol = ticker.toUpperCase();
      const transactions = await getInsiderTransactions(symbol);
      if (transactions.length === 0) {
        return { ticker: symbol, tradeCount: 0, note: 'No recent insider transactions found.' };
      }

      const buys = transactions.filter((t) => t.transaction_type === 'buy');
      const sells = transactions.filter((t) => t.transaction_type === 'sell');
      const buyValueRaw = buys.reduce((sum, t) => sum + Math.abs(t.value || 0), 0);
      const sellValueRaw = sells.reduce((sum, t) => sum + Math.abs(t.value || 0), 0);
      const netValueRaw = buyValueRaw - sellValueRaw;
      const sentiment: 'bullish' | 'bearish' | 'neutral' =
        netValueRaw > 0 ? 'bullish' : netValueRaw < 0 ? 'bearish' : 'neutral';

      const topTransactions = transactions
        .slice()
        .sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0))
        .slice(0, 3)
        .map((t) => ({
          name: t.full_name,
          position: t.position,
          type: t.transaction_type,
          value: fmt(Math.abs(t.value)),
          date: t.date_reported,
        }));

      return {
        ticker: symbol,
        buyValue: fmt(buyValueRaw),
        sellValue: fmt(sellValueRaw),
        netValue: `${netValueRaw >= 0 ? '+' : '-'}${fmt(Math.abs(netValueRaw))}`,
        buyValueRaw,
        sellValueRaw,
        netValueRaw,
        tradeCount: transactions.length,
        sentiment,
        topTransactions,
      };
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) return { error: 'Rate limit reached. Try again shortly.' };
      return { error: `Could not fetch insider activity for ${ticker}: ${(err as Error).message}` };
    }
  },
});
```

Add it to the `BULLPEN_TOOLS` export, in the "TwelveData live tools" group:

```ts
export const BULLPEN_TOOLS = {
  // Supabase tools — fast, no API credits, limited to ingested companies
  getCompanyMetrics,
  getCompanyProfile,
  searchCompanies,
  screenCompanies,
  compareCompanies,
  // Navigation
  openCompanyPage,
  openComparison,
  openScreener,
  openHoldings,
  openDiscover,
  openTools,
  openCompanyEarnings,
  openCompanyNews,
  // Portfolio management
  addHolding,
  updateHolding,
  removeHolding,
  // TwelveData live tools — real-time data for any ticker globally
  getLiveQuote,
  getKeyStatistics,
  getCompanyFinancials,
  getEarningsData,
  getHealthScore,
  getLiveCompanyProfile,
  getInsiderActivity,
};
```

- [ ] **Step 2: Document the tool in `lib/ai/systemPrompt.ts`**

Find the `getLiveCompanyProfile` tool doc block (ends with `**Cost: ~1 credit.**`) inside the `### TwelveData live tools` section, and add this immediately after it, before the `### API credit guidance` heading:

```
getInsiderActivity
Fetch recent insider trading activity — buys and sells by executives, directors, and 10%+ shareholders — aggregated into net buy/sell value, trade count, and the top individual trades. Use ONLY when the user explicitly asks about insider buying/selling, executive trades, or insider sentiment. Do not call this speculatively.
**Cost: ~200 credits.**
```

Find the `### API credit guidance` bullet list and add one line, matching the existing `getKeyStatistics` sparingly-guidance style:

```
- Use getInsiderActivity **sparingly** — only when the user explicitly asks about insider buying/selling or executive trades
```

Find the `Recommended workflows` list (inside `## Tool Usage Rules`) and add one line after the `Valuation multiples →` line:

```
- Insider buying/selling / executive trades → getInsiderActivity
```

- [ ] **Step 3: Add `STATUS_LABELS`/`FOLLOWUPS` entries in `lib/ai/tool-ux.ts`**

In the `STATUS_LABELS` map, add one line after `getCompanyMetrics: 'Pulling historical metrics…',`:

```ts
  getInsiderActivity: 'Checking insider activity…',
```

In the `FOLLOWUPS` map, add one entry after the `getLiveQuote` entry:

```ts
  getInsiderActivity: ['Show financial health', 'What is the current price?'],
```

- [ ] **Step 4: Create `components/ai/cards/InsiderActivityResultCard.tsx`**

```tsx
'use client';

import { cn } from '@/lib/utils';
import { FlowBar } from '@/components/viz/FlowBar';
import { CardShell } from './CardPrimitives';

interface InsiderTopTransaction {
  name: string;
  position: string;
  type: 'buy' | 'sell' | 'other';
  value: string;
  date: string;
}

export interface InsiderActivityOutput {
  ticker: string;
  buyValue: string;
  sellValue: string;
  netValue: string;
  buyValueRaw: number;
  sellValueRaw: number;
  netValueRaw: number;
  tradeCount: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  topTransactions: InsiderTopTransaction[];
}

export function InsiderActivityResultCard({ output }: { output: InsiderActivityOutput }) {
  if (!output.tradeCount) return null;
  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.ticker} Insider Activity</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{output.tradeCount} trades</span>
      </div>
      <FlowBar
        inflow={output.buyValueRaw}
        inLabel={`Bought ${output.buyValue}`}
        outflow={output.sellValueRaw}
        outLabel={`Sold ${output.sellValue}`}
        netLabel={`Net ${output.netValue}`}
        srLabel={`Insiders bought ${output.buyValue} and sold ${output.sellValue}`}
      />
      {output.topTransactions.length > 0 && (
        <div className="mt-2.5 space-y-1 border-t border-border/40 pt-2">
          {output.topTransactions.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">{t.name} · {t.position}</span>
              <span
                className={cn(
                  'shrink-0 tabular-nums font-medium',
                  t.type === 'buy' ? 'text-emerald-500' : t.type === 'sell' ? 'text-red-500' : 'text-muted-foreground'
                )}
              >
                {t.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}
```

- [ ] **Step 5: Add the `getInsiderActivity` case to `components/ai/ToolResultCard.tsx`**

Add the import:

```tsx
import { InsiderActivityResultCard, type InsiderActivityOutput } from './cards/InsiderActivityResultCard';
```

Add this case after the `getCompanyMetrics` case:

```tsx
    case 'getInsiderActivity': {
      const o = output as Partial<InsiderActivityOutput>;
      if (!o.tradeCount) return null;
      return <InsiderActivityResultCard output={o as InsiderActivityOutput} />;
    }
```

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 7: Manual verification in the browser**

1. Open the Ask Bull chat panel.
2. Send: `Have any AAPL executives bought or sold shares recently?`
3. Confirm the assistant calls `getInsiderActivity` (visible in the "Checking insider activity…" status label while it's running) and a card renders with a bought-vs-sold flow bar and up to 3 named recent transactions.

- [ ] **Step 8: Commit**

```bash
git add lib/ai/tools.ts lib/ai/systemPrompt.ts lib/ai/tool-ux.ts components/ai/cards/InsiderActivityResultCard.tsx components/ai/ToolResultCard.tsx
git commit -m "feat: add getInsiderActivity tool and chat card"
```

---

## Task 7: Move `ClientAction` + extend `getCompletedToolCalls` (receipt foundation)

Pure plumbing — unifies tool-call and client-action extraction into one indexed array so the render loop and the mutation loop can never disagree about which action is which. **No visible behavior change**; write-actions still work exactly as before (silently) after this task. Task 8 adds the actual visible receipts.

**Files:**
- Modify: `lib/ai/tool-ux.ts`
- Modify: `components/ai/BullpenChat.tsx`

**Interfaces:**
- Produces: `export type ClientAction = ...` (discriminated union, moved verbatim from `BullpenChat.tsx`) and `export interface ActionOutcome { status: 'pending' | 'success' | 'error'; message?: string }` from `lib/ai/tool-ux.ts` — consumed by `BullpenChat.tsx` (this task) and `components/ai/cards/ActionReceiptCard.tsx` (Task 8).
- Produces: `getCompletedToolCalls(message): Array<{ toolName: string; output: unknown; clientAction?: ClientAction }>` — the `clientAction` field is new; `toolName`/`output` unchanged.

- [ ] **Step 1: Move `ClientAction` into `lib/ai/tool-ux.ts` and extend `getCompletedToolCalls`**

Add this import at the top of `lib/ai/tool-ux.ts`, after the file's opening comment block:

```ts
import type { AlertType } from '@/types/alerts';
```

Add this type definition after the `MessageLike` interface (before `const STATUS_LABELS`):

```ts
/** A tool result's embedded `__clientAction` — an instruction the frontend executes after the message finishes streaming. */
export type ClientAction =
  | { type: 'navigate'; path: string }
  | { type: 'addHolding'; ticker: string; company_name: string; quantity?: number | null; avg_price?: number | null; date_purchased?: string | null }
  | { type: 'updateHolding'; ticker: string; quantity?: number | null; avg_price?: number | null }
  | { type: 'removeHolding'; ticker: string }
  | { type: 'createAlert'; ticker: string; companyName: string; alertType: AlertType; threshold: number };

/** The real-time outcome of a client action, tracked client-side once its mutation actually runs. */
export interface ActionOutcome {
  status: 'pending' | 'success' | 'error';
  message?: string;
}
```

Replace the existing `getCompletedToolCalls` function:

```ts
/** All completed tool calls (name + output) on a message, in order. Parses each output's `__clientAction` (if present) too. */
export function getCompletedToolCalls(
  message: MessageLike | undefined
): Array<{ toolName: string; output: unknown; clientAction?: ClientAction }> {
  if (!message?.parts) return [];
  const out: Array<{ toolName: string; output: unknown; clientAction?: ClientAction }> = [];
  for (const part of message.parts) {
    const name = toolNameFromPart(part);
    if (!name || part.state !== 'output-available') continue;
    let clientAction: ClientAction | undefined;
    if (part.output && typeof part.output === 'object') {
      const raw = part.output as { __clientAction?: unknown };
      if (raw.__clientAction && typeof (raw.__clientAction as { type?: unknown }).type === 'string') {
        clientAction = raw.__clientAction as ClientAction;
      }
    }
    out.push({ toolName: name, output: part.output, clientAction });
  }
  return out;
}
```

Add `createAlert` to `STATUS_LABELS` (currently missing — falls back to generic "Working…" today), alongside the other portfolio/alert entries:

```ts
  addHolding: 'Adding to your holdings…',
  updateHolding: 'Updating your holding…',
  removeHolding: 'Removing holding…',
  createAlert: 'Setting up your alert…',
```

- [ ] **Step 2: Remove the duplicate `ClientAction`/`extractClientActions` from `components/ai/BullpenChat.tsx` and adapt `onFinish`**

Remove this block entirely (currently around lines 67-87):

```tsx
type ClientAction =
  | { type: 'navigate'; path: string }
  | { type: 'addHolding'; ticker: string; company_name: string; quantity?: number | null; avg_price?: number | null; date_purchased?: string | null }
  | { type: 'updateHolding'; ticker: string; quantity?: number | null; avg_price?: number | null }
  | { type: 'removeHolding'; ticker: string }
  | { type: 'createAlert'; ticker: string; companyName: string; alertType: AlertType; threshold: number };

function extractClientActions(message: { parts?: Array<{ type?: string; state?: string; output?: unknown; result?: unknown }> }): ClientAction[] {
  const actions: ClientAction[] = [];
  for (const part of message.parts ?? []) {
    if (!part.type?.startsWith('tool-')) continue;
    const p = part as { state?: string; output?: unknown; result?: unknown };
    const raw = p.output ?? p.result;
    if (!raw || typeof raw !== 'object') continue;
    const out = raw as { __clientAction?: Record<string, unknown> };
    if (out.__clientAction && typeof (out.__clientAction as Record<string, unknown>).type === 'string') {
      actions.push(out.__clientAction as ClientAction);
    }
  }
  return actions;
}
```

Update the `lib/ai/tool-ux` import line (currently line 26) to pull in the type:

```tsx
import { getActiveToolName, getToolStatusLabel, getCompletedToolCalls, getFollowups, extractTickers, type ClientAction } from '@/lib/ai/tool-ux';
```

Remove the now-unused `import type { AlertType } from '@/types/alerts';` line — `ClientAction` no longer needs to be assembled locally, so this import is no longer referenced anywhere in the file (confirm with a search before deleting; if anything else in the file still uses `AlertType` directly, keep it).

Replace the `onFinish` handler's action loop (currently the `for (const action of extractClientActions(message)) { ... }` block) with:

```tsx
      for (const call of getCompletedToolCalls(message)) {
        const action = call.clientAction;
        if (!action) continue;
        if (action.type === 'navigate' && action.path) {
          router.push(action.path);
        } else if (action.type === 'addHolding') {
          try {
            await addHoldingMutation.mutateAsync({
              symbol: action.ticker,
              company_name: action.company_name,
              quantity: action.quantity ?? null,
              avg_price: action.avg_price ?? null,
              date_purchased: action.date_purchased ?? null,
            });
          } catch {
            // Silently skip — user may not be logged in or holding already exists
          }
        } else if (action.type === 'updateHolding') {
          try {
            await updateHoldingMutation.mutateAsync({
              symbol: action.ticker,
              quantity: action.quantity ?? undefined,
              avg_price: action.avg_price ?? undefined,
            });
          } catch {
            // Silently skip — holding may not exist
          }
        } else if (action.type === 'removeHolding') {
          try {
            await removeHoldingMutation.mutateAsync(action.ticker);
          } catch {
            // Silently skip — holding may not exist
          }
        } else if (action.type === 'createAlert') {
          try {
            await createAlert({
              symbol: action.ticker,
              companyName: action.companyName,
              alertType: action.alertType,
              threshold: action.threshold,
            });
          } catch {
            // Silently skip
          }
        }
      }
```

(This is behavior-identical to the code it replaces — only the iteration source changed, from the removed `extractClientActions(message)` to `getCompletedToolCalls(message)` filtered inline. Task 8 replaces this whole block with real outcome tracking.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings, no unused-import warnings from the removed code.

- [ ] **Step 4: Manual regression check in the browser**

1. Sign in (write-actions require auth).
2. Open the Ask Bull chat panel.
3. Send: `Add 5 shares of MSFT to my holdings at $420`.
4. Confirm the assistant's text still confirms the addition, and check `/holdings` (or the Holdings widget) afterward to confirm MSFT was actually added — same end-to-end behavior as before this task, just routed through the new shared extraction path.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/tool-ux.ts components/ai/BullpenChat.tsx
git commit -m "refactor: unify client-action extraction into getCompletedToolCalls"
```

---

## Task 8: `ActionReceiptCard` + real pending/success/error state

The core fix: write-actions get a visible, honest outcome instead of an optimistic claim that might be silently wrong.

**Files:**
- Create: `components/ai/cards/ActionReceiptCard.tsx`
- Modify: `components/ai/ToolResultCard.tsx`
- Modify: `components/ai/BullpenChat.tsx`

**Interfaces:**
- Consumes: `ClientAction`, `ActionOutcome` from `lib/ai/tool-ux.ts` (Task 7).
- Produces: `ActionReceiptCard({ action, outcome, isHistorical, onRetry })` and `type ActionableClientAction = Exclude<ClientAction, { type: 'navigate' }>`.
- Produces: `ToolResultCard` gains `clientAction?: ClientAction`, `actionOutcome?: ActionOutcome`, `isHistorical?: boolean`, `onRetryAction?: () => void`.

- [ ] **Step 1: Create `components/ai/cards/ActionReceiptCard.tsx`**

```tsx
'use client';

import { Loader2, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { alertTypeLabel, describeAlert } from '@/types/alerts';
import type { ClientAction, ActionOutcome } from '@/lib/ai/tool-ux';

export type ActionableClientAction = Exclude<ClientAction, { type: 'navigate' }>;

function describeAction(action: ActionableClientAction): string {
  switch (action.type) {
    case 'addHolding': {
      const qty = action.quantity != null ? `${action.quantity} shares of ` : '';
      return `Add ${qty}${action.ticker} to your holdings`;
    }
    case 'updateHolding': {
      const parts: string[] = [];
      if (action.quantity != null) parts.push(`${action.quantity} shares`);
      if (action.avg_price != null) parts.push(`avg price $${action.avg_price}`);
      return parts.length > 0 ? `Update ${action.ticker} — ${parts.join(', ')}` : `Update ${action.ticker}`;
    }
    case 'removeHolding':
      return `Remove ${action.ticker} from your holdings`;
    case 'createAlert':
      return `${alertTypeLabel(action.alertType)} alert for ${action.ticker} — ${describeAlert({
        alertType: action.alertType,
        threshold: action.threshold,
      })}`;
  }
}

function successMessage(action: ActionableClientAction): string {
  switch (action.type) {
    case 'addHolding':
      return `Added ${action.ticker} to your holdings`;
    case 'updateHolding':
      return `Updated ${action.ticker}`;
    case 'removeHolding':
      return `Removed ${action.ticker} from your holdings`;
    case 'createAlert':
      return `Alert set for ${action.ticker}`;
  }
}

interface ActionReceiptCardProps {
  action: ActionableClientAction;
  outcome?: ActionOutcome;
  /** True when this message was loaded from a past conversation, not created live this session. */
  isHistorical: boolean;
  onRetry?: () => void;
}

export function ActionReceiptCard({ action, outcome, isHistorical, onRetry }: ActionReceiptCardProps) {
  const description = describeAction(action);

  // Historical messages never had their outcome recorded in this session —
  // show a neutral "requested" view instead of a fake or stuck-forever status.
  if (isHistorical && !outcome) {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 p-3 text-xs last:mb-0">
        <span className="text-muted-foreground">{description}</span>
      </div>
    );
  }

  const status = outcome?.status ?? 'pending';

  return (
    <div className="mb-2 flex items-start gap-2 rounded-xl border border-border/60 bg-background/60 p-3 text-xs last:mb-0">
      {status === 'pending' && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      {status === 'success' && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />}
      {status === 'error' && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />}
      <div className="min-w-0 flex-1">
        <div className={cn('text-foreground', status === 'error' && 'text-red-500')}>
          {status === 'success'
            ? outcome?.message ?? successMessage(action)
            : status === 'error'
              ? outcome?.message ?? 'Something went wrong.'
              : description}
        </div>
        {status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the action branch into `components/ai/ToolResultCard.tsx`**

Add these imports at the top, alongside the other card imports:

```tsx
import { ActionReceiptCard, type ActionableClientAction } from './cards/ActionReceiptCard';
import type { ClientAction, ActionOutcome } from '@/lib/ai/tool-ux';
```

Update the component's prop type and add the early-return branch — replace the function signature and its first lines:

```tsx
export function ToolResultCard({
  toolName,
  output,
  siblingCalls,
  clientAction,
  actionOutcome,
  isHistorical,
  onRetryAction,
}: {
  toolName: string;
  output: unknown;
  /** Every completed tool call in the same message — used for cross-call lookups. */
  siblingCalls?: SiblingCall[];
  /** Present only when this call is a write-action (addHolding/updateHolding/removeHolding/createAlert/navigate). */
  clientAction?: ClientAction;
  actionOutcome?: ActionOutcome;
  isHistorical?: boolean;
  onRetryAction?: () => void;
}) {
  if (clientAction && clientAction.type !== 'navigate') {
    return (
      <ActionReceiptCard
        action={clientAction as ActionableClientAction}
        outcome={actionOutcome}
        isHistorical={!!isHistorical}
        onRetry={onRetryAction}
      />
    );
  }

  if (!output || typeof output !== 'object') return null;
  if ('error' in (output as Record<string, unknown>)) return null;

  switch (toolName) {
```

(Everything below the `switch (toolName) {` line — all the existing `case` blocks — stays exactly as it is after Task 6.)

- [ ] **Step 3: Add receipt state to `components/ai/BullpenChat.tsx`**

Add `useCallback` to the existing `react` import (currently line 8):

```tsx
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
```

Add `ActionOutcome` to the `lib/ai/tool-ux` import (already updated in Task 7 to include `ClientAction`):

```tsx
import { getActiveToolName, getToolStatusLabel, getCompletedToolCalls, getFollowups, extractTickers, type ClientAction, type ActionOutcome } from '@/lib/ai/tool-ux';
```

Add two new pieces of state, right after the existing `const [ownConversationId] = useState(...)` / `const activeConversationId = ...` lines:

```tsx
  const [actionOutcomes, setActionOutcomes] = useState<Record<string, ActionOutcome>>({});
  // Message ids present when this chat mounted (i.e. loaded from a saved conversation) —
  // anything appended afterward is "live" and gets real pending/success/error tracking.
  const [historicalMessageIds] = useState(() => new Set((initialMessages ?? []).map((m) => m.id)));
```

- [ ] **Step 4: Extract `runClientAction` in `components/ai/BullpenChat.tsx`**

Add this function after the state declarations from Step 3, before the `useChat({...})` call:

```tsx
  const runClientAction = useCallback(
    async (action: ClientAction, key: string) => {
      if (action.type === 'navigate') {
        if (action.path) router.push(action.path);
        return;
      }

      setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'pending' } }));

      try {
        if (action.type === 'addHolding') {
          await addHoldingMutation.mutateAsync({
            symbol: action.ticker,
            company_name: action.company_name,
            quantity: action.quantity ?? null,
            avg_price: action.avg_price ?? null,
            date_purchased: action.date_purchased ?? null,
          });
          setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'success' } }));
        } else if (action.type === 'updateHolding') {
          await updateHoldingMutation.mutateAsync({
            symbol: action.ticker,
            quantity: action.quantity ?? undefined,
            avg_price: action.avg_price ?? undefined,
          });
          setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'success' } }));
        } else if (action.type === 'removeHolding') {
          await removeHoldingMutation.mutateAsync(action.ticker);
          setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'success' } }));
        } else if (action.type === 'createAlert') {
          const result = await createAlert({
            symbol: action.ticker,
            companyName: action.companyName,
            alertType: action.alertType,
            threshold: action.threshold,
          });
          if (result.ok) {
            setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'success' } }));
          } else {
            setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'error', message: result.error } }));
          }
        }
      } catch (err) {
        setActionOutcomes((prev) => ({
          ...prev,
          [key]: { status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' },
        }));
      }
    },
    [router, addHoldingMutation, updateHoldingMutation, removeHoldingMutation, createAlert]
  );
```

- [ ] **Step 5: Rewrite `onFinish`'s action loop to use `runClientAction`**

Replace the `for (const call of getCompletedToolCalls(message)) { ... }` block added in Task 7 with:

```tsx
      getCompletedToolCalls(message).forEach((call, i) => {
        if (call.clientAction) {
          void runClientAction(call.clientAction, `${message.id}::${i}`);
        }
      });
```

- [ ] **Step 6: Pass the new props from the render loop**

Replace the render block from Task 2 (Step 6):

```tsx
                    {getCompletedToolCalls(message).map((call, i) => (
                      <ToolResultCard
                        key={`${message.id}-tool-${i}`}
                        toolName={call.toolName}
                        output={call.output}
                        siblingCalls={getCompletedToolCalls(message)}
                      />
                    ))}
```

with:

```tsx
                    {getCompletedToolCalls(message).map((call, i) => {
                      const actionKey = `${message.id}::${i}`;
                      return (
                        <ToolResultCard
                          key={`${message.id}-tool-${i}`}
                          toolName={call.toolName}
                          output={call.output}
                          siblingCalls={getCompletedToolCalls(message)}
                          clientAction={call.clientAction}
                          actionOutcome={call.clientAction ? actionOutcomes[actionKey] : undefined}
                          isHistorical={historicalMessageIds.has(message.id)}
                          onRetryAction={call.clientAction ? () => runClientAction(call.clientAction!, actionKey) : undefined}
                        />
                      );
                    })}
```

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 8: Manual verification — happy path**

1. Sign in, open the Ask Bull chat panel.
2. Send: `Add 3 shares of TSLA to my holdings`.
3. Immediately after the tool result appears (before the assistant finishes its full reply), confirm a receipt card shows a spinner + "Add 3 shares of TSLA to your holdings".
4. Within a couple seconds, confirm the card flips to a ✓ emerald "Added TSLA to your holdings" state.
5. Confirm `/holdings` actually shows the new TSLA position.

- [ ] **Step 9: Manual verification — forced failure path**

1. In the browser, open DevTools → Network tab → set throttling to "Offline".
2. Send: `Add 2 shares of NFLX to my holdings`.
3. Confirm the receipt card shows the pending spinner, then flips to a ✗ red error state with a "Retry" button (the mutation's fetch fails while offline).
4. Set Network throttling back to "No throttling" / "Online".
5. Click "Retry" on the card and confirm it goes back to pending, then flips to ✓ success, and the holding actually appears in `/holdings`.

- [ ] **Step 10: Manual verification — historical conversation**

1. Open the Ask Bull chat history (if the app has a history dropdown, e.g. in `AISidePanel`) and reopen a past conversation that contains an earlier write-action (from before this session, or one just created above).
2. Confirm that action's card renders the neutral "you asked to..." style with **no** spinner and **no** status icon — not stuck pending, not falsely marked success.

- [ ] **Step 11: Commit**

```bash
git add components/ai/cards/ActionReceiptCard.tsx components/ai/ToolResultCard.tsx components/ai/BullpenChat.tsx
git commit -m "feat: real pending/success/error receipts for chat write-actions"
```

---

## Final Verification (after all 8 tasks)

- [ ] Run `npm run lint` once more — 0 errors, same baseline warning count as the start of this plan.
- [ ] In the browser, run through one multi-tool conversation end-to-end: ask Bull about a stock's price + valuation + earnings + insider activity + financial health in a few messages, confirming every card type renders correctly together in one conversation.
- [ ] Confirm the in-chart AI assistant (`ChartAIPanel`, opened from a stock page's chart) still renders its own tool results normally — it shares `ToolResultCard` but has no portfolio/alert tools, so it should never hit the new `clientAction` branch. Open a stock page, open the chart AI panel, ask it something that triggers a chart tool (e.g. "add an RSI indicator"), and confirm no console errors.
- [ ] Commit and push to `preview` (do not merge to `main` unless the user has said "end session"):

```bash
git push origin preview
```
