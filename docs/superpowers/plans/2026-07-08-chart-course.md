# Chart Course Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive "Reading Charts" course to Academy that teaches candlestick anatomy, chart types/timeframes, and the SMA indicator using BullPen's own live `AdvancedChartModal`, guided by a new spotlight-tour overlay.

**Architecture:** A new Academy lesson type `chart-tour` plugs into the existing course/lesson/XP/streak system exactly like `read`/`quiz`/`match`/`scenario` do. A new `ChartTourLesson` component mounts `AdvancedChartModal` as a fully controlled component (owning its own local `range`/`chartType`/`indicators` state — no dependency on any stock page) alongside a new `CourseChartTour` overlay that reads a `steps[]` config, spotlights real toolbar DOM elements via `data-tour` attributes, and gates "Next" on verified state changes for hands-on steps.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Framer Motion, Supabase Postgres (JSONB `content` column), Tailwind CSS.

## Global Constraints

- No test framework in this repo — every task's verification is `npm run lint` (0 errors) plus a dev-server + manual check; the final task also requires a manual browser walkthrough (cannot be scripted, since it needs an authenticated session and the daily-streak/XP flow).
- Never create feature branches — all commits go directly to `preview`.
- When staging changes, use exact file paths (`git add <path> <path>`) — never `git add -A` or `git add .`. This repo's working tree may contain unrelated in-progress work from other sessions.
- New Supabase migrations must be applied immediately via the Supabase MCP (`mcp__claude_ai_Supabase__apply_migration`), matching `CLAUDE.md`. Do not wait for the user to run it manually.
- Adding `'chart-tour'` to `LessonType` requires updating **every** place that keys off `LessonType` exhaustively, not just `LessonPlayer.tsx` — confirmed via repo-wide grep, the two call sites are `components/academy/LessonPlayer.tsx` (schema-validation switch + type-dispatch JSX) and `app/academy/[courseSlug]/page.tsx` (`TYPE_META` record, used for the lesson-list icon). Missing the second one would throw `Cannot read properties of undefined` at runtime the first time a `chart-tour` lesson appears in a course's lesson list.
- `AdvancedChartModal`'s `range` is currently modal-internal state with no way to observe it from outside (unlike `chartType`/`indicators`, which are already lifted). This plan adds an optional `onRangeChange` callback prop — additive only, existing callers (`StockPricePanel`) are unaffected since they don't pass it.

---

### Task 1: Extend the Academy content model with `chart-tour`

**Files:**
- Modify: `types/academy.ts`

**Interfaces:**
- Produces: `ChartTourContentSchema` (Zod), `ChartTourContent` (inferred type), `'chart-tour'` added to `LessonTypeSchema` and to the `LessonContentSchema` discriminated union, `ChartTourContent` added to `Lesson['content']`'s union.
- Consumes: nothing new.

- [ ] **Step 1: Add the `chart-tour` lesson type and content schema**

In `types/academy.ts`, find:

```ts
export const LessonTypeSchema = z.enum(['read', 'quiz', 'match', 'scenario']);
export type LessonType = z.infer<typeof LessonTypeSchema>;
```

Change to:

```ts
export const LessonTypeSchema = z.enum(['read', 'quiz', 'match', 'scenario', 'chart-tour']);
export type LessonType = z.infer<typeof LessonTypeSchema>;
```

Find:

```ts
export const ScenarioContentSchema = z.object({
  setup: z.string(),
  image: z.string().url().optional(),
  choices: z
    .array(
      z.object({
        label: z.string(),
        feedback: z.string(),
        isCorrect: z.boolean(),
      })
    )
    .min(2),
});
export type ScenarioContent = z.infer<typeof ScenarioContentSchema>;
```

Directly after it, add:

```ts
export const ChartTourStepSchema = z.object({
  id: z.string(),
  target: z.enum(['chart-type-toggle', 'range-selector', 'add-indicator-button', 'candle-area', 'none']),
  title: z.string(),
  body: z.string(),
  requiredAction: z.enum(['add-sma-indicator', 'switch-chart-type', 'change-range', 'none']).default('none'),
});
export type ChartTourStep = z.infer<typeof ChartTourStepSchema>;

export const ChartTourContentSchema = z.object({
  ticker: z.string(),
  initialRange: z.enum(['1D', '1W', '1M', '6M', '1Y', 'YTD', '5Y', 'MAX']),
  initialChartType: z.enum(['candles', 'line', 'area']),
  steps: z.array(ChartTourStepSchema).min(1),
});
export type ChartTourContent = z.infer<typeof ChartTourContentSchema>;
```

- [ ] **Step 2: Add it to the discriminated union and the `Lesson` content type**

Find:

```ts
export const LessonContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('read'), data: ReadContentSchema }),
  z.object({ type: z.literal('quiz'), data: QuizContentSchema }),
  z.object({ type: z.literal('match'), data: MatchContentSchema }),
  z.object({ type: z.literal('scenario'), data: ScenarioContentSchema }),
]);
export type LessonContent = z.infer<typeof LessonContentSchema>;
```

Change to:

```ts
export const LessonContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('read'), data: ReadContentSchema }),
  z.object({ type: z.literal('quiz'), data: QuizContentSchema }),
  z.object({ type: z.literal('match'), data: MatchContentSchema }),
  z.object({ type: z.literal('scenario'), data: ScenarioContentSchema }),
  z.object({ type: z.literal('chart-tour'), data: ChartTourContentSchema }),
]);
export type LessonContent = z.infer<typeof LessonContentSchema>;
```

Find:

```ts
export interface Lesson {
  id: string;
  courseId: string;
  slug: string;
  title: string;
  type: LessonType;
  orderIndex: number;
  xpReward: number;
  content: ReadContent | QuizContent | MatchContent | ScenarioContent;
}
```

Change to:

```ts
export interface Lesson {
  id: string;
  courseId: string;
  slug: string;
  title: string;
  type: LessonType;
  orderIndex: number;
  xpReward: number;
  content: ReadContent | QuizContent | MatchContent | ScenarioContent | ChartTourContent;
}
```

- [ ] **Step 3: Lint check**

Run: `npx eslint types/academy.ts`
Expected: `0 problems`

- [ ] **Step 4: Commit**

```bash
git add types/academy.ts
git commit -m "feat(academy): add chart-tour lesson type and content schema"
git push origin preview
```

---

### Task 2: Add tour anchors and `onRangeChange` to the chart components

**Files:**
- Modify: `components/stock/advanced-chart/ChartToolbar.tsx`
- Modify: `components/stock/advanced-chart/IndicatorMenu.tsx`
- Modify: `components/stock/advanced-chart/AdvancedChartModal.tsx`

**Interfaces:**
- Produces: three stable `data-tour` anchors (`"chart-type-toggle"`, `"range-selector"`, `"add-indicator-button"`) that Task 3's overlay will `document.querySelector` for, plus a new optional `onRangeChange?: (range: ChartRange) => void` prop on `AdvancedChartModal`.
- Consumes: nothing new.

- [ ] **Step 1: Add `data-tour="chart-type-toggle"` and `data-tour="range-selector"`**

In `components/stock/advanced-chart/ChartToolbar.tsx`, find:

```tsx
      {/* Chart type */}
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
```

Change to:

```tsx
      {/* Chart type */}
      <div data-tour="chart-type-toggle" className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
```

Find:

```tsx
      {/* Range — horizontal scroller on mobile so it stays one row */}
      <div className="scrollbar-hide -mx-1 flex max-w-full items-center gap-0.5 overflow-x-auto px-1">
```

Change to:

```tsx
      {/* Range — horizontal scroller on mobile so it stays one row */}
      <div data-tour="range-selector" className="scrollbar-hide -mx-1 flex max-w-full items-center gap-0.5 overflow-x-auto px-1">
```

- [ ] **Step 2: Add `data-tour="add-indicator-button"`**

In `components/stock/advanced-chart/IndicatorMenu.tsx`, find:

```tsx
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LineChartIcon className="h-3.5 w-3.5" />
          Indicators
```

Change to:

```tsx
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tour="add-indicator-button"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LineChartIcon className="h-3.5 w-3.5" />
          Indicators
```

- [ ] **Step 3: Add the `onRangeChange` prop to `AdvancedChartModal`**

In `components/stock/advanced-chart/AdvancedChartModal.tsx`, find:

```ts
  chartType: AdvancedChartType;
  onChartType: (t: AdvancedChartType) => void;
  indicators: IndicatorInstance[];
```

Change to:

```ts
  chartType: AdvancedChartType;
  onChartType: (t: AdvancedChartType) => void;
  /** Optional — notified whenever the range changes, for callers that don't otherwise observe it (e.g. the Academy chart-tour lesson). Range itself stays modal-internal state. */
  onRangeChange?: (range: ChartRange) => void;
  indicators: IndicatorInstance[];
```

Find:

```ts
export function AdvancedChartModal({
  ticker, initialRange, onClose,
  chartType, onChartType, indicators, onAddIndicator, onRemoveIndicator, onUpdateIndicator, onApplyPreset,
  onReplaceIndicators, onApplyConfig,
  showVolume, onToggleVolume, showEvents, onToggleEvents,
}: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [tool, setTool] = useState<ChartTool>('none');
  const [aiOpen, setAiOpen] = useState(false);

  const { presets, savePreset, deletePreset } = useChartPresets();
  const { create: createAlert } = useAlerts();

  const handleClearIndicators = () => onReplaceIndicators([]);
  const handleSavePreset = (name: string) =>
    savePreset({ name, range, chartType, indicators, showVolume, showEvents });
  const handleApplyPreset = (p: ChartPreset) => {
    setRange(p.range);
    onApplyConfig({
      chartType: p.chartType,
      indicators: p.indicators,
      showVolume: p.showVolume,
      showEvents: p.showEvents,
    });
  };
```

Change to:

```ts
export function AdvancedChartModal({
  ticker, initialRange, onClose,
  chartType, onChartType, onRangeChange, indicators, onAddIndicator, onRemoveIndicator, onUpdateIndicator, onApplyPreset,
  onReplaceIndicators, onApplyConfig,
  showVolume, onToggleVolume, showEvents, onToggleEvents,
}: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [tool, setTool] = useState<ChartTool>('none');
  const [aiOpen, setAiOpen] = useState(false);

  const handleSetRange = (r: ChartRange) => {
    setRange(r);
    onRangeChange?.(r);
  };

  const { presets, savePreset, deletePreset } = useChartPresets();
  const { create: createAlert } = useAlerts();

  const handleClearIndicators = () => onReplaceIndicators([]);
  const handleSavePreset = (name: string) =>
    savePreset({ name, range, chartType, indicators, showVolume, showEvents });
  const handleApplyPreset = (p: ChartPreset) => {
    handleSetRange(p.range);
    onApplyConfig({
      chartType: p.chartType,
      indicators: p.indicators,
      showVolume: p.showVolume,
      showEvents: p.showEvents,
    });
  };
```

Find (inside `dispatchChartAction`):

```ts
      case 'chart_set_timeframe':
        setRange(action.range);
        break;
```

Change to:

```ts
      case 'chart_set_timeframe':
        handleSetRange(action.range);
        break;
```

Find (inside the `ChartToolbar` JSX):

```tsx
        range={range}
        onRange={setRange}
```

Change to:

```tsx
        range={range}
        onRange={handleSetRange}
```

- [ ] **Step 4: Lint check**

Run: `npx eslint components/stock/advanced-chart/ChartToolbar.tsx components/stock/advanced-chart/IndicatorMenu.tsx components/stock/advanced-chart/AdvancedChartModal.tsx`
Expected: `0 problems`

- [ ] **Step 5: Verify a stock page's fullscreen chart still works**

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/stock/AAPL
taskkill //F //IM node.exe //T
```
Expected: `200`. Then manually open `http://localhost:3000/stock/AAPL`, open the fullscreen chart, and confirm chart type / range / indicators still all work exactly as before (this task only adds attributes and an optional unused-by-existing-callers prop — no existing behavior should change).

- [ ] **Step 6: Commit**

```bash
git add components/stock/advanced-chart/ChartToolbar.tsx components/stock/advanced-chart/IndicatorMenu.tsx components/stock/advanced-chart/AdvancedChartModal.tsx
git commit -m "feat(chart): add tour anchors and onRangeChange to AdvancedChartModal"
git push origin preview
```

---

### Task 3: `CourseChartTour` overlay component

**Files:**
- Create: `components/academy/lessons/CourseChartTour.tsx`

**Interfaces:**
- Consumes: nothing project-specific — a self-contained overlay.
- Produces:
  ```ts
  export type TourStepTarget = 'chart-type-toggle' | 'range-selector' | 'add-indicator-button' | 'candle-area' | 'none';
  export type TourRequiredAction = 'add-sma-indicator' | 'switch-chart-type' | 'change-range' | 'none';
  export interface TourStep { id: string; target: TourStepTarget; title: string; body: string; requiredAction: TourRequiredAction; }
  export function CourseChartTour(props: {
    steps: TourStep[];
    stepIndex: number;
    onStepIndexChange: (i: number) => void;
    isActionSatisfied: boolean;
    onSkip: () => void;
    onFinish: () => void;
  }): JSX.Element | null
  ```
  Task 4 imports `TourStep`/`CourseChartTour` from this file and passes `content.steps` (which structurally match `TourStep`, both sourced from the same enum values defined in Task 1).

- [ ] **Step 1: Create the component**

