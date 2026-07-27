# Why Today? → Ask Bull Sidepanel Relocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "Why Today?" AI explanation from an inline collapsible panel on the stock page / Discover widget into the Ask Bull sidepanel, fixing the bug where live price ticks restart the in-flight Claude+search request.

**Architecture:** `AIPanelProvider` gains `whyToday` state and `openWhyToday()`/`closeWhyToday()` methods, parallel to its existing chat state. `AISidePanel`'s body/header branch on `whyToday`: when set, render a new `WhyTodayView` (a port of the existing `WhyTodayPanel` logic, minus its collapse plumbing) instead of `BullpenChat` (which stays mounted-but-hidden so its conversation state survives the round trip). Both "Why?" buttons call `openWhyToday({ ticker, price, change, changePct })` with a one-time snapshot instead of toggling local state tied to live-updating props — this is what fixes the regenerate-on-tick bug structurally.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict mode, Tailwind CSS 4, lucide-react icons.

## Global Constraints

- Backend (`/api/ai/why-today` route, model, prompt, streaming protocol, `why_today` quota) is unchanged — this is a UI relocation only.
- No test framework in this repo (per `CLAUDE.md`) — verification is `npm run lint` per task plus a final manual browser check via the `run` skill.
- Follow `.agents/skills/ui-ux-pro-max/SKILL.md` guidance for the new full-panel layout (Task 2), and run `/impeccable polish` on the finished sidepanel view before considering this done (final task).
- Path alias `@/*` maps to the repo root — use it for cross-directory imports as the existing files do.

---

### Task 1: Add `whyToday` state to `AIPanelProvider`

**Files:**
- Modify: `components/ai/AIPanelProvider.tsx` (full file — small, shown in full below)

**Interfaces:**
- Produces: `WhyTodayPayload` type (`{ ticker: string; price: number; change: number; changePct: number; requestedAt: number }`, exported), `useAIPanel().whyToday: WhyTodayPayload | null`, `useAIPanel().openWhyToday(payload: { ticker: string; price: number; change: number; changePct: number }): void`, `useAIPanel().closeWhyToday(): void`. Later tasks (2, 3, 4, 5) consume all of these by name.
- Consumes: nothing new — this task only touches existing `AIPanelProvider`/`AISidePanel` wiring.

- [ ] **Step 1: Replace the full contents of `components/ai/AIPanelProvider.tsx`**

