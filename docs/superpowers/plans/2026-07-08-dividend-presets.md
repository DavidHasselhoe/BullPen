# Dividend Calculator Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save/apply/delete named dividend-calculator portfolio presets, and one-click load their real Holdings into the calculator.

**Architecture:** A new `useDividendPresets()` hook mirrors the existing `useChartPresets()` hook exactly (hybrid localStorage + debounced `users.settings` JSONB persistence, no new table). A new `DividendPresetMenu` component mirrors `PresetMenu.tsx`'s popover UI. Both wire into the existing `DividendClientPage.tsx`, which already owns a `Holding[]` state array — presets just save/restore that array; "Load from My Holdings" is a separate one-off action that also targets the same state array via the existing `useHoldings()` hook.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (`users.settings` JSONB column), TanStack Query (`useHoldings`).

## Global Constraints

- No test framework in this repo — every task's verification is `npm run lint` (0 errors) plus a dev-server + `curl`/manual check.
- Never create feature branches — all commits go directly to `preview`.
- When staging changes, use exact file paths (`git add <path> <path>`) — never `git add -A` or `git add .`. This repo's working tree may contain unrelated in-progress work from other sessions.
- `savePreset` always **appends** a new preset with a freshly generated id — it never overwrites an existing preset by matching name. This matches the real, verified behavior of `hooks/use-chart-presets.ts:74-76` (the design spec's doc text describes an overwrite-by-name behavior that does not actually exist in that file — the code is the source of truth here, not the spec's prose).
- Presets save the calculator's `validHoldings` (rows with both a selected stock AND a value > 0) — not the raw `holdings` state, which may include empty in-progress rows. This matches the existing localStorage auto-save at `DividendClientPage.tsx:236-243`, which already filters to `validHoldings` before persisting.
- No new Supabase table, no new migration — this rides on the existing `users.settings` JSONB column exactly like chart presets.

---

### Task 1: `useDividendPresets` hook

**Files:**
- Create: `hooks/use-dividend-presets.ts`

**Interfaces:**
- Produces: `DividendPreset { id: string; name: string; holdings: Holding[] }` (re-exported type) and `useDividendPresets(): { presets: DividendPreset[]; savePreset: (name: string, holdings: Holding[]) => void; deletePreset: (id: string) => void }`.
- Consumes: nothing new — same primitives (`useAuth`, `createBrowserClient`) already used by `use-chart-presets.ts`.