Create `components/academy/lessons/CourseChartTour.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TourStepTarget = 'chart-type-toggle' | 'range-selector' | 'add-indicator-button' | 'candle-area' | 'none';
export type TourRequiredAction = 'add-sma-indicator' | 'switch-chart-type' | 'change-range' | 'none';

export interface TourStep {
  id: string;
  target: TourStepTarget;
  title: string;
  body: string;
  requiredAction: TourRequiredAction;
}

interface Props {
  steps: TourStep[];
  stepIndex: number;
  onStepIndexChange: (i: number) => void;
  /** Whether the current step's requiredAction condition is currently satisfied. Ignored for steps with requiredAction 'none'. */
  isActionSatisfied: boolean;
  onSkip: () => void;
  onFinish: () => void;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 340;

function tooltipStyle(rect: DOMRect | null): CSSProperties {
  if (!rect) {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  }
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - 16));
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow > 220 ? rect.bottom + 12 : Math.max(16, rect.top - 12);
  const transform = spaceBelow > 220 ? undefined : 'translateY(-100%)';
  return { left, top, transform };
}

export function CourseChartTour({ steps, stepIndex, onStepIndexChange, isActionSatisfied, onSkip, onFinish }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[stepIndex];

  useEffect(() => {
    if (!step || step.target === 'none' || step.target === 'candle-area') {
      setRect(null);
      return;
    }

    let raf: number | undefined;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else {
        raf = requestAnimationFrame(measure);
      }
    };
    measure();

    const onReposition = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [step]);

  if (!step) return null;

  const isLast = stepIndex === steps.length - 1;
  const canAdvance = step.requiredAction === 'none' || isActionSatisfied;

  const advance = () => {
    if (isLast) onFinish();
    else onStepIndexChange(stepIndex + 1);
  };

  return (
    <div className="fixed inset-0 z-[120]">
      {/* Dimmed backdrop with a spotlight cutout around the current target (box-shadow trick — no SVG mask needed) */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-primary transition-all duration-200"
          style={{
            left: rect.left - SPOTLIGHT_PADDING,
            top: rect.top - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/60" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'pointer-events-auto absolute rounded-xl border border-border bg-background p-4 shadow-2xl',
          )}
          style={{ width: `min(${TOOLTIP_WIDTH}px, calc(100vw - 2rem))`, ...tooltipStyle(rect) }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {steps.map((s, i) => (
                <div
                  key={s.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === stepIndex ? 'w-5 bg-primary' : i < stepIndex ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted',
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip tour"
              className="text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-1 text-sm font-semibold text-foreground">{step.title}</p>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
          {step.requiredAction !== 'none' && !isActionSatisfied && (
            <p className="mb-3 text-[11px] font-medium text-primary">Try it on the chart to continue →</p>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={advance}
              disabled={!canAdvance}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {isLast ? 'Finish' : 'Next'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `npx eslint components/academy/lessons/CourseChartTour.tsx`
Expected: `0 problems`

- [ ] **Step 3: Commit**

```bash
git add components/academy/lessons/CourseChartTour.tsx
git commit -m "feat(academy): add CourseChartTour spotlight overlay component"
git push origin preview
```

---

### Task 4: `ChartTourLesson` component

**Files:**
- Create: `components/academy/lessons/ChartTourLesson.tsx`

**Interfaces:**
- Consumes: `ChartTourContent` type from Task 1 (`@/types/academy`); `CourseChartTour` from Task 3 (`./CourseChartTour`); `onRangeChange` prop from Task 2 (`AdvancedChartModal`); `getIndicatorDef`, `defaultParamsFor`, `INDICATOR_PALETTE`, `IndicatorInstance` from `@/lib/finance/indicators` (existing exports, already used identically in `AdvancedChartModal.tsx:219-231`).
- Produces: `ChartTourLesson({ content, onComplete }: { content: ChartTourContent; onComplete: () => void })` — a React component. `LessonPlayer` (Task 5) renders this with `onComplete={() => handleLessonComplete()}`, the same contract every other lesson type uses.

- [ ] **Step 1: Create the component**

Create `components/academy/lessons/ChartTourLesson.tsx`:

```tsx
'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ChartTourContent } from '@/types/academy';
import type { AdvancedChartType, ChartRange } from '@/hooks/use-chart-prefs';
import {
  getIndicatorDef,
  defaultParamsFor,
  INDICATOR_PALETTE,
  type IndicatorInstance,
} from '@/lib/finance/indicators';
import { CourseChartTour } from './CourseChartTour';

const AdvancedChartModal = dynamic(
  () => import('@/components/stock/advanced-chart/AdvancedChartModal').then((m) => m.AdvancedChartModal),
  { ssr: false },
);

interface Props {
  content: ChartTourContent;
  onComplete: () => void;
}