```tsx
'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { AISidePanel } from './AISidePanel';

export interface AIContext {
  tickers: string[];
  label?: string;
}

export interface WhyTodayPayload {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  /** Set by openWhyToday() at click time — used to key/remount the view on repeat clicks. */
  requestedAt: number;
}

interface OpenOptions {
  query?: string;
  context?: AIContext;
}

interface AIPanelContextValue {
  isOpen: boolean;
  open: (opt?: OpenOptions) => void;
  close: () => void;
  toggle: () => void;
  /** Initial query to send when opening (e.g. from command palette) */
  initialQuery: string | null;
  /** Page context for context-aware prompts (e.g. NVDA vs AMD) */
  aiContext: AIContext | null;
  /** Clear initial query after it has been consumed */
  clearInitialQuery: () => void;
  /** Set AI context from page (e.g. stock page, compare page) */
  setAIContext: (ctx: AIContext | null) => void;
  /**
   * Last ticker either AI surface (main chat or the in-chart assistant) discussed —
   * lets the other surface pick up the same company as a fallback when the page
   * itself doesn't supply an explicit context (e.g. Discover, Holdings, Screener).
   */
  lastTicker: string | null;
  /** Record that a ticker was just discussed, for the other AI surface to fall back to. */
  noteTicker: (ticker: string) => void;
  /** Currently displayed Why Today explanation, or null when the panel shows chat. */
  whyToday: WhyTodayPayload | null;
  /** Open the panel straight into a Why Today explanation for a snapshot quote. */
  openWhyToday: (payload: Omit<WhyTodayPayload, 'requestedAt'>) => void;
  /** Return the panel to the normal chat view (panel stays open). */
  closeWhyToday: () => void;
}

const AIPanelContext = createContext<AIPanelContextValue | null>(null);

export function useAIPanel() {
  const ctx = useContext(AIPanelContext);
  if (!ctx)
    return {
      isOpen: false,
      open: () => {},
      close: () => {},
      toggle: () => {},
      initialQuery: null,
      aiContext: null,
      clearInitialQuery: () => {},
      setAIContext: () => {},
      lastTicker: null,
      noteTicker: () => {},
      whyToday: null,
      openWhyToday: () => {},
      closeWhyToday: () => {},
    };
  return ctx;
}

export function AIPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | null>(null);
  const [aiContext, setAIContextState] = useState<AIContext | null>(null);
  const [lastTicker, setLastTicker] = useState<string | null>(null);
  const [whyToday, setWhyToday] = useState<WhyTodayPayload | null>(null);

  const open = useCallback((opt?: OpenOptions) => {
    if (opt?.query) setInitialQuery(opt.query);
    if (opt?.context) setAIContextState(opt.context);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Closing the whole panel always drops back to chat — reopening later
    // (e.g. via a Sparkles "Ask AI" button elsewhere) shouldn't land the
    // user back in a stale Why Today view.
    setWhyToday(null);
  }, []);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const clearInitialQuery = useCallback(() => setInitialQuery(null), []);

  const setAIContext = useCallback((ctx: AIContext | null) => {
    setAIContextState(ctx);
  }, []);

  const noteTicker = useCallback((ticker: string) => {
    setLastTicker(ticker.toUpperCase());
  }, []);

  const openWhyToday = useCallback((payload: Omit<WhyTodayPayload, 'requestedAt'>) => {
    setWhyToday({ ...payload, requestedAt: Date.now() });
    setIsOpen(true);
  }, []);

  const closeWhyToday = useCallback(() => setWhyToday(null), []);

  return (
    <AIPanelContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        initialQuery,
        aiContext,
        clearInitialQuery,
        setAIContext,
        lastTicker,
        noteTicker,
        whyToday,
        openWhyToday,
        closeWhyToday,
      }}
    >
      <div className="flex h-screen min-h-full w-full overflow-x-hidden">
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-auto overflow-x-hidden scrollbar-hide">
          {children}
        </div>
        <AISidePanel
          open={isOpen}
          onClose={close}
          initialQuery={initialQuery}
          aiContext={aiContext}
          onConsumedQuery={clearInitialQuery}
          whyToday={whyToday}
          onCloseWhyToday={closeWhyToday}
        />
      </div>
    </AIPanelContext.Provider>
  );
}
```

- [ ] **Step 2: Lint**

`npm run lint` runs ESLint only (not a full `tsc` type-check — this repo has no typecheck script, and `next build` intentionally suppresses TS errors per `CLAUDE.md`), so it won't catch the prop-type mismatch between this file and `AISidePanel` (which doesn't accept `whyToday`/`onCloseWhyToday` until Task 3). That mismatch is expected and harmless until Task 3 lands — don't stop to fix it here.

Run: `npm run lint`
Expected: 0 ESLint errors in `components/ai/AIPanelProvider.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/ai/AIPanelProvider.tsx
git commit -m "feat(ai): add whyToday state to AIPanelProvider"
```

---

### Task 2: Create `WhyTodayView`

