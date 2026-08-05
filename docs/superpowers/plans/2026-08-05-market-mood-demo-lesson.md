# Market Mood Demo Lesson Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lesson 7 to the `macro-mechanics` Academy course — a `demo` lesson that opens BullPen's real Market Mood tool fullscreen with a guided tour, tying its live credit-spread and flight-to-safety signals back to what the course's reads already taught.

**Architecture:** Extract Market Mood's presentational pieces (`MoodHero`, `SignalCard`, `MoodSkeleton`, plus their `moodColor`/`useEased` helpers) out of `MarketMoodClientPage.tsx` into a shared, importable component file with `data-tour` anchors added. A new `MarketMoodDemo.tsx` (following `PortfolioDemo.tsx`'s view-only precedent — no required action) mounts those same pieces against live `/api/market/mood` data inside the existing `DemoSurfaceShell`. Wire it into `DemoContentSchema` and `DemoLesson.tsx`'s switch, then hand-author the lesson content as SQL (matching precedent — the generator script excludes `demo` lessons by design).

**Tech Stack:** Next.js client components, TanStack Query, Zod (`types/academy.ts`), the existing `DemoSurfaceShell`/`DemoTour` demo-mode mechanism.

## Global Constraints

- This is the deferred follow-up flagged in `docs/superpowers/plans/2026-08-05-academy-macro-courses` (the earlier plan-mode session for the macro course pair) — the course and its other 6 lessons are already live.
- Market Mood is public, live data with zero user entanglement — no fixture needed (unlike `demo-portfolio`/`dividend-calculator`), no gating action needed (matches `PortfolioDemo`, not `ScreenerDemo`/`DividendDemo`).
- Each signal card needs a **distinct** `data-tour` value keyed by signal name, not array index — `DemoTour.tsx` resolves via `document.querySelector`, which only ever matches the first DOM hit, and a data-source drop-out could shrink/reorder the signals array.
- `/tools/market-mood` (the real page) must render **identically** after the extraction — this is a hard regression constraint, not a nice-to-have.
- No test framework in this repo — verification is `npm run lint`, `npx tsc --noEmit`, and manual/Playwright browser checks.

---

### Task 1: Add the `market-mood` surface to the schema

**Files:**
- Modify: `types/academy.ts`