Note: `Holding` (the calculator's row type — `{ id, stock, mode, value }`) is currently defined locally inside `app/tools/dividend/DividendClientPage.tsx` (not exported). This task needs it as an importable type.

- [ ] **Step 1: Export `Holding` from DividendClientPage.tsx**

In `app/tools/dividend/DividendClientPage.tsx`, find:

```ts
/** A single editable portfolio line. */
interface Holding {
  id: string;
  stock: SearchResult | null;
  mode: 'amount' | 'shares';
  value: string;
}
```

Change to:

```ts
/** A single editable portfolio line. */
export interface Holding {
  id: string;
  stock: SearchResult | null;
  mode: 'amount' | 'shares';
  value: string;
}
```

- [ ] **Step 2: Create the hook**

Create `hooks/use-dividend-presets.ts`:

```ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Holding } from '@/app/tools/dividend/DividendClientPage';

const STORAGE_KEY = 'dividend-presets';
const SETTINGS_KEY = 'dividend_presets';

/** A user-saved dividend-calculator portfolio preset. */
export interface DividendPreset {
  id: string;
  name: string;
  holdings: Holding[];
}

function loadLocal(): DividendPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DividendPreset[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(presets: DividendPreset[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch { /* ignore */ }
}

/**
 * Named dividend-calculator portfolio presets, persisted to localStorage and
 * synced to Supabase user.settings (debounced) — same pattern as useChartPresets.
 */
export function useDividendPresets() {
  const { user } = useAuth();
  const [local, setLocal] = useState<DividendPreset[]>(loadLocal);
  const [userEdited, setUserEdited] = useState(false);

  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const presets = useMemo<DividendPreset[]>(() => {
    if (userEdited) return local;
    const remote = (user?.settings as Record<string, unknown> | undefined)?.[SETTINGS_KEY];
    return Array.isArray(remote) ? (remote as DividendPreset[]) : local;
  }, [user?.settings, local, userEdited]);

  const persist = useCallback((next: DividendPreset[]) => {
    setUserEdited(true);
    setLocal(next);
    saveLocal(next);
    const currentUser = userRef.current;
    if (!currentUser) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const supabase = createBrowserClient();
        const merged = { ...(currentUser.settings ?? {}), [SETTINGS_KEY]: next };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('users').update({ settings: merged }).eq('id', currentUser.id);
      } catch { /* non-critical */ }
    }, 1_000);
  }, []);

  const savePreset = useCallback((name: string, holdings: Holding[]) => {
    persist([...presets, { id: `dpreset-${Date.now()}`, name, holdings }]);
  }, [presets, persist]);

  const deletePreset = useCallback((id: string) => {
    persist(presets.filter((p) => p.id !== id));
  }, [presets, persist]);

  return { presets, savePreset, deletePreset };
}
```

- [ ] **Step 3: Lint check**

Run: `npx eslint hooks/use-dividend-presets.ts "app/tools/dividend/DividendClientPage.tsx"`
Expected: `0 problems`

- [ ] **Step 4: Verify the app still builds/runs**

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tools/dividend
taskkill //F //IM node.exe //T
```
Expected: `200` (confirms the exported `Holding` type change didn't break the page).

- [ ] **Step 5: Commit**

```bash
git add hooks/use-dividend-presets.ts "app/tools/dividend/DividendClientPage.tsx"
git commit -m "feat(dividend): add useDividendPresets hook, export Holding type"
git push origin preview
```

---

### Task 2: `DividendPresetMenu` component

**Files:**
- Create: `components/tools/DividendPresetMenu.tsx`

**Interfaces:**
- Consumes: `DividendPreset` type from Task 1 (`hooks/use-dividend-presets.ts`).
- Produces: `DividendPresetMenu({ presets, onApply, onSave, onDelete }: { presets: DividendPreset[]; onApply: (preset: DividendPreset) => void; onSave: (name: string) => void; onDelete: (id: string) => void })` — a React component.

- [ ] **Step 1: Create the component**

Create `components/tools/DividendPresetMenu.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DividendPreset } from '@/hooks/use-dividend-presets';