**Files:**
- Create: `components/ai/WhyTodayView.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (self-contained component; talks directly to `/api/ai/why-today`).
- Produces: `WhyTodayView({ ticker, price, change, changePct }: { ticker: string; price: number; change: number; changePct: number })` — a default-exportless named export consumed by Task 3.

This ports `components/stock/WhyTodayPanel.tsx`'s fetch/streaming logic with three changes: (1) no `open`/`onClose` props — the component's mount lifecycle is its open state, so the fetch effect runs once on mount instead of being gated on `open`; (2) the upgrade-required check is fixed from `res.status === 403` to `res.status === 402` — the route (`app/api/ai/why-today/route.ts`) has always returned 402 on `!quota.allowed`, so the old 403 check never matched and free users saw a generic error instead of the Pro upgrade CTA; (3) layout fills the sidepanel body instead of rendering as a compact inline card.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Status = 'searching' | 'streaming' | 'done' | 'error' | 'upgrade';
type ErrorCode = 'payment_required' | 'invalid_key' | 'rate_limited' | 'unknown';

interface Props {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
}

/**
 * Fills the Ask Bull sidepanel body with a streaming Claude + web-search
 * explanation for why `ticker` moved today. Mounted by AISidePanel when
 * `whyToday` is set (see AIPanelProvider.openWhyToday) — one fetch per
 * mount, keyed by the caller so a repeat "Why?" click remounts and restarts.
 */
export function WhyTodayView({ ticker, price, change, changePct }: Props) {
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<Status>('searching');
  const [text, setText] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode>('unknown');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch('/api/ai/why-today', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, price, change, changePct, language: i18n.language }),
          signal: ctrl.signal,
        });

        if (res.status === 402) {
          setStatus('upgrade');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) { setStatus('error'); return; }
        const dec = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = dec.decode(value);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'searching') setStatus('searching');
              if (event.type === 'text') {
                setStatus('streaming');
                setText((t) => t + event.delta);
              }
              if (event.type === 'done') setStatus('done');
              if (event.type === 'error') {
                setErrorCode((event.code as ErrorCode) ?? 'unknown');
                setStatus('error');
              }
            } catch {
              // malformed line, skip
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus('error');
      }
    })();

    return () => ctrl.abort();
    // Intentionally empty deps: ticker/price/change/changePct are a one-time
    // snapshot captured by openWhyToday() at click time, not live-ticking
    // values — this is what fixes the "regenerates on price tick" bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 scrollbar-hide">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-semibold text-foreground">${ticker}</span>
        <span className={cn(
          'text-sm font-medium tabular-nums',
          changePct >= 0 ? 'text-emerald-400' : 'text-red-400'
        )}>
          {changePct >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%) today
        </span>
      </div>

      {status === 'searching' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          Searching the web for today&apos;s news on ${ticker}…
        </div>
      )}

      {(status === 'streaming' || status === 'done') && text && (
        <div className="text-sm text-foreground space-y-2 leading-relaxed">
          {text.split('\n').filter(Boolean).map((line, i) => (
            <p key={i} className={cn(
              line.startsWith('•') ? 'pl-0' : 'text-muted-foreground text-xs'
            )}>
              {line}
            </p>
          ))}
          {status === 'streaming' && (
            <span className="inline-block h-3.5 w-0.5 bg-foreground/60 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}

      {status === 'error' && (
        <p className="text-sm text-muted-foreground">
          {errorCode === 'rate_limited'
            ? 'Too many requests. Please wait a moment and try again.'
            : "Couldn't load an explanation right now. Please try again shortly."}
        </p>
      )}

      {status === 'upgrade' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Real-time AI news analysis is a <span className="text-foreground font-medium">Pro</span> feature.
          </p>
          <Link
            href="/upgrade"
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Upgrade to Pro →
          </Link>
        </div>
      )}

      {(status === 'streaming' || status === 'done') && (
        <p className="mt-4 text-[10px] text-muted-foreground/30 select-none">
          Powered by Claude + live web search
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint the new file**

Run: `npx eslint components/ai/WhyTodayView.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ai/WhyTodayView.tsx
git commit -m "feat(ai): add WhyTodayView for the sidepanel"
```

---

### Task 3: Wire `WhyTodayView` into `AISidePanel`

**Files:**
- Modify: `components/ai/AISidePanel.tsx`

**Interfaces:**
- Consumes: `WhyTodayPayload` (Task 1, from `./AIPanelProvider`), `WhyTodayView` (Task 2, from `./WhyTodayView`).
- Produces: `AISidePanelProps` now accepts `whyToday?: WhyTodayPayload | null` and `onCloseWhyToday?: () => void` — consumed by `AIPanelProvider` (already wired in Task 1).

- [ ] **Step 1: Add imports**

In `components/ai/AISidePanel.tsx`, add `ArrowLeft` to the existing `lucide-react` import and add two new imports:

```tsx
import { X, PanelRightClose, Settings, History, SquarePen, ArrowLeft } from 'lucide-react';
```

```tsx
import { WhyTodayView } from './WhyTodayView';
```

Then find the existing type-only import from the same module:

```tsx
import type { AIContext } from './AIPanelProvider';
```

and extend it to also bring in `WhyTodayPayload`:

```tsx
import type { AIContext, WhyTodayPayload } from './AIPanelProvider';
```

- [ ] **Step 2: Extend `AISidePanelProps` and the component signature**

Change:

```tsx
interface AISidePanelProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string | null;
  aiContext?: AIContext | null;
  onConsumedQuery?: () => void;
}
```

to:

```tsx
interface AISidePanelProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string | null;
  aiContext?: AIContext | null;
  onConsumedQuery?: () => void;
  whyToday?: WhyTodayPayload | null;
  onCloseWhyToday?: () => void;
}
```

Change the function signature line:

```tsx
export function AISidePanel({ open, onClose, initialQuery, aiContext, onConsumedQuery }: AISidePanelProps) {
```

to:

```tsx
export function AISidePanel({ open, onClose, initialQuery, aiContext, onConsumedQuery, whyToday, onCloseWhyToday }: AISidePanelProps) {
```

- [ ] **Step 3: Don't auto-focus the (hidden) chat input when opening into Why Today mode**

Find this effect:

```tsx
  // Focus input after spring settles (~380ms for stiffness:280 damping:28)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => chatRef.current?.focusInput?.(), 380);
    return () => clearTimeout(t);
  }, [open]);
