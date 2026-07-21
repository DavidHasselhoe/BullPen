# Bull → Dividend Calculator Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Bull (the AI chat assistant) a tool that navigates the user to `/tools/dividend` with stocks pre-filled, so "build me a high yield dividend portfolio" produces a concrete, editable starting point instead of prose.

**Architecture:** A new `openDividendCalculator` client-action tool in `lib/ai/tools.ts` (same family as the existing `openScreener`/`openComparison` navigate tools) resolves picks + amounts server-side, JSON-encodes them into a `seed` query param, and returns a `navigate` action. `app/tools/dividend/page.tsx` — currently a bare wrapper — gains `useSearchParams()` parsing (mirroring `app/tools/compare/page.tsx`) to decode that param into the `initialHoldings` prop `DividendClientPage.tsx` already accepts. `lib/ai/systemPrompt.ts` documents the new tool and disambiguates it from the existing screener "high-yield dividend" filter mapping.

**Tech Stack:** Next.js 16 App Router, Vercel AI SDK `tool()`/`jsonSchema()`, TanStack Query (unaffected), no unit test framework in this repo.

## Global Constraints

- **No unit test framework exists in this repo** (confirmed: no jest/vitest/@testing-library in `package.json`; scripts run via `tsx`, no test runner). Every task's verification is therefore: (1) `npm run lint` — must report 0 errors and no new warnings; (2) either a standalone `tsx` script (for pure server-side logic) or a manual check in the running dev server (for anything UI/routing-visible). This replaces the pytest-style write-test-first loop from the standard plan template — do not invent a test framework or add one.
- **Dev server:** before any manual verification step, confirm a dev server is reachable at `http://localhost:3000` (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`; expect `200`). If not running, start one with `npm run dev` (background) and wait for it to report ready before proceeding.
- **Picks cap:** 15 (matches `MAX_HOLDINGS` in `DividendClientPage.tsx`) — enforced via JSON schema `maxItems` on the tool's `picks` input, not a runtime check.
- **Amount-only mode (v1):** every seeded holding uses `mode: 'amount'`. No share-count seeding from chat.
- **Default picks:** the tool's no-picks-given default reuses `DIVIDEND_QUICK_PICKS.filter(p => p.highYield)` from `lib/finance/dividend-quick-picks.ts` verbatim — do not hardcode a separate ticker list.
- **Default position size:** flat `$10,000` per stock, matching `EMPTY_ROW` in `DividendClientPage.tsx`. A user-supplied `totalAmount` splits evenly across the resolved picks instead.
- **Replace, not append:** seeded holdings replace the calculator's starting rows for that page visit (this falls out of how `initialHoldings` already works in `DividendClientPage.tsx` — no special-casing needed).
- **No changes** to `DividendClientPage.tsx`, `app/api/tools/dividend/route.ts`, or the quick-pick chips feature — their existing contracts already support everything this plan needs.

---

## Task 1: `openDividendCalculator` tool in `lib/ai/tools.ts`

Adds the tool itself and registers it in the exported tool map. Verified standalone via a throwaway `tsx` script (no UI dependency yet — Task 2 wires up the page that actually reads the URL this tool produces).

**Files:**
- Modify: `lib/ai/tools.ts` (add import, add tool definition after `openCompanyNews`, register in `BULLPEN_TOOLS`)
- Create (temporary, deleted within this task): `scripts/tmp-verify-dividend-tool.ts`

**Interfaces:**
- Consumes: `resolveCompanyName(ticker: string): Promise<string>` (already defined in `lib/ai/tools.ts`, used by `addHolding`). `clientAction<T>(action: T)` helper (already defined). `DIVIDEND_QUICK_PICKS: DividendPick[]` from `lib/finance/dividend-quick-picks.ts` where `DividendPick = { ticker: string; name: string; highYield?: boolean }`.
- Produces: `export const openDividendCalculator` — a `Tool` (from the `ai` package) added to `BULLPEN_TOOLS`. Its `execute` resolves to `{ __clientAction: { type: 'navigate'; path: string }, addedStocks: string[], description: string }`. The `path` is `/tools/dividend?seed=<JSON-encoded DividendSeedHolding[]>[&years=<n>]` where each seed entry is `{ ticker: string; name: string; mode: 'amount'; value: string }` — this is the exact shape `DividendSeedHolding` in `app/tools/dividend/DividendClientPage.tsx` already declares, consumed by Task 2.

- [ ] **Step 1: Add the `DIVIDEND_QUICK_PICKS` import**

In `lib/ai/tools.ts`, find this existing import (near the top of the file):

```ts
import { AlertTypeSchema, alertTypeLabel, describeAlert, FREE_ACTIVE_ALERT_LIMIT, type AlertType } from '@/types/alerts';
```

Add a new import directly below it:

```ts
import { AlertTypeSchema, alertTypeLabel, describeAlert, FREE_ACTIVE_ALERT_LIMIT, type AlertType } from '@/types/alerts';
import { DIVIDEND_QUICK_PICKS } from '@/lib/finance/dividend-quick-picks';
```

- [ ] **Step 2: Add the tool definition**

In `lib/ai/tools.ts`, find the end of the `openCompanyNews` tool and the start of the "Add Holding" section:

```ts
export const openCompanyNews = tool({
  description:
    'Open a company\'s stock page and scroll to the news section. Use when the user asks for news, headlines, or recent updates about a company.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: { ticker: { type: 'string', description: 'Stock ticker symbol' } },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker }) => {
    const company = await resolveCompanyId(ticker);
    if (!company) return { error: `Company "${ticker}" not found.` };
    return { ...clientAction({ type: 'navigate', path: `/stock/${ticker.toUpperCase()}#news` }), opened: company.name };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Add Holding (client action — frontend executes with user context)
// ─────────────────────────────────────────────────────────────────────────────
```

Insert a new tool between them, so the file reads:

```ts
export const openCompanyNews = tool({
  description:
    'Open a company\'s stock page and scroll to the news section. Use when the user asks for news, headlines, or recent updates about a company.',
  inputSchema: jsonSchema<{ ticker: string }>({
    type: 'object',
    properties: { ticker: { type: 'string', description: 'Stock ticker symbol' } },
    required: ['ticker'],
    additionalProperties: false,
  }),
  execute: async ({ ticker }) => {
    const company = await resolveCompanyId(ticker);
    if (!company) return { error: `Company "${ticker}" not found.` };
    return { ...clientAction({ type: 'navigate', path: `/stock/${ticker.toUpperCase()}#news` }), opened: company.name };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Open Dividend Calculator (client action — navigate with pre-filled picks)
// ─────────────────────────────────────────────────────────────────────────────

/** Default picks when the user doesn't name specific stocks — same set the calculator's own "Quick add" row flags as high-yield. */
const DEFAULT_DIVIDEND_PICKS: { ticker: string }[] = DIVIDEND_QUICK_PICKS
  .filter((p) => p.highYield)
  .map((p) => ({ ticker: p.ticker }));

export const openDividendCalculator = tool({
  description:
    'Open the Dividend Calculator pre-filled with stocks. Use when the user wants to build, create, or project ' +
    'a dividend portfolio — "build me a high yield dividend portfolio", "what would $50k in dividend stocks earn me", ' +
    '"set up a dividend portfolio with KO, JNJ, and O". If the user names specific stocks, pass them in picks; ' +
    'otherwise this tool defaults to a curated high-yield set on its own — do not invent tickers yourself. If the ' +
    'user gives a dollar amount, pass it as totalAmount (split evenly across picks) or set amount on individual picks. ' +
    'This only pre-fills the page — it does not compute or state projected income itself; the user still needs to ' +
    'press Calculate, so do not claim specific income numbers from this tool\'s result.',
  inputSchema: jsonSchema<{
    picks?: { ticker: string; amount?: number }[];
    totalAmount?: number;
    years?: number;
  }>({
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        maxItems: 15,
        items: {
          type: 'object',
          properties: {
            ticker: { type: 'string', description: 'Stock ticker symbol, e.g. KO, O, VZ' },
            amount: {
              type: 'number',
              minimum: 0,
              description: 'Dollar amount to invest in this stock (optional — overrides totalAmount/default split for this pick)',
            },
          },
          required: ['ticker'],
          additionalProperties: false,
        },
        description: 'Specific stocks to pre-fill. Omit entirely to use a curated high-yield default set.',
      },
      totalAmount: {
        type: 'number',
        minimum: 0,
        description: 'Total dollars to invest, split evenly across the resolved picks. Ignored for picks that set their own amount.',
      },
      years: {
        type: 'number',
        minimum: 1,
        maximum: 30,
        description: "Projection period in years (defaults to the calculator's own default of 10 if omitted)",
      },
    },
    additionalProperties: false,
  }),
  execute: async ({ picks, totalAmount, years }) => {
    const chosen: { ticker: string; amount?: number }[] =
      picks && picks.length > 0 ? picks.slice(0, 15) : DEFAULT_DIVIDEND_PICKS;

    const perStockAmount = totalAmount != null && totalAmount > 0 ? totalAmount / chosen.length : null;

    const resolved = await Promise.all(
      chosen.map(async (p) => {
        const ticker = p.ticker.toUpperCase();
        const name = await resolveCompanyName(ticker);
        const amount = p.amount != null ? p.amount : (perStockAmount ?? 10000);
        return {
          ticker,
          name,
          mode: 'amount' as const,
          value: String(Math.round(amount)),
        };
      })
    );

    const params = new URLSearchParams();
    params.set('seed', JSON.stringify(resolved));
    if (years != null) params.set('years', String(Math.round(years)));

    return {
      ...clientAction({ type: 'navigate', path: `/tools/dividend?${params.toString()}` }),
      addedStocks: resolved.map((r) => `${r.ticker} ($${Number(r.value).toLocaleString('en-US')})`),
      description: `Opened the Dividend Calculator with ${resolved.length} stock(s) pre-filled.`,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Add Holding (client action — frontend executes with user context)
// ─────────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 3: Register the tool in `BULLPEN_TOOLS`**

In `lib/ai/tools.ts`, find this in the `BULLPEN_TOOLS` map:

```ts
  openCompanyEarnings,
  openCompanyNews,
  // Portfolio management
```

Change to:

```ts
  openCompanyEarnings,
  openCompanyNews,
  openDividendCalculator,
  // Portfolio management
```

- [ ] **Step 4: Create the temporary verification script**

Create `scripts/tmp-verify-dividend-tool.ts`:

```ts
// Temporary verification script for openDividendCalculator — run once, then delete.
// Run with: npx tsx scripts/tmp-verify-dividend-tool.ts
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDividendCalculator } from '../lib/ai/tools';

type ExecuteFn = NonNullable<typeof openDividendCalculator.execute>;

async function main() {
  const options = { toolCallId: 'test', messages: [] } as unknown as Parameters<ExecuteFn>[1];
  const execute = openDividendCalculator.execute as ExecuteFn;

  console.log('--- Default picks (no input) ---');
  console.log(JSON.stringify(await execute({}, options), null, 2));

  console.log('\n--- Explicit picks with totalAmount + years ---');
  console.log(
    JSON.stringify(
      await execute({ picks: [{ ticker: 'KO' }, { ticker: 'JNJ' }], totalAmount: 20000, years: 15 }, options),
      null,
      2
    )
  );

  console.log('\n--- Per-pick amount override ---');
  console.log(
    JSON.stringify(
      await execute({ picks: [{ ticker: 'O', amount: 5000 }, { ticker: 'VZ', amount: 15000 }] }, options),
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 5: Run the verification script**

Run: `npx tsx scripts/tmp-verify-dividend-tool.ts`

Expected:
- No thrown errors.
- "Default picks" block: `addedStocks` has exactly 5 entries for tickers `O`, `VZ`, `MO`, `T`, `PFE`, each showing `($10,000)`. `__clientAction.path` starts with `/tools/dividend?seed=` and (URL-decoded) contains 5 objects each with `"mode":"amount"` and `"value":"10000"`. No `years` in the path.
- "Explicit picks" block: `addedStocks` has 2 entries for `KO` and `JNJ`, each `($10,000)` (20000 split evenly across 2). Path contains `&years=15`.
- "Per-pick amount override" block: `addedStocks` shows `O ($5,000)` and `VZ ($15,000)` — the per-pick `amount` wins over the default.

- [ ] **Step 6: Delete the temporary script**

```bash
rm scripts/tmp-verify-dividend-tool.ts
```

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 8: Commit**

```bash
git add lib/ai/tools.ts
git commit -m "feat: add openDividendCalculator tool for Bull"
```

---

## Task 2: URL-driven seeding in `app/tools/dividend/page.tsx`

Converts the bare page wrapper into a client component that reads the `seed`/`years` query params Task 1's tool produces and feeds them into `DividendClientPage`'s existing `initialHoldings`/`initialYears` props. Independently testable by hand-crafting a seed URL — does not depend on Task 1 or Task 3 being wired up.

**Files:**
- Modify (full rewrite — file is currently 7 lines): `app/tools/dividend/page.tsx`

**Interfaces:**
- Consumes: `DividendSeedHolding` type and `initialHoldings?: DividendSeedHolding[]` / `initialYears?: number` props from `app/tools/dividend/DividendClientPage.tsx` (already exist, unchanged by this task).
- Produces: nothing new consumed by later tasks — this is the terminal piece of the URL → page pipeline.

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `app/tools/dividend/page.tsx`:

```tsx
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import DividendClientPage, { type DividendSeedHolding } from './DividendClientPage';

export const dynamic = 'force-dynamic';

function isValidSeed(value: unknown): value is DividendSeedHolding[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((h) => {
    if (!h || typeof h !== 'object') return false;
    const r = h as Record<string, unknown>;
    return (
      typeof r.ticker === 'string' &&
      typeof r.name === 'string' &&
      typeof r.value === 'string' &&
      (r.mode === 'amount' || r.mode === 'shares')
    );
  });
}

function DividendPageContent() {
  const searchParams = useSearchParams();

  const seedParam = searchParams.get('seed');
  let initialHoldings: DividendSeedHolding[] | undefined;
  if (seedParam) {
    try {
      const parsed = JSON.parse(seedParam);
      if (isValidSeed(parsed)) initialHoldings = parsed;
    } catch {
      initialHoldings = undefined;
    }
  }

  const yearsParam = searchParams.get('years');
  const parsedYears = yearsParam ? parseInt(yearsParam, 10) : NaN;
  const initialYears = Number.isFinite(parsedYears) && parsedYears > 0 ? parsedYears : undefined;

  return <DividendClientPage initialHoldings={initialHoldings} initialYears={initialYears} />;
}

export default function DividendPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-4xl py-10 px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <DividendPageContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 3: Manual verification in the browser**

1. Confirm dev server is up (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` → `200`; start `npm run dev` in background if not).
2. Navigate to:
   ```
   http://localhost:3000/tools/dividend?seed=%5B%7B%22ticker%22%3A%22O%22%2C%22name%22%3A%22Realty%20Income%22%2C%22mode%22%3A%22amount%22%2C%22value%22%3A%2210000%22%7D%2C%7B%22ticker%22%3A%22VZ%22%2C%22name%22%3A%22Verizon%22%2C%22mode%22%3A%22amount%22%2C%22value%22%3A%225000%22%7D%5D&years=15
   ```
   (this is `[{"ticker":"O","name":"Realty Income","mode":"amount","value":"10000"},{"ticker":"VZ","name":"Verizon","mode":"amount","value":"5000"}]` with `years=15`, URL-encoded)
3. Confirm the page loads without error, "Your portfolio" shows two rows — `O` / Realty Income at `10,000` and `VZ` / Verizon at `5,000` — and "Projection period" has the `15 years` pill selected.
4. Navigate to `http://localhost:3000/tools/dividend?seed=not-json` and confirm the page still loads (falls back to the default empty row / localStorage, no crash, no console error about unhandled JSON parse).
5. Navigate to `http://localhost:3000/tools/dividend` (no params) and confirm it behaves exactly as before this task (empty row or previously saved portfolio, unchanged).

- [ ] **Step 4: Commit**

```bash
git add app/tools/dividend/page.tsx
git commit -m "feat: seed the dividend calculator from a seed/years URL param"
```

---

## Task 3: System prompt routing for `openDividendCalculator`

Documents the new tool for the model and disambiguates it from the existing `openScreener` "high-yield dividend" filter mapping, so "build me a high yield dividend portfolio" routes to the calculator and "find me high yield dividend stocks" keeps routing to the screener. Only verifiable end-to-end, in the chat itself — this is the final task and closes the loop opened by Tasks 1–2.

**Files:**
- Modify: `lib/ai/systemPrompt.ts`

**Interfaces:**
- Consumes: nothing new — references the `openDividendCalculator` tool name and its `picks`/`totalAmount`/`years` inputs from Task 1, and the existing `openScreener` `divYieldMin` mapping already in this file.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Add the tool's routing doc block**

In `lib/ai/systemPrompt.ts`, find:

```
openCompanyNews  
Open a company's stock page and scroll to news. Use for "NVIDIA news", "what's the latest on AAPL?", "show me Tesla headlines".

addHolding
```

Change to:

```
openCompanyNews  
Open a company's stock page and scroll to news. Use for "NVIDIA news", "what's the latest on AAPL?", "show me Tesla headlines".

openDividendCalculator
Open the Dividend Calculator pre-filled with stocks. Use when the user wants to build, create, or project a dividend portfolio — "build me a high yield dividend portfolio", "what would $50k in dividend stocks earn me", "set up a dividend portfolio with KO, JNJ, and O". If the user names specific stocks, pass them as picks; otherwise the tool defaults to a curated high-yield set on its own — don't invent tickers yourself. If the user gives a dollar amount, pass it as totalAmount (split evenly) or set amount on individual picks. This only pre-fills the page — it does not compute or state projected income itself; the user still needs to press Calculate, so don't claim specific income numbers from this tool's result.

addHolding
```

- [ ] **Step 2: Add the screener/calculator disambiguation note**

In `lib/ai/systemPrompt.ts`, find:

```
- "dividend" / "income" → divYieldMin=2.5
- "high-yield dividend" → divYieldMin=4
- "low volatility / defensive" → betaMax=0.8
- "high volatility / aggressive" → betaMin=1.5
- "beaten down" / "oversold" → week52ChangeMax=-20
- "momentum" → week52ChangeMin=20

openHoldings  
```

Change to:

```
- "dividend" / "income" → divYieldMin=2.5
- "high-yield dividend" → divYieldMin=4
- "low volatility / defensive" → betaMax=0.8
- "high volatility / aggressive" → betaMin=1.5
- "beaten down" / "oversold" → week52ChangeMax=-20
- "momentum" → week52ChangeMin=20

**Dividend routing**: the "high-yield dividend" mapping above is for *browsing/discovery* only — "find me high yield dividend stocks", "show me dividend ideas". When the user wants to *build a portfolio* or *project income* instead — "build me a high yield dividend portfolio", "what would $X in dividend stocks earn", "set up a dividend portfolio" — use openDividendCalculator instead, not openScreener.

openHoldings  
```

- [ ] **Step 3: Add the recommended-workflow bullet**

In `lib/ai/systemPrompt.ts`, find:

```
- "Find me / show me / screen for stocks" → openScreener with relevant filters applied
- Unknown ticker → searchCompanies → if not found → getLiveQuote / getCompanyFinancials
```

Change to:

```
- "Find me / show me / screen for stocks" → openScreener with relevant filters applied
- "Build/create a dividend portfolio", "project my dividend income" → openDividendCalculator with relevant picks/amount
- Unknown ticker → searchCompanies → if not found → getLiveQuote / getCompanyFinancials
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 5: Manual end-to-end verification in the browser**

1. Confirm dev server is up (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` → `200`; start `npm run dev` in background if not).
2. Navigate to `http://localhost:3000`, open the "Ask Bull" chat panel.
3. Send: `Can you build me a high yield dividend portfolio?`
4. Confirm: the browser navigates to `/tools/dividend`, "Your portfolio" is pre-filled with 5 rows (O, VZ, MO, T, PFE) at $10,000 each, and the assistant's chat reply confirms what was added without stating a specific projected income figure (since the user hasn't clicked Calculate).
5. In the same or a new chat, send: `Build me a dividend portfolio with KO and JNJ, $20k total, over 15 years`
6. Confirm: navigates to `/tools/dividend` with exactly 2 rows (KO, JNJ) at $10,000 each, and the "15 years" projection pill selected.
7. Send: `Find me high yield dividend stocks` (discovery phrasing, not "build me")
8. Confirm: this still routes to the stock screener (`/tools/screener?...divYieldMin=4...`), not the dividend calculator — this is the disambiguation check.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/systemPrompt.ts
git commit -m "docs: route dividend-portfolio requests to openDividendCalculator"
```