interface Props {
  presets: DividendPreset[];
  onApply: (preset: DividendPreset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}

function summarize(p: DividendPreset): string {
  const n = p.holdings.length;
  return `${n} stock${n === 1 ? '' : 's'}`;
}

export function DividendPresetMenu({ presets, onApply, onSave, onDelete }: Props) {
  const [name, setName] = useState('');

  const save = () => {
    const n = name.trim();
    if (!n) return;
    onSave(n);
    setName('');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bookmark className="h-3.5 w-3.5" />
          Presets
          {presets.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {presets.length}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="z-[110] w-72 p-0">
        {/* Save current portfolio */}
        <div className="border-b border-border/60 p-2">
          <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Save current portfolio
          </p>
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder="Preset name…"
              maxLength={40}
              aria-label="Preset name"
              className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={save}
              disabled={!name.trim()}
              className="flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] leading-relaxed text-muted-foreground/60">
            Captures the stocks and amounts currently in your portfolio below.
          </p>
        </div>

        {/* Saved presets */}
        <div className="max-h-72 overflow-y-auto p-2">
          {presets.length === 0 ? (
            <p className="px-1 py-3 text-center text-xs text-muted-foreground/60">
              No presets yet — save a portfolio above.
            </p>
          ) : (
            <div className="space-y-0.5">
              {presets.map((p) => (
                <div key={p.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60">
                  <button
                    type="button"
                    onClick={() => onApply(p)}
                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                    title={`Apply “${p.name}”`}
                  >
                    <span className="w-full truncate text-xs font-semibold text-foreground">{p.name}</span>
                    <span className="w-full truncate text-[10px] text-muted-foreground">{summarize(p)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(p.id)}
                    aria-label={`Delete ${p.name}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `npx eslint components/tools/DividendPresetMenu.tsx`
Expected: `0 problems`

- [ ] **Step 3: Commit**

```bash
git add components/tools/DividendPresetMenu.tsx
git commit -m "feat(dividend): add DividendPresetMenu component"
git push origin preview
```

---

### Task 3: Wire preset save/apply/delete into DividendClientPage.tsx

**Files:**
- Modify: `app/tools/dividend/DividendClientPage.tsx`

**Interfaces:**
- Consumes: `useDividendPresets()` from Task 1, `DividendPresetMenu` from Task 2.

- [ ] **Step 1: Add imports**

In `app/tools/dividend/DividendClientPage.tsx`, find:

```ts
import { DIVIDEND_QUICK_PICKS } from '@/lib/finance/dividend-quick-picks';
```

Change to:

```ts
import { DIVIDEND_QUICK_PICKS } from '@/lib/finance/dividend-quick-picks';
import { useDividendPresets, type DividendPreset } from '@/hooks/use-dividend-presets';
import { DividendPresetMenu } from '@/components/tools/DividendPresetMenu';
```

- [ ] **Step 2: Add the hook call and an `applyPreset` handler**

Find:

```ts
  const pickedTickers = useMemo(
    () => new Set(holdings.map((h) => h.stock?.ticker.toUpperCase()).filter(Boolean) as string[]),
    [holdings]
  );
```

Change to:

```ts
  const pickedTickers = useMemo(
    () => new Set(holdings.map((h) => h.stock?.ticker.toUpperCase()).filter(Boolean) as string[]),
    [holdings]
  );

  const { presets, savePreset, deletePreset } = useDividendPresets();

  const applyPreset = (preset: DividendPreset) => {
    setHoldings(preset.holdings.length ? preset.holdings : [EMPTY_ROW]);
  };
```

- [ ] **Step 3: Add the preset menu UI next to "Your portfolio"**

Find:

```tsx
          {/* Portfolio rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your portfolio
              </p>
              <span className="text-xs text-muted-foreground">{pickedTickers.size}/{MAX_HOLDINGS} stocks</span>
            </div>
```

Change to:

```tsx
          {/* Portfolio rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your portfolio
              </p>
              <div className="flex items-center gap-2">
                <DividendPresetMenu
                  presets={presets}
                  onApply={applyPreset}
                  onSave={(name) => savePreset(name, validHoldings)}
                  onDelete={deletePreset}
                />
                <span className="text-xs text-muted-foreground">{pickedTickers.size}/{MAX_HOLDINGS} stocks</span>
              </div>
            </div>
```

Note: `validHoldings` is defined later in the component (`const validHoldings = holdings.filter(...)` at line ~216), but since this is a closure captured at render time inside the JSX (not at the top of the function body), referencing it in the `onSave` callback here is fine — by the time this JSX is returned, `validHoldings` has already been computed earlier in the same render. No reordering needed.

- [ ] **Step 4: Lint check**

Run: `npx eslint "app/tools/dividend/DividendClientPage.tsx"`
Expected: `0 problems`

- [ ] **Step 5: Manual verification in the dev server**

```bash
npm run dev &
sleep 6
curl -s http://localhost:3000/tools/dividend | grep -o "Presets"
taskkill //F //IM node.exe //T
```
Expected: a match (confirms the Presets button renders in the server-rendered HTML shell).

This confirms the button renders; save/apply/delete require a logged-in browser session to fully exercise (the hook reads `useAuth()`'s `user`), so do a manual click-through pass in the browser once this is deployed: add a couple of stocks, save as a preset, refresh the page, confirm the preset is still listed and applying it restores the rows.

- [ ] **Step 6: Commit**

```bash
git add "app/tools/dividend/DividendClientPage.tsx"
git commit -m "feat(dividend): wire preset save/apply/delete UI into the calculator"
git push origin preview
```

---

### Task 4: "Load from My Holdings" quick-fill action

**Files:**
- Modify: `app/tools/dividend/DividendClientPage.tsx`

**Interfaces:**
- Consumes: `useHoldings()` from `@/hooks/use-holdings` (existing hook, returns `UserHolding[]` — `{ symbol, company_name, quantity, ... }`).

- [ ] **Step 1: Add imports**

Find:

```ts
import { useAuth } from '@/hooks/use-auth';
import { useUserSettings } from '@/hooks/use-user-settings';
```

Change to:

```ts
import { useAuth } from '@/hooks/use-auth';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useHoldings } from '@/hooks/use-holdings';
```

Also add the `Briefcase` icon (matching the icon already used for portfolio-related actions on the Holdings page) to the existing lucide-react import. Find:

```ts
import { ArrowLeft, Wallet, Loader2, AlertCircle, TrendingUp, Plus, X } from 'lucide-react';
```

Change to:

```ts
import { ArrowLeft, Wallet, Loader2, AlertCircle, TrendingUp, Plus, X, Briefcase } from 'lucide-react';
```

- [ ] **Step 2: Add the fetch + grouping + load handler**

Find (the hook call added in Task 3, Step 2):

```ts
  const { presets, savePreset, deletePreset } = useDividendPresets();

  const applyPreset = (preset: DividendPreset) => {
    setHoldings(preset.holdings.length ? preset.holdings : [EMPTY_ROW]);
  };
```

Change to:

```ts
  const { presets, savePreset, deletePreset } = useDividendPresets();

  const applyPreset = (preset: DividendPreset) => {
    setHoldings(preset.holdings.length ? preset.holdings : [EMPTY_ROW]);
  };

  const { data: myHoldings } = useHoldings();

  const loadFromHoldings = () => {
    const rows = myHoldings ?? [];
    if (rows.length === 0) return;

    // Group by symbol — the same ticker may appear across multiple connected
    // brokerage accounts as separate rows; sum quantities into one line.
    const bySymbol = new Map<string, { name: string; quantity: number }>();
    for (const h of rows) {
      const existing = bySymbol.get(h.symbol);
      const qty = h.quantity ?? 0;
      if (existing) {
        existing.quantity += qty;
      } else {
        bySymbol.set(h.symbol, { name: h.company_name, quantity: qty });
      }
    }

    const next: Holding[] = Array.from(bySymbol.entries())
      .filter(([, v]) => v.quantity > 0)
      .slice(0, MAX_HOLDINGS)
      .map(([symbol, v], i) => ({
        id: `holdings-${i}`,
        stock: minimalStock(symbol, v.name),
        mode: 'shares',
        value: String(v.quantity),
      }));

    setHoldings(next.length ? next : [EMPTY_ROW]);
  };
```

- [ ] **Step 3: Add the button next to the preset menu**

Find (the block added in Task 3, Step 3):

```tsx
              <div className="flex items-center gap-2">
                <DividendPresetMenu
                  presets={presets}
                  onApply={applyPreset}
                  onSave={(name) => savePreset(name, validHoldings)}
                  onDelete={deletePreset}
                />
                <span className="text-xs text-muted-foreground">{pickedTickers.size}/{MAX_HOLDINGS} stocks</span>
              </div>
```

Change to:

```tsx
              <div className="flex items-center gap-2">
                {myHoldings && myHoldings.length > 0 && (
                  <button
                    type="button"
                    onClick={loadFromHoldings}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Replace the portfolio below with your real holdings"
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                    Load from My Holdings
                  </button>
                )}
                <DividendPresetMenu
                  presets={presets}
                  onApply={applyPreset}
                  onSave={(name) => savePreset(name, validHoldings)}
                  onDelete={deletePreset}
                />
                <span className="text-xs text-muted-foreground">{pickedTickers.size}/{MAX_HOLDINGS} stocks</span>
              </div>
```

- [ ] **Step 4: Lint check**

Run: `npx eslint "app/tools/dividend/DividendClientPage.tsx"`
Expected: `0 problems`

- [ ] **Step 5: Manual verification in the dev server**

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tools/dividend
taskkill //F //IM node.exe //T
```
Expected: `200`, no server-side crash from the new hook/handler (the button itself only renders once `useHoldings()` has data, which requires an authenticated browser session — do a manual click-through pass once deployed: as a user with at least one real holding, click "Load from My Holdings," confirm the calculator rows are replaced with your actual symbols and share counts, then confirm "Calculate" still works on the loaded rows).

- [ ] **Step 6: Commit**

```bash
git add "app/tools/dividend/DividendClientPage.tsx"
git commit -m "feat(dividend): add Load from My Holdings quick-fill action"
git push origin preview
```

---

## Final verification (run after all four tasks are complete)

```bash
npm run lint
```
Expected: 0 errors (warnings acceptable, per this repo's existing baseline).

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tools/dividend
curl -s http://localhost:3000/tools/dividend | grep -o "Presets"
curl -s http://localhost:3000/tools/dividend | grep -o "Load from My Holdings"
taskkill //F //IM node.exe //T
```
Expected: `200`, both greps print a match.

Then a manual browser pass (cannot be scripted — requires an authenticated session with real holdings): save a preset, refresh, apply it, delete it, and try "Load from My Holdings" against a real account.