```

Replace with:

```tsx
  // Focus input after spring settles (~380ms for stiffness:280 damping:28).
  // Skip when opening into Why Today mode — the chat input is hidden then,
  // and focusing an invisible field is an accessibility trap.
  useEffect(() => {
    if (!open || whyToday) return;
    const t = setTimeout(() => chatRef.current?.focusInput?.(), 380);
    return () => clearTimeout(t);
  }, [open, whyToday]);
```

- [ ] **Step 4: Branch the header**

Find the header block:

```tsx
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none truncate">Ask Bull</p>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && user && (
              <>
```

Replace the two opening lines of the title block and the start of the actions cluster so the whole header reads:

```tsx
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center flex-1 min-w-0 gap-1">
            {whyToday ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onCloseWhyToday}
                      aria-label="Back to chat"
                      className="rounded-md p-1.5 -ml-1.5 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Back to chat</TooltipContent>
                </Tooltip>
                <p className="text-sm font-semibold leading-none truncate">Why ${whyToday.ticker} moved</p>
              </>
            ) : (
              <p className="text-sm font-semibold leading-none truncate">Ask Bull</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!whyToday && isAuthenticated && user && (
              <>
```

Everything from the original `{isAuthenticated && user && (<>` block onward (new-chat button, history button, settings button, avatar, closing `</>`) stays exactly as it is — only the opening condition gains the `!whyToday &&` guard, since those controls (new chat / history / settings) are chat-only and meaningless in Why Today mode.

- [ ] **Step 5: Branch the body**

Find:

```tsx
        {/* Body */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden scrollbar-hide">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            <AuthGate />
          ) : !hasAcceptedAiTerms ? (
            <AiTermsGate />
          ) : hasOpened ? (
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center">
                  <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              }
            >
              <BullpenChat
                key={conversationId}
                ref={chatRef}
                compact
                user={user}
                starterPrompts={STARTER_PROMPTS}
                open={open}
                initialQuery={initialQuery ?? undefined}
                aiContext={aiContext ?? undefined}
                onConsumedQuery={onConsumedQuery}
                conversationId={conversationId}
                initialMessages={initialMessages}
              />
            </Suspense>
          ) : null}
        </div>
```

Replace with:

```tsx
        {/* Body */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden scrollbar-hide">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            <AuthGate />
          ) : !hasAcceptedAiTerms ? (
            <AiTermsGate />
          ) : (
            <>
              {whyToday && (
                <WhyTodayView
                  key={whyToday.requestedAt}
                  ticker={whyToday.ticker}
                  price={whyToday.price}
                  change={whyToday.change}
                  changePct={whyToday.changePct}
                />
              )}
              {hasOpened && (
                <div className={cn('flex flex-1 min-h-0 flex-col', whyToday && 'hidden')}>
                  <Suspense
                    fallback={
                      <div className="flex flex-1 items-center justify-center">
                        <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                    }
                  >
                    <BullpenChat
                      key={conversationId}
                      ref={chatRef}
                      compact
                      user={user}
                      starterPrompts={STARTER_PROMPTS}
                      open={open}
                      initialQuery={initialQuery ?? undefined}
                      aiContext={aiContext ?? undefined}
                      onConsumedQuery={onConsumedQuery}
                      conversationId={conversationId}
                      initialMessages={initialMessages}
                    />
                  </Suspense>
                </div>
              )}
            </>
          )}
        </div>
```

`BullpenChat` now stays mounted (hidden via the `hidden` utility class, not unmounted) when the user switches into Why Today mode, so its conversation/scroll state survives the round trip back — matching the design's stated tradeoff.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: 0 errors (Task 1's temporary excess-prop errors on `<AISidePanel>` are now resolved).

- [ ] **Step 7: Commit**

```bash
git add components/ai/AISidePanel.tsx
git commit -m "feat(ai): render WhyTodayView in the Ask Bull sidepanel"
```

---

### Task 4: Wire `StockPricePanel`'s two "Why?" buttons to `openWhyToday`

**Files:**
- Modify: `components/stock/StockPricePanel.tsx`

**Interfaces:**
- Consumes: `useAIPanel().openWhyToday` (Task 1, from `@/components/ai/AIPanelProvider`).

- [ ] **Step 1: Swap the import**

Replace:

```tsx
import { WhyTodayPanel } from './WhyTodayPanel';
```

with:

```tsx
import { useAIPanel } from '@/components/ai/AIPanelProvider';
```

(Keep its position in the import list — right after the `ChartSettingsPanel` import, same as `WhyTodayPanel` was.)

- [ ] **Step 2: Remove the local toggle state and add `openWhyToday`**

Replace:

```tsx
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [whyTodayOpen, setWhyTodayOpen] = useState(false);
  const { isSimplified } = useExperienceLevel();
```

with:

```tsx
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { isSimplified } = useExperienceLevel();
  const { openWhyToday } = useAIPanel();
```

- [ ] **Step 3: Rewire the "At Close" (dual-mode) Why? button**

Replace:

```tsx
                    <button
                      type="button"
                      onClick={() => setWhyTodayOpen((v) => !v)}
                      aria-expanded={whyTodayOpen}
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                        whyTodayOpen
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      )}
                    >
                      <Sparkles className="h-3 w-3" />
                      Why?
                    </button>