**Interfaces:**
- Produces: a 6th literal branch in `DemoContentSchema`'s discriminated union, consumed by Task 3 (`MarketMoodDemo.tsx`'s props type) and Task 4 (`DemoLesson.tsx`'s switch).

- [ ] **Step 1: Add the schema branch**

Find:

```ts
  // AI research: shows a real Why-Today-style sourced answer, but seeded from a
  // fixture (see lib/academy/ai-research-fixtures.ts) so the lesson is instant,
  // deterministic, and never burns Anthropic credits or AI quota.
  z.object({
    surface: z.literal('ai-research'),
    fixtureId: z.string().default('nvda-why-today'),
    steps: z.array(DemoTourStepSchema).min(1),
  }),
]);
```

Replace with:

```ts
  // AI research: shows a real Why-Today-style sourced answer, but seeded from a
  // fixture (see lib/academy/ai-research-fixtures.ts) so the lesson is instant,
  // deterministic, and never burns Anthropic credits or AI quota.
  z.object({
    surface: z.literal('ai-research'),
    fixtureId: z.string().default('nvda-why-today'),
    steps: z.array(DemoTourStepSchema).min(1),
  }),
  // Market Mood: mounts the REAL Market Mood tool. Public live data with no
  // user entanglement (unlike demo-portfolio/dividend-calculator), so no
  // fixture payload is needed. View-only, no gating action.
  z.object({
    surface: z.literal('market-mood'),
    steps: z.array(DemoTourStepSchema).min(1),
  }),
]);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors mentioning `types/academy.ts` (a few downstream errors are *expected* here until Tasks 3–4 land, since `DemoLesson.tsx`'s switch won't yet handle the new literal — that's fine, keep going, the file will be internally consistent once all tasks are done).

- [ ] **Step 3: Commit**

```bash
git add types/academy.ts
git commit -m "feat: add market-mood surface to the Academy demo schema"
```

---

### Task 2: Extract Market Mood's display components

**Files:**
- Create: `components/market/MarketMoodDisplay.tsx`
- Modify: `app/tools/market-mood/MarketMoodClientPage.tsx`

**Interfaces:**
- Produces: `moodColor(score: number): string`, `MoodHero({ score, label, animated }): JSX.Element`, `SignalCard({ signal }): JSX.Element`, `MoodSkeleton(): JSX.Element` — all exported, consumed by both the real page (this task) and `MarketMoodDemo.tsx` (Task 3).

- [ ] **Step 1: Create the shared display file**

```tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { MoodSignal } from '@/app/api/market/mood/route';

// ─── Score → color (slightly desaturated, less neon) ─────────────────────────

export function moodColor(score: number): string {
  if (score <= 20) return '#dc6464';  // extreme fear  — muted red
  if (score <= 40) return '#d8884c';  // fear          — burnt orange
  if (score <= 60) return '#c9a851';  // neutral       — wheat
  if (score <= 80) return '#86a55c';  // greed         — sage
  return '#5fa67a';                   // extreme greed — muted teal-green
}

// ─── Smooth rAF tween for any 0..1 progress value ────────────────────────────

function useEased(target: number, animated: boolean, durationMs = 1100): number {
  const [v, setV] = useState(0);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    if (!animated) return;
    t0Ref.current = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const tick = (ts: number) => {
      if (!t0Ref.current) t0Ref.current = ts;
      const t = Math.min((ts - t0Ref.current) / durationMs, 1);
      setV(target * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, animated, durationMs]);

  return animated ? v : target;
}

/** Stable, human-legible data-tour anchor for a signal card, keyed by name
 *  (not array index — a signal can drop out if its data source fails, which
 *  would otherwise reorder/shrink the array under a positional key). */
export function signalTourId(name: string): string {
  return `mood-signal-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

// ─── Hero — score number + spectrum bar (modern, neutral, single-color) ──────

export function MoodHero({ score, label, animated }: { score: number; label: string; animated: boolean }) {
  const eased = useEased(score / 100, animated); // 0..1
  const color = moodColor(score);
  const pct = `${(eased * 100).toFixed(2)}%`;

  return (
    <div className="space-y-7" data-tour="mood-hero">
      {/* Score + label — quiet centering, no glow, no shadow */}
      <div className="text-center">
        <div className="flex items-baseline justify-center gap-2">
          <span
            className="font-mono font-semibold tabular-nums leading-none"
            style={{
              color,
              fontSize: 'clamp(72px, 14vw, 104px)',
              letterSpacing: '-0.04em',
            }}
          >
            {score}
          </span>
          <span className="text-base text-muted-foreground/80 font-mono mb-2">/100</span>
        </div>
        <div
          className="text-[11px] font-semibold uppercase mt-3"
          style={{ color, letterSpacing: '0.3em', opacity: 0.85 }}
        >
          {label}
        </div>
      </div>

      {/* Spectrum bar with marker */}
      <div className="space-y-3 px-1">
        <div className="relative h-1 rounded-full bg-border/40">
          {/* Active fill — single color, opacity gradient so it never reads as neon */}
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-none"
            style={{
              width: pct,
              background: `linear-gradient(to right, ${color}55, ${color})`,
            }}
          />

          {/* Vertical guide line behind the marker — adds intentionality */}
          <div
            className="absolute -top-[3px] h-[10px] w-px"
            style={{ left: pct, background: color, opacity: 0.4, transform: 'translateX(-0.5px)' }}
          />

          {/* Marker — small chip-like circle */}
          <div
            className="absolute top-1/2 h-3.5 w-3.5 rounded-full border-[1.5px] shadow-sm"
            style={{
              left: pct,
              background: 'hsl(var(--background))',
              borderColor: color,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>

        {/* End labels */}
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80">
          <span>Fear</span>
          <span className="font-mono tabular-nums text-muted-foreground/80">
            0&nbsp;·&nbsp;25&nbsp;·&nbsp;50&nbsp;·&nbsp;75&nbsp;·&nbsp;100
          </span>
          <span>Greed</span>
        </div>
      </div>
    </div>
  );
}

// ─── Signal card — neutral card surface, accent only on score + bar ──────────

export function SignalCard({ signal }: { signal: MoodSignal }) {
  const color = moodColor(signal.score);
  return (
    <div
      className="rounded-2xl border border-border/40 bg-card/30 px-4 py-4 transition-colors hover:border-border/70"
      data-tour={signalTourId(signal.name)}
    >
      {/* Top row: name + state chip */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
          {signal.name}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 leading-none"
          style={{ color, background: `${color}14` }}
        >
          {signal.label}
        </span>
      </div>

      {/* Score */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <span
          className="font-mono font-semibold tabular-nums leading-none"
          style={{ color, fontSize: '36px', letterSpacing: '-0.03em' }}
        >
          {signal.score}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/80 mb-0.5">/100</span>
      </div>

      {/* Mini spectrum bar */}
      <div className="relative h-[2px] w-full rounded-full bg-border/40 mb-3">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${signal.score}%`, background: color, opacity: 0.85 }}
        />
        <div
          className="absolute top-1/2 h-2 w-2 rounded-full border"
          style={{
            left: `${signal.score}%`,
            background: 'hsl(var(--background))',
            borderColor: color,
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {signal.detail}
      </p>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

export function MoodSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <Skeleton className="h-24 w-40 mx-auto rounded-lg" />
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[150px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `MarketMoodClientPage.tsx` to import instead of define**

Find:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw, AlertCircle, Gauge } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';
import type { MarketMoodData, MoodSignal } from '@/app/api/market/mood/route';

// ─── Score → color (slightly desaturated, less neon) ─────────────────────────

function moodColor(score: number): string {
  if (score <= 20) return '#dc6464';  // extreme fear  — muted red
  if (score <= 40) return '#d8884c';  // fear          — burnt orange
  if (score <= 60) return '#c9a851';  // neutral       — wheat
  if (score <= 80) return '#86a55c';  // greed         — sage
  return '#5fa67a';                   // extreme greed — muted teal-green
}

// ─── Smooth rAF tween for any 0..1 progress value ────────────────────────────

function useEased(target: number, animated: boolean, durationMs = 1100): number {
  const [v, setV] = useState(0);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    if (!animated) return;
    t0Ref.current = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const tick = (ts: number) => {
      if (!t0Ref.current) t0Ref.current = ts;
      const t = Math.min((ts - t0Ref.current) / durationMs, 1);
      setV(target * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, animated, durationMs]);

  return animated ? v : target;
}

// ─── Hero — score number + spectrum bar (modern, neutral, single-color) ──────

function MoodHero({ score, label, animated }: { score: number; label: string; animated: boolean }) {
  const eased = useEased(score / 100, animated); // 0..1
  const color = moodColor(score);
  const pct = `${(eased * 100).toFixed(2)}%`;

  return (
    <div className="space-y-7">
      {/* Score + label — quiet centering, no glow, no shadow */}
      <div className="text-center">
        <div className="flex items-baseline justify-center gap-2">
          <span
            className="font-mono font-semibold tabular-nums leading-none"
            style={{
              color,
              fontSize: 'clamp(72px, 14vw, 104px)',
              letterSpacing: '-0.04em',
            }}
          >
            {score}
          </span>
          <span className="text-base text-muted-foreground/80 font-mono mb-2">/100</span>
        </div>
        <div
          className="text-[11px] font-semibold uppercase mt-3"
          style={{ color, letterSpacing: '0.3em', opacity: 0.85 }}
        >
          {label}
        </div>
      </div>

      {/* Spectrum bar with marker */}
      <div className="space-y-3 px-1">
        <div className="relative h-1 rounded-full bg-border/40">
          {/* Active fill — single color, opacity gradient so it never reads as neon */}
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-none"
            style={{
              width: pct,
              background: `linear-gradient(to right, ${color}55, ${color})`,
            }}
          />

          {/* Vertical guide line behind the marker — adds intentionality */}
          <div
            className="absolute -top-[3px] h-[10px] w-px"
            style={{ left: pct, background: color, opacity: 0.4, transform: 'translateX(-0.5px)' }}
          />

          {/* Marker — small chip-like circle */}
          <div
            className="absolute top-1/2 h-3.5 w-3.5 rounded-full border-[1.5px] shadow-sm"
            style={{
              left: pct,
              background: 'hsl(var(--background))',
              borderColor: color,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>

        {/* End labels */}
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80">
          <span>Fear</span>
          <span className="font-mono tabular-nums text-muted-foreground/80">
            0&nbsp;·&nbsp;25&nbsp;·&nbsp;50&nbsp;·&nbsp;75&nbsp;·&nbsp;100
          </span>
          <span>Greed</span>
        </div>
      </div>
    </div>
  );
}

// ─── Signal card — neutral card surface, accent only on score + bar ──────────

function SignalCard({ signal }: { signal: MoodSignal }) {
  const color = moodColor(signal.score);
  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 px-4 py-4 transition-colors hover:border-border/70">
      {/* Top row: name + state chip */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
          {signal.name}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 leading-none"
          style={{ color, background: `${color}14` }}
        >
          {signal.label}
        </span>
      </div>

      {/* Score */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <span
          className="font-mono font-semibold tabular-nums leading-none"
          style={{ color, fontSize: '36px', letterSpacing: '-0.03em' }}
        >
          {signal.score}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/80 mb-0.5">/100</span>
      </div>

      {/* Mini spectrum bar */}
      <div className="relative h-[2px] w-full rounded-full bg-border/40 mb-3">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${signal.score}%`, background: color, opacity: 0.85 }}
        />
        <div
          className="absolute top-1/2 h-2 w-2 rounded-full border"
          style={{
            left: `${signal.score}%`,
            background: 'hsl(var(--background))',
            borderColor: color,
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {signal.detail}
      </p>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function MoodSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <Skeleton className="h-24 w-40 mx-auto rounded-lg" />
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[150px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
```

Replace with:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertCircle, Gauge } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';
import { MoodHero, SignalCard, MoodSkeleton } from '@/components/market/MarketMoodDisplay';
import type { MarketMoodData } from '@/app/api/market/mood/route';

// ─── Page ─────────────────────────────────────────────────────────────────────
```

(This removes the `Skeleton`, `useEffect`, `useState`, `useRef`, and `MoodSignal` imports along with the extracted functions, since none of them are used directly by the page anymore — everything the page needs now comes from `MarketMoodDisplay`.)

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors mentioning `MarketMoodDisplay.tsx` or `MarketMoodClientPage.tsx`.
Run: `npm run lint` — expect no errors or warnings (in particular, no unused-import warnings on the trimmed `MarketMoodClientPage.tsx` import list).

- [ ] **Step 4: Manual verification — real page unchanged**

Run: `npm run dev`, load `/tools/market-mood` in a browser, confirm it renders identically to before this change (composite score, 4 signal cards, methodology footer) — this is the hard regression constraint from Global Constraints.

- [ ] **Step 5: Commit**

```bash
git add components/market/MarketMoodDisplay.tsx app/tools/market-mood/MarketMoodClientPage.tsx
git commit -m "refactor: extract Market Mood display components for reuse in an Academy demo lesson"
```

---

### Task 3: `MarketMoodDemo.tsx` + wire into `DemoLesson.tsx`

**Files:**
- Create: `components/academy/lessons/demo/MarketMoodDemo.tsx`
- Modify: `components/academy/lessons/DemoLesson.tsx`

**Interfaces:**
- Consumes: `MoodHero`/`SignalCard`/`MoodSkeleton` (Task 2), `DemoSurfaceShell` (existing, `components/academy/lessons/demo/DemoSurfaceShell.tsx`), `MarketMoodData` type (existing, `app/api/market/mood/route.ts`).
- Produces: `MarketMoodDemo` component with props `{ onClose: () => void; children: ReactNode }` — no action-satisfying callback, matching `PortfolioDemo`'s view-only shape.

- [ ] **Step 1: Create the demo component**

```tsx
'use client';

import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MoodHero, SignalCard, MoodSkeleton } from '@/components/market/MarketMoodDisplay';
import type { MarketMoodData } from '@/app/api/market/mood/route';
import { DemoSurfaceShell } from './DemoSurfaceShell';

interface Props {
  onClose: () => void;
  children: ReactNode;
}

/**
 * Market Mood demo: mounts the REAL Market Mood tool, public live data with no
 * user entanglement, so the learner sees an actual Fear & Greed composite and
 * its 4 signals update live. View-only, no required action, matching
 * PortfolioDemo's shape rather than ScreenerDemo/DividendDemo's gated ones.
 */
export function MarketMoodDemo({ onClose, children }: Props) {
  const { data, isLoading } = useQuery<MarketMoodData>({
    queryKey: ['academy-market-mood-demo'],
    queryFn: async () => {
      const res = await fetch('/api/market/mood');
      if (!res.ok) throw new Error('Failed to load market mood');
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  return (
    <DemoSurfaceShell eyebrow="Demo · Reading market sentiment" title="Market Mood" onClose={onClose}>
      <p className="mb-6 text-sm text-muted-foreground">
        This is BullPen&apos;s real Market Mood tool, a live composite of 4 signals that
        gauge fear and greed across the market right now.
      </p>

      {isLoading || !data ? (
        <MoodSkeleton />
      ) : (
        <div className="space-y-10">
          <MoodHero score={data.composite} label={data.label} animated />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.signals.map((signal) => (
              <SignalCard key={signal.name} signal={signal} />
            ))}
          </div>
        </div>
      )}

      {children}
    </DemoSurfaceShell>
  );
}
```

- [ ] **Step 2: Wire into `DemoLesson.tsx`**

Find:

```tsx
const ScreenerDemo = dynamic(() => import('./demo/ScreenerDemo').then((m) => m.ScreenerDemo), { ssr: false });
const AiResearchDemo = dynamic(() => import('./demo/AiResearchDemo').then((m) => m.AiResearchDemo), { ssr: false });
```

Replace with:

```tsx
const ScreenerDemo = dynamic(() => import('./demo/ScreenerDemo').then((m) => m.ScreenerDemo), { ssr: false });
const AiResearchDemo = dynamic(() => import('./demo/AiResearchDemo').then((m) => m.AiResearchDemo), { ssr: false });
const MarketMoodDemo = dynamic(() => import('./demo/MarketMoodDemo').then((m) => m.MarketMoodDemo), { ssr: false });
```

Then find:

```tsx
    case 'ai-research':
      return (
        <AiResearchDemo
          fixtureId={content.fixtureId}
          onResearched={() => markActionSatisfied('run-research')}
          onClose={finish}
        >
          {tour}
        </AiResearchDemo>
      );
    default:
      return null;
  }
```

Replace with:

```tsx
    case 'ai-research':
      return (
        <AiResearchDemo
          fixtureId={content.fixtureId}
          onResearched={() => markActionSatisfied('run-research')}
          onClose={finish}
        >
          {tour}
        </AiResearchDemo>
      );
    case 'market-mood':
      return (
        <MarketMoodDemo onClose={finish}>
          {tour}
        </MarketMoodDemo>
      );
    default:
      return null;
  }
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors anywhere now (this is the point where `DemoLesson.tsx`'s switch becomes exhaustive again over the 6-branch union).
Run: `npm run lint` — expect no errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add components/academy/lessons/demo/MarketMoodDemo.tsx components/academy/lessons/DemoLesson.tsx
git commit -m "feat: add Market Mood demo lesson component"
```

---

### Task 4: Author and apply the lesson content

**Files:**
- Create (throwaway, not committed): a scratchpad SQL file for review before applying.

**Interfaces:**
- None — this is a data-only change against the live `macro-mechanics` course already in Supabase (course id resolved by slug inside the SQL itself, same pattern as every other Academy seed).

- [ ] **Step 1: Draft the lesson content**

5 steps: an intro (no spotlight), the composite hero, and 3 of the 4 signal cards — specifically the two that tie back to concepts already taught in this course (Junk Bond Demand → Credit Spread from Read 1, Safe Haven Demand → the flight-to-safety framing from the same read) plus Market Volatility as the most intuitive signal to lead with. All `requiredAction: 'none'` (view-only, matching `PortfolioDemo`'s precedent — Market Mood has no natural gating action the way "apply a filter" or "run a calculation" does).

```json
{
  "steps": [
    { "id": "mood-intro", "target": "none", "title": "Reading the Market's Mood", "body": "Everything from this course, rates, the yield curve, credit spreads, oil, feeds into how investors actually feel right now. This tour opens BullPen's real Market Mood tool: a live Fear and Greed score built from 4 signals that update throughout the day.", "requiredAction": "none" },
    { "id": "mood-hero-step", "target": "mood-hero", "title": "The composite score", "body": "This number blends all 4 signals into one read. 0 is extreme fear, 100 is extreme greed. Watch how it shifts as the market's mood changes throughout the day.", "requiredAction": "none" },
    { "id": "mood-volatility-step", "target": "mood-signal-market-volatility", "title": "Market Volatility", "body": "This tracks the VIX, a measure of how much investors expect prices to swing. Low readings mean a calm, complacent market. A rising VIX is the market pricing in more fear.", "requiredAction": "none" },
    { "id": "mood-credit-step", "target": "mood-signal-junk-bond-demand", "title": "Junk Bond Demand: a live Credit Spread", "body": "This is the Credit Spread concept from earlier in this course, made real. When investors chase riskier, higher-yield bonds over safer ones, it signals risk appetite. When they retreat to safer bonds, it signals caution.", "requiredAction": "none" },
    { "id": "mood-safehaven-step", "target": "mood-signal-safe-haven-demand", "title": "Safe Haven Demand: flight to safety", "body": "When stocks outperform Treasury bonds, investors are favoring risk. When bonds start outperforming stocks, money is often fleeing to safety, exactly the kind of signal that can accompany a yield curve inversion.", "requiredAction": "none" }
  ]
}
```

- [ ] **Step 2: Write and review the SQL**

```sql
-- BullPen Academy — hand-authored demo lesson for "macro-mechanics"
-- Adds the deferred Market Mood tour as lesson 7, per
-- docs/superpowers/plans/2026-08-05-academy-macro-courses's follow-up scope.

-- Bump the existing closing scenario lesson to make room for the demo at order_index 5.
UPDATE academy_lessons
SET order_index = 6
WHERE course_id = (SELECT id FROM academy_courses WHERE slug = 'macro-mechanics')
  AND slug = 'rate-hike-portfolio-call';

-- Insert the Market Mood demo lesson at order_index 5.
INSERT INTO academy_lessons (course_id, slug, title, type, order_index, xp_reward, content)
VALUES (
  (SELECT id FROM academy_courses WHERE slug = 'macro-mechanics'),
  'market-mood-demo',
  'Market Mood: See the Signals Live',
  'demo',
  5,
  25,
  '{"surface":"market-mood","steps":[{"id":"mood-intro","target":"none","title":"Reading the Market''s Mood","body":"Everything from this course, rates, the yield curve, credit spreads, oil, feeds into how investors actually feel right now. This tour opens BullPen''s real Market Mood tool: a live Fear and Greed score built from 4 signals that update throughout the day.","requiredAction":"none"},{"id":"mood-hero-step","target":"mood-hero","title":"The composite score","body":"This number blends all 4 signals into one read. 0 is extreme fear, 100 is extreme greed. Watch how it shifts as the market''s mood changes throughout the day.","requiredAction":"none"},{"id":"mood-volatility-step","target":"mood-signal-market-volatility","title":"Market Volatility","body":"This tracks the VIX, a measure of how much investors expect prices to swing. Low readings mean a calm, complacent market. A rising VIX is the market pricing in more fear.","requiredAction":"none"},{"id":"mood-credit-step","target":"mood-signal-junk-bond-demand","title":"Junk Bond Demand: a live Credit Spread","body":"This is the Credit Spread concept from earlier in this course, made real. When investors chase riskier, higher-yield bonds over safer ones, it signals risk appetite. When they retreat to safer bonds, it signals caution.","requiredAction":"none"},{"id":"mood-safehaven-step","target":"mood-signal-safe-haven-demand","title":"Safe Haven Demand: flight to safety","body":"When stocks outperform Treasury bonds, investors are favoring risk. When bonds start outperforming stocks, money is often fleeing to safety, exactly the kind of signal that can accompany a yield curve inversion.","requiredAction":"none"}]}'::jsonb
)
ON CONFLICT (course_id, slug) DO NOTHING;
```

Save this as `supabase/seeds/017_academy_macro_mechanics_demo.sql` (matches the established seed numbering — 015/016 were the two macro courses).

- [ ] **Step 3: Apply via Supabase MCP**

Apply `supabase/seeds/017_academy_macro_mechanics_demo.sql` via `apply_migration` (project `kgqpzuvhslqazurfrqya`), per this project's standing rule to apply immediately.

- [ ] **Step 4: Verify against the live DB**

Query `academy_lessons` for `macro-mechanics` ordered by `order_index`, confirm exactly 7 rows: the 3 reads (0–2), quiz (3), match (4), the new demo (5), and the scenario now at 6 — and confirm the course's total XP display (90 → 115) picks up the demo's 25 XP.

- [ ] **Step 5: Commit**

```bash
git add supabase/seeds/017_academy_macro_mechanics_demo.sql
git commit -m "content: add Market Mood demo lesson to macro-mechanics"
```

---

### Task 5: End-to-end browser verification

- [ ] **Step 1: Manual verification (Playwright, QA test account)**

Run: `npm run dev`. Log in as the QA test account (credentials in project memory `reference-qa-test-account.md` — note this account is free-tier, so it can't open a Pro-gated lesson's content normally; either temporarily bump its `account_tier` to Pro for this check, or verify via direct API/DB inspection that the lesson content is well-formed, then revert the tier bump).

1. Navigate to `/academy/macro-mechanics`, confirm 7 lessons listed, "115 XP available", and lesson order reads: 3 reads → quiz → match → "Market Mood: See the Signals Live" (Demo) → "The Rate Hike Rotation" (Scenario).
2. Open the demo lesson, confirm it opens the fullscreen shell with the real Market Mood composite score and 4 signal cards rendering live data.
3. Step through the tour: confirm the spotlight correctly lands on the hero, then each of the 3 targeted signal cards (Market Volatility, Junk Bond Demand, Safe Haven Demand) without getting stuck.
4. Confirm "Finish" on the last step closes the demo and marks the lesson complete (XP awarded, back on the course page with the demo lesson checked off).
5. Confirm `/tools/market-mood` (the real tool page, outside Academy) still renders identically to before Task 2's extraction.