export function ChartTourLesson({ content, onComplete }: Props) {
  const [chartType, setChartType] = useState<AdvancedChartType>(content.initialChartType);
  const [range, setRange] = useState<ChartRange>(content.initialRange);
  const [indicators, setIndicators] = useState<IndicatorInstance[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(true);

  const initialChartTypeRef = useRef(content.initialChartType);
  const initialRangeRef = useRef(content.initialRange);

  const step = content.steps[stepIndex];

  const isActionSatisfied = useMemo(() => {
    if (!step) return true;
    switch (step.requiredAction) {
      case 'add-sma-indicator':
        return indicators.some((i) => i.type === 'sma');
      case 'switch-chart-type':
        return chartType !== initialChartTypeRef.current;
      case 'change-range':
        return range !== initialRangeRef.current;
      case 'none':
      default:
        return true;
    }
  }, [step, indicators, chartType, range]);

  const addIndicator = (type: string) => {
    if (indicators.some((i) => i.type === type)) return;
    const def = getIndicatorDef(type);
    if (!def) return;
    const params = defaultParamsFor(def);
    const used = new Set(indicators.map((i) => i.color));
    const color = INDICATOR_PALETTE.find((c) => !used.has(c)) ?? INDICATOR_PALETTE[indicators.length % INDICATOR_PALETTE.length];
    setIndicators((prev) => [...prev, { id: `${type}-${Date.now()}`, type, params, color }]);
  };
  const removeIndicator = (id: string) => setIndicators((prev) => prev.filter((i) => i.id !== id));
  const updateIndicator = (id: string, params: Record<string, number>) =>
    setIndicators((prev) => prev.map((i) => (i.id === id ? { ...i, params } : i)));

  const finish = () => {
    setActive(false);
    onComplete();
  };

  if (!active) return null;

  return (
    <>
      <AdvancedChartModal
        ticker={content.ticker}
        initialRange={content.initialRange}
        onClose={finish}
        chartType={chartType}
        onChartType={setChartType}
        onRangeChange={setRange}
        indicators={indicators}
        onAddIndicator={addIndicator}
        onRemoveIndicator={removeIndicator}
        onUpdateIndicator={updateIndicator}
        onApplyPreset={() => {}}
        onReplaceIndicators={setIndicators}
        onApplyConfig={(config) => {
          setChartType(config.chartType);
          setIndicators(config.indicators);
        }}
        showVolume={false}
        onToggleVolume={() => {}}
        showEvents={false}
        onToggleEvents={() => {}}
      />
      <CourseChartTour
        steps={content.steps}
        stepIndex={stepIndex}
        onStepIndexChange={setStepIndex}
        isActionSatisfied={isActionSatisfied}
        onSkip={finish}
        onFinish={finish}
      />
    </>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `npx eslint components/academy/lessons/ChartTourLesson.tsx`
Expected: `0 problems`

- [ ] **Step 3: Commit**

```bash
git add components/academy/lessons/ChartTourLesson.tsx
git commit -m "feat(academy): add ChartTourLesson component"
git push origin preview
```

---

### Task 5: Wire `chart-tour` into the lesson-rendering surfaces

**Files:**
- Modify: `components/academy/LessonPlayer.tsx`
- Modify: `app/academy/[courseSlug]/page.tsx`

**Interfaces:**
- Consumes: `ChartTourContentSchema`/`ChartTourContent` from Task 1, `ChartTourLesson` from Task 4.

- [ ] **Step 1: Add the schema case and the lesson-type render case**

In `components/academy/LessonPlayer.tsx`, find:

```ts
import { ReadLesson } from '@/components/academy/lessons/ReadLesson';
import { QuizLesson } from '@/components/academy/lessons/QuizLesson';
import { MatchLesson } from '@/components/academy/lessons/MatchLesson';
import { ScenarioLesson } from '@/components/academy/lessons/ScenarioLesson';
import { CompletionCelebration } from '@/components/academy/CompletionCelebration';
import { ACADEMY_STATS_QUERY_KEY } from '@/hooks/use-academy-stats';
import {
  ReadContentSchema,
  QuizContentSchema,
  MatchContentSchema,
  ScenarioContentSchema,
} from '@/types/academy';
import type {
  AcademyStats,
  Lesson,
  ReadContent,
  QuizContent,
  MatchContent,
  ScenarioContent,
} from '@/types/academy';
```

Change to:

```ts
import { ReadLesson } from '@/components/academy/lessons/ReadLesson';
import { QuizLesson } from '@/components/academy/lessons/QuizLesson';
import { MatchLesson } from '@/components/academy/lessons/MatchLesson';
import { ScenarioLesson } from '@/components/academy/lessons/ScenarioLesson';
import { ChartTourLesson } from '@/components/academy/lessons/ChartTourLesson';
import { CompletionCelebration } from '@/components/academy/CompletionCelebration';
import { ACADEMY_STATS_QUERY_KEY } from '@/hooks/use-academy-stats';
import {
  ReadContentSchema,
  QuizContentSchema,
  MatchContentSchema,
  ScenarioContentSchema,
  ChartTourContentSchema,
} from '@/types/academy';
import type {
  AcademyStats,
  Lesson,
  ReadContent,
  QuizContent,
  MatchContent,
  ScenarioContent,
  ChartTourContent,
} from '@/types/academy';
```

Find:

```ts
  const validatedContent = useMemo(() => {
    switch (lesson.type) {
      case 'read':     return ReadContentSchema.safeParse(lesson.content);
      case 'quiz':     return QuizContentSchema.safeParse(lesson.content);
      case 'match':    return MatchContentSchema.safeParse(lesson.content);
      case 'scenario': return ScenarioContentSchema.safeParse(lesson.content);
    }
  }, [lesson.type, lesson.content]);
```

Change to:

```ts
  const validatedContent = useMemo(() => {
    switch (lesson.type) {
      case 'read':       return ReadContentSchema.safeParse(lesson.content);
      case 'quiz':       return QuizContentSchema.safeParse(lesson.content);
      case 'match':      return MatchContentSchema.safeParse(lesson.content);
      case 'scenario':   return ScenarioContentSchema.safeParse(lesson.content);
      case 'chart-tour': return ChartTourContentSchema.safeParse(lesson.content);
    }
  }, [lesson.type, lesson.content]);
```

Find:

```tsx
      {lesson.type === 'scenario' && (
        <ScenarioLesson
          content={validatedContent.data as ScenarioContent}
          onComplete={(score) => handleLessonComplete(score)}
        />
      )}

      {celebrating && <CompletionCelebration xpEarned={lesson.xpReward} />}
```

Change to:

```tsx
      {lesson.type === 'scenario' && (
        <ScenarioLesson
          content={validatedContent.data as ScenarioContent}
          onComplete={(score) => handleLessonComplete(score)}
        />
      )}
      {lesson.type === 'chart-tour' && (
        <ChartTourLesson
          content={validatedContent.data as ChartTourContent}
          onComplete={() => handleLessonComplete()}
        />
      )}

      {celebrating && <CompletionCelebration xpEarned={lesson.xpReward} />}
```

- [ ] **Step 2: Add `chart-tour` to the lesson-list `TYPE_META` record**

In `app/academy/[courseSlug]/page.tsx`, find:

```tsx
import { ArrowLeft, BookOpen, HelpCircle, Shuffle, GitFork, Check, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useUserProgress } from '@/hooks/use-user-progress';
import type { LessonType, LessonWithCompletion } from '@/types/academy';

const TYPE_META: Record<LessonType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  read:     { label: 'Read',     icon: BookOpen },
  quiz:     { label: 'Quiz',     icon: HelpCircle },
  match:    { label: 'Match',    icon: Shuffle },
  scenario: { label: 'Scenario', icon: GitFork },
};
```

Change to:

```tsx
import { ArrowLeft, BookOpen, HelpCircle, Shuffle, GitFork, CandlestickChart, Check, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useUserProgress } from '@/hooks/use-user-progress';
import type { LessonType, LessonWithCompletion } from '@/types/academy';

const TYPE_META: Record<LessonType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  read:        { label: 'Read',       icon: BookOpen },
  quiz:        { label: 'Quiz',       icon: HelpCircle },
  match:       { label: 'Match',      icon: Shuffle },
  scenario:    { label: 'Scenario',   icon: GitFork },
  'chart-tour': { label: 'Chart Tour', icon: CandlestickChart },
};
```

- [ ] **Step 3: Lint check**

Run: `npx eslint components/academy/LessonPlayer.tsx "app/academy/[courseSlug]/page.tsx"`
Expected: `0 problems`

- [ ] **Step 4: Verify existing Academy lessons still render**

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/academy
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/academy/what-is-a-stock
taskkill //F //IM node.exe //T
```
Expected: `200` for both (confirms the `TYPE_META` and switch-statement edits didn't break the existing course).

- [ ] **Step 5: Commit**

```bash
git add components/academy/LessonPlayer.tsx "app/academy/[courseSlug]/page.tsx"
git commit -m "feat(academy): wire chart-tour lesson type into LessonPlayer and course page"
git push origin preview
```

---

### Task 6: Seed the "Reading Charts" course

**Files:**
- Create: `supabase/migrations/077_academy_chart_tour.sql`

**Interfaces:**
- Produces: one `academy_courses` row (`slug: 'reading-charts'`) and three `academy_lessons` rows, each `content` JSONB matching `ChartTourContentSchema` from Task 1 exactly (`target`/`requiredAction` values must be ones `CourseChartTour`/`ChartTourLesson` from Tasks 3–4 actually understand).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/077_academy_chart_tour.sql`:

```sql
-- BullPen Academy — "Reading Charts" course: interactive chart-tour lessons.
-- Allows the new 'chart-tour' lesson type, then seeds one beginner course with
-- 3 chart-tour lessons (candlestick anatomy, chart types/timeframes, SMA
-- trend-following), each driven by the live AdvancedChartModal on AAPL.

ALTER TABLE academy_lessons DROP CONSTRAINT IF EXISTS academy_lessons_type_check;
ALTER TABLE academy_lessons ADD CONSTRAINT academy_lessons_type_check
  CHECK (type IN ('read', 'quiz', 'match', 'scenario', 'chart-tour'));

INSERT INTO academy_courses (slug, title, description, icon, color, order_index, difficulty, is_published) VALUES
  (
    'reading-charts',
    'Reading Charts',
    'Learn to read a real candlestick chart and use your first indicator — hands-on, on a live AAPL chart.',
    'CandlestickChart',
    'blue',
    1,
    'beginner',
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO academy_lessons (course_id, slug, title, type, order_index, xp_reward, content)
SELECT
  (SELECT id FROM academy_courses WHERE slug = 'reading-charts'),
  v.slug, v.title, v.type, v.order_index, v.xp_reward, v.content
FROM (VALUES
  (
    'candlestick-anatomy',
    'Candlestick Anatomy',
    'chart-tour',
    0,
    15,
    $$
    {
      "ticker": "AAPL",
      "initialRange": "1M",
      "initialChartType": "candles",
      "steps": [
        {
          "id": "intro",
          "target": "none",
          "title": "Every candle tells a story",
          "body": "This is AAPL's real price chart, live. Each shape you see is called a candlestick, and it packs four numbers into one glance: the open, high, low, and close for that period. Let's break one down.",
          "requiredAction": "none"
        },
        {
          "id": "body-wick",
          "target": "candle-area",
          "title": "Body and wick",
          "body": "The thick block is the body — it spans from the open price to the close price. The thin lines above and below are wicks (or shadows) — they show the highest and lowest price reached during that period, even if the price didn't close there.",
          "requiredAction": "none"
        },
        {
          "id": "color",
          "target": "candle-area",
          "title": "Green vs red",
          "body": "A green candle means the close was higher than the open — price rose over that period. A red candle means the close was lower than the open — price fell. Look at AAPL's recent candles: can you spot the story they're telling?",
          "requiredAction": "none"
        },
        {
          "id": "sequence",
          "target": "candle-area",
          "title": "Reading a sequence",
          "body": "One candle shows a single period. A row of candles shows a trend. A string of green candles climbing higher suggests buyers are in control; a string of red candles suggests sellers are. Nothing here predicts the future — but it tells you exactly what already happened.",
          "requiredAction": "none"
        },
        {
          "id": "wrap",
          "target": "none",
          "title": "You can read a candle now",
          "body": "That's it — open, high, low, close, and what color means. Every chart in BullPen uses these same candles. Next lesson: chart types and timeframes.",
          "requiredAction": "none"
        }
      ]
    }
    $$::jsonb
  ),
  (
    'chart-types-and-timeframes',
    'Chart Types & Timeframes',
    'chart-tour',
    1,
    20,
    $$
    {
      "ticker": "AAPL",
      "initialRange": "1M",
      "initialChartType": "candles",
      "steps": [
        {
          "id": "intro",
          "target": "none",
          "title": "Same data, different views",
          "body": "Candlesticks aren't the only way to view a chart. Line and area charts strip away the open/high/low and just connect the closing prices — cleaner, but less detailed. Let's try switching.",
          "requiredAction": "none"
        },
        {
          "id": "switch-type",
          "target": "chart-type-toggle",
          "title": "Try it: switch the chart type",
          "body": "Click Line or Area in the toolbar above to see AAPL's price with the candle detail removed.",
          "requiredAction": "switch-chart-type"
        },
        {
          "id": "after-switch",
          "target": "none",
          "title": "Notice the difference",
          "body": "Line and area charts are great for spotting the overall trend at a glance — that's why you'll often see them in news headlines. Candles are better when you need to see volatility within each period. Both show the exact same underlying data.",
          "requiredAction": "none"
        },
        {
          "id": "timeframe-intro",
          "target": "none",
          "title": "Zooming out: timeframes",
          "body": "The range buttons control how far back the chart looks — from a single day (1D) up to the entire history (ALL). A short timeframe shows every small wiggle; a long timeframe smooths those out and reveals the bigger trend.",
          "requiredAction": "none"
        },
        {
          "id": "switch-range",
          "target": "range-selector",
          "title": "Try it: change the timeframe",
          "body": "Click a different range in the toolbar — try 1Y or 5Y — and watch how AAPL's story looks different zoomed out.",
          "requiredAction": "change-range"
        },
        {
          "id": "wrap",
          "target": "none",
          "title": "Same stock, different lenses",
          "body": "Chart type and timeframe are just lenses — neither is 'correct.' Traders switch between them depending on whether they're checking a quick trend or planning a longer hold. Next up: your first indicator.",
          "requiredAction": "none"
        }
      ]
    }
    $$::jsonb
  ),
  (
    'trend-following-with-sma',
    'Trend-Following with SMA',
    'chart-tour',
    2,
    20,
    $$
    {
      "ticker": "AAPL",
      "initialRange": "6M",
      "initialChartType": "candles",
      "steps": [
        {
          "id": "intro",
          "target": "none",
          "title": "Smoothing out the noise",
          "body": "Price moves up and down constantly, which makes the overall trend hard to see at a glance. A moving average solves this by plotting the average closing price over a set number of periods, smoothing the noise into one clean line.",
          "requiredAction": "none"
        },
        {
          "id": "what-is-sma",
          "target": "none",
          "title": "Meet the SMA",
          "body": "The Simple Moving Average (SMA) is the most common one. An SMA(50) averages the last 50 closes; an SMA(200) averages the last 200. Shorter SMAs hug the price closely; longer SMAs move slower and show the bigger trend.",
          "requiredAction": "none"
        },
        {
          "id": "add-sma",
          "target": "add-indicator-button",
          "title": "Try it: add an SMA",
          "body": "Click Indicators in the toolbar above, then add an SMA to AAPL's chart to continue.",
          "requiredAction": "add-sma-indicator"
        },
        {
          "id": "interpret",
          "target": "none",
          "title": "Reading the line you added",
          "body": "When price stays above the SMA line, it's a sign of an uptrend — buyers have the upper hand. When price drops below it, that's often read as a warning sign. Traders also watch for the price line crossing the SMA as a potential turning point.",
          "requiredAction": "none"
        },
        {
          "id": "wrap",
          "target": "none",
          "title": "You've got the basics",
          "body": "Candlestick anatomy, chart types and timeframes, and your first indicator — that's the foundation for reading almost any chart. From here, exploring RSI, MACD, or Bollinger Bands will feel a lot more familiar.",
          "requiredAction": "none"
        }
      ]
    }
    $$::jsonb
  )
) AS v(slug, title, type, order_index, xp_reward, content)
ON CONFLICT (course_id, slug) DO NOTHING;
```

- [ ] **Step 2: Apply the migration via the Supabase MCP**

Call `mcp__claude_ai_Supabase__apply_migration` with project ID `kgqpzuvhslqazurfrqya`, migration name `academy_chart_tour`, and the SQL content from Step 1. Do not wait for the user to run it manually — this is a hard requirement from `CLAUDE.md`.

- [ ] **Step 3: Verify the course and lessons landed correctly**

Call `mcp__claude_ai_Supabase__execute_sql` with:

```sql
SELECT c.slug AS course_slug, l.slug, l.type, l.xp_reward, l.order_index, jsonb_array_length(l.content->'steps') AS step_count
FROM academy_lessons l
JOIN academy_courses c ON c.id = l.course_id
WHERE c.slug = 'reading-charts'
ORDER BY l.order_index;
```

Expected: 3 rows — `candlestick-anatomy` (5 steps), `chart-types-and-timeframes` (6 steps), `trend-following-with-sma` (5 steps), all `type = 'chart-tour'`.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/077_academy_chart_tour.sql
git commit -m "feat(academy): seed Reading Charts chart-tour course"
git push origin preview
```

---

## Final verification (run after all six tasks are complete)

```bash
npm run lint
```
Expected: 0 errors (warnings acceptable, per this repo's existing baseline).

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/academy
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/academy/reading-charts
taskkill //F //IM node.exe //T
```
Expected: `200` for both.

Then a manual browser pass (cannot be scripted — requires an authenticated session, since Academy XP/streak mutations run through `useAuth()`):
1. Go to `/academy`, confirm "Reading Charts" appears as a new course card with a candlestick icon.
2. Open **Candlestick Anatomy** — confirm all 5 steps are narrated-only (no spotlight target lock), "Next" always enabled, completing awards 15 XP and returns to the course page with the lesson marked done.
3. Open **Chart Types & Timeframes** — confirm the spotlight correctly highlights the chart-type toggle and range selector at the right steps, "Next" stays disabled until you actually click a different chart type / range on the real chart, then re-enables automatically.
4. Open **Trend-Following with SMA** — confirm "Next" stays disabled until you actually add an SMA indicator via the real Indicators menu, then re-enables.
5. In any lesson, click "Skip tour" and confirm it exits cleanly and still records completion.
6. Resize the browser window mid-lesson and confirm the spotlight box repositions correctly instead of drifting off the target.