```

with:

```tsx
                    <button
                      type="button"
                      onClick={() => openWhyToday({ ticker, price, change, changePct })}
                      className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30"
                    >
                      <Sparkles className="h-3 w-3" />
                      Why?
                    </button>
```

(This button passes the single-mode `price`/`change`/`changePct` — matching what the inline `<WhyTodayPanel>` it's replacing already did, not the dual-mode "at close" values sitting next to it. That's existing behavior, unchanged.)

- [ ] **Step 4: Rewire the single-mode Why? button**

Replace:

```tsx
                  {range === '1D' && (
                    <button
                      type="button"
                      onClick={() => setWhyTodayOpen((v) => !v)}
                      aria-expanded={whyTodayOpen}
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
                        whyTodayOpen
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      )}
                    >
                      <Sparkles className="h-3 w-3" />
                      Why?
                    </button>
                  )}
```

with:

```tsx
                  {range === '1D' && (
                    <button
                      type="button"
                      onClick={() => openWhyToday({ ticker, price, change, changePct })}
                      className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30"
                    >
                      <Sparkles className="h-3 w-3" />
                      Why?
                    </button>
                  )}
```

- [ ] **Step 5: Remove the inline panel render**

Delete:

```tsx
      <WhyTodayPanel
        ticker={ticker}
        price={price}
        change={change}
        changePct={changePct}
        open={whyTodayOpen}
        onClose={() => setWhyTodayOpen(false)}
      />

```

(the blank line immediately after it, before the `{/* ── Price chart (Bklit UI) ── */}` comment, goes too — leave a single blank line separating the closing `</div>` of the price header from the chart section comment, matching the file's existing spacing elsewhere.)

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: 0 errors, 0 unused-import warnings for this file.

- [ ] **Step 7: Commit**

```bash
git add components/stock/StockPricePanel.tsx
git commit -m "refactor(stock): open Why Today in the Ask Bull sidepanel"
```

---

### Task 5: Wire `WhyTodayWidget`'s "Why?" button to `openWhyToday`

**Files:**
- Modify: `components/discover/WhyTodayWidget.tsx`

**Interfaces:**
- Consumes: `useAIPanel().openWhyToday` (Task 1, from `@/components/ai/AIPanelProvider`).

- [ ] **Step 1: Swap imports**

Replace:

```tsx
import { useMemo, useState } from 'react';
```

with:

```tsx
import { useMemo } from 'react';
```

(`useState` becomes unused once `whyOpen` is removed in Step 2 — the widget still uses `useMemo` for `symbols`/`featured`.)

Replace:

```tsx
import { WhyTodayPanel } from '@/components/stock/WhyTodayPanel';
```

with:

```tsx
import { useAIPanel } from '@/components/ai/AIPanelProvider';
```

- [ ] **Step 2: Remove local toggle state, add `openWhyToday`**

Replace:

```tsx
  const { isAuthenticated } = useAuth();
  const { data: holdings } = useHoldings();
  const { data: watchlist } = useWatchlist();
  const [whyOpen, setWhyOpen] = useState(false);
```

with:

```tsx
  const { isAuthenticated } = useAuth();
  const { data: holdings } = useHoldings();
  const { data: watchlist } = useWatchlist();
  const { openWhyToday } = useAIPanel();
```

- [ ] **Step 3: Rewire the button and remove the inline panel**

Replace:

```tsx
            <button
              onClick={() => setWhyOpen((v) => !v)}
              aria-expanded={whyOpen}
              className={cn(
                'shrink-0 text-xs font-medium rounded-md px-2.5 py-1.5 border transition-colors',
                whyOpen
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              Why?
            </button>
          </div>
          <WhyTodayPanel
            ticker={featured.symbol}
            price={featured.price}
            change={featured.change}
            changePct={featured.changePercent}
            open={whyOpen}
            onClose={() => setWhyOpen(false)}
          />
        </div>
```

with:

```tsx
            <button
              onClick={() => openWhyToday({
                ticker: featured.symbol,
                price: featured.price,
                change: featured.change,
                changePct: featured.changePercent,
              })}
              className="shrink-0 text-xs font-medium rounded-md px-2.5 py-1.5 border border-border/40 text-muted-foreground transition-colors hover:text-foreground hover:border-border"
            >
              Why?
            </button>
          </div>
        </div>
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors, 0 unused-import warnings for this file.

- [ ] **Step 5: Commit**

```bash
git add components/discover/WhyTodayWidget.tsx
git commit -m "refactor(discover): open Why Today in the Ask Bull sidepanel"
```

---

### Task 6: Delete the old inline `WhyTodayPanel`

**Files:**
- Delete: `components/stock/WhyTodayPanel.tsx`

**Interfaces:**
- Consumes: nothing (both former consumers were rewired in Tasks 4–5).

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "WhyTodayPanel" --include="*.tsx" --include="*.ts" components app`
Expected: no output (the only two prior references, in `StockPricePanel.tsx` and `WhyTodayWidget.tsx`, were removed in Tasks 4–5).

- [ ] **Step 2: Delete the file**

```bash
git rm components/stock/WhyTodayPanel.tsx
```

- [ ] **Step 3: Full lint pass**

Run: `npm run lint`
Expected: 0 errors (warnings acceptable, per `CLAUDE.md`).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(stock): remove old inline WhyTodayPanel, superseded by WhyTodayView"
```

---

### Task 7: Manual browser verification and polish pass

**Files:** none (verification only, plus whatever the polish pass in Step 4 touches — expected to stay within `components/ai/WhyTodayView.tsx` and `components/ai/AISidePanel.tsx`).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background)

- [ ] **Step 2: Verify the stock page trigger and the bug fix**

Using the `run` skill (or Playwright directly): navigate to a stock page (e.g. `/stock/AAPL`) during a period where `useLivePrices` is ticking (or simulate by waiting through a few SSE updates), click "Why?". Confirm:
- The Ask Bull sidepanel opens directly into the "Why $AAPL moved" view (not the chat welcome screen).
- The explanation streams in (searching → bullets) without restarting mid-stream as price ticks arrive — this is the bug fix; watch the network tab or the visible bullet text for an unexpected reset back to "Searching…".
- The "Back to chat" arrow returns to the normal Ask Bull chat (starter prompts or an existing conversation, not a blank/errored state).
- The panel's `X` close button closes the whole panel; reopening Ask Bull afterward (e.g. via the floating toggle) shows normal chat, not a stale Why Today view.

- [ ] **Step 3: Verify the Discover widget trigger, Pro-gate, and mobile**

On `/discover` (as a user with holdings/watchlist so the widget renders), click "Why?" on the featured mover — confirm the same sidepanel behavior. As a free-tier user, confirm the Pro upgrade CTA renders (this also exercises the 403→402 fix from Task 2) instead of a generic error. Resize to a mobile viewport and confirm the sidepanel still goes full-screen and the back/close controls remain reachable.

- [ ] **Step 4: Run the polish pass**

Invoke `/impeccable polish components/ai/WhyTodayView.tsx components/ai/AISidePanel.tsx` per `CLAUDE.md`'s pre-ship polish requirement for UI/UX-heavy work, and apply its findings.

- [ ] **Step 5: Final lint and commit any polish changes**

Run: `npm run lint`
Expected: 0 errors.

```bash
git add -A
git commit -m "polish(ai): refine Why Today sidepanel view"
```

(Skip this commit if the polish pass produced no changes.)
