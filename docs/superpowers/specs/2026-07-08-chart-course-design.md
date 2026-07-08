# Chart Course — Interactive Guided Chart Lessons in Academy

## Overview

A new Academy course, "Reading Charts," teaches beginner investors how to read an OHLC/candlestick chart and use a basic indicator, by embedding BullPen's own fullscreen `AdvancedChartModal` — pointed at a live real ticker — inside a guided tour overlay. Most steps are narrated (spotlight + explanation); a few require the user to actually perform an action on the real chart (switch chart type, change range, add an SMA indicator) to advance.

This is a new Academy lesson type, `chart-tour`, alongside the existing `read`/`quiz`/`match`/`scenario` types — it plugs into the same course/lesson/XP/streak system with no changes to that system's mechanics.

## Content Model

`types/academy.ts`:
- `LessonTypeSchema` enum gains `'chart-tour'`.
- New `ChartTourContentSchema`:
  ```ts
  export const ChartTourContentSchema = z.object({
    ticker: z.string(),
    initialRange: z.enum(['1D','1W','1M','6M','1Y','YTD','5Y','MAX']),
    initialChartType: z.enum(['candles','line','area']),
    steps: z.array(z.object({
      id: z.string(),
      target: z.enum(['chart-type-toggle','range-selector','add-indicator-button','candle-area','none']),
      title: z.string(),
      body: z.string(),
      requiredAction: z.enum(['add-sma-indicator','switch-chart-type','change-range','none']).default('none'),
    })).min(1),
  });
  export type ChartTourContent = z.infer<typeof ChartTourContentSchema>;
  ```
- Added as a new member of the (currently unused, but kept consistent) `LessonContentSchema` discriminated union.
- `Lesson['content']` union type gains `ChartTourContent`.

## Lesson Player Integration

`components/academy/LessonPlayer.tsx`:
- Schema-validation switch (line ~49) gains `case 'chart-tour': return ChartTourContentSchema.safeParse(lesson.content);`
- Type-dispatch JSX (line ~129) gains `{lesson.type === 'chart-tour' && <ChartTourLesson content={validatedContent.data} onComplete={() => handleLessonComplete()} />}`
- No changes to `handleLessonComplete`, the completion API route, or XP/streak logic — `chart-tour` calls the same `onComplete()` contract every other lesson type uses.

## `ChartTourLesson` Component

New `components/academy/lessons/ChartTourLesson.tsx`:
- Owns local `useState` for `range`, `chartType`, `indicators` (seeded from `content.initialRange`/`initialChartType`/`[]`), and `showVolume`/`showEvents` (both default off).
- Mounts `AdvancedChartModal` directly, wired to its own local state via the modal's existing callback props (`onChartType`, `onAddIndicator`, `onRemoveIndicator`, etc.) plus a new `onRangeChange` callback (see "Chart Component Changes" below) — no dependency on `StockPricePanel` or any stock-page context.
- Renders `CourseChartTour` alongside it, passing `content.steps`, the current step index, and the current `chartType`/`range`/`indicators` state (for required-action verification).
- Calls `onComplete()` when the user finishes/dismisses the last step.

## `CourseChartTour` Overlay

New `components/academy/lessons/CourseChartTour.tsx`:
- Step-index state (`useState`), progress dots, "Skip tour" text link, Framer Motion `AnimatePresence` transitions — mirrors `OnboardingModal.tsx`'s existing conventions.
- For steps with a non-`'none'` `target`, looks up `document.querySelector('[data-tour="<target>"]')`, reads `getBoundingClientRect()`, and renders a dimmed backdrop with a clipped spotlight hole plus a positioned tooltip near the element. Recalculates position on `window resize`/`scroll` (passive listeners, cleaned up on step change/unmount). If the target element isn't found yet (still mounting), retries on a short interval until found or the step changes.
- For `target: 'none'` or `'candle-area'`, renders the tooltip in a fixed corner/centered position without a spotlight cutout — no canvas coordinate math.
- For steps with `requiredAction !== 'none'`, the "Next" button is disabled until the passed-in current state satisfies the condition (`indicators.some(i => i.type === 'sma')` for `add-sma-indicator`, `chartType !== initialChartType` for `switch-chart-type`, `range !== initialRange` for `change-range`). Once satisfied, the button enables automatically (no separate "check" click).

## Chart Component Changes

`components/stock/advanced-chart/ChartToolbar.tsx`:
- Add `data-tour="chart-type-toggle"`, `data-tour="range-selector"`, `data-tour="add-indicator-button"` attributes to the corresponding existing buttons. Purely additive — no behavior change, no new props.

`components/stock/advanced-chart/AdvancedChartModal.tsx`:
- `range` is currently modal-internal `useState`, seeded from `initialRange` but never lifted out — unlike `chartType`/`indicators`, there's no existing callback to observe range changes from outside. Add a new optional prop `onRangeChange?: (range: ChartRange) => void`, called wherever the modal's internal range setter is currently called. Optional and additive — `StockPricePanel`'s existing usage is unaffected since it doesn't pass this prop.

## v1 Course Content

New course **"Reading Charts"** (`academy_courses`, `difficulty: 'beginner'`), 3 lessons, ticker fixed to `AAPL` for all three:

1. **Candlestick Anatomy** (`type: 'chart-tour'`) — fully narrated: open/high/low/close, body vs. wick, green vs. red, reading a single candle and a sequence of candles. All steps `requiredAction: 'none'`.
2. **Chart Types & Timeframes** — narrated explanation of candlestick vs. line vs. area chart types and what timeframes/zoom are for, then one step requiring the user to switch chart type (`requiredAction: 'switch-chart-type'`) and one requiring a range change (`requiredAction: 'change-range'`), then a narrated wrap-up.
3. **Trend-Following with SMA** — narrated explanation of what a moving average shows and why traders use it, then a step requiring the user to add an SMA indicator (`requiredAction: 'add-sma-indicator'`) to continue, ending on a narrated step interpreting the line now on their chart.

Each lesson awards XP consistent with existing lesson XP values (matched to comparable existing `read`/`scenario` lessons of similar length — exact number set during implementation by looking at existing course XP values, not a new scale).

## Content Authoring / Seeding

Unlike prose-heavy lesson types, `chart-tour` content is structural configuration, not free-text Claude should draft. The 3 lessons are hand-authored directly as a new migration file `supabase/migrations/077_chart_tour_course.sql`, following the same `INSERT INTO academy_courses ... ON CONFLICT (slug) DO NOTHING` / `INSERT INTO academy_lessons (...) VALUES (...) ON CONFLICT (course_id, slug) DO NOTHING` shape that `scripts/generate-academy-course.ts` emits, with each lesson's `content` as a `'...'::jsonb` literal. Applied immediately via the Supabase MCP per `CLAUDE.md` convention.

## Error Handling / Edge Cases

- `AdvancedChartModal`'s own data-fetch loading/error states are unaffected by the tour — the overlay sits on top and never blocks on chart-data errors.
- If a `data-tour` target isn't mounted yet, the overlay retries briefly rather than erroring; steps with `target: 'none'` never depend on this.
- Tour progress is lesson-local only (a `useState` step index) — no persistence across a modal close/reopen or page navigation. Re-entering a lesson always restarts at step 1, consistent with how `read`/`quiz`/`match`/`scenario` lessons already behave (no mid-lesson resume for any existing type).

## Testing

- Manual dev-server walkthrough of all 3 lessons end-to-end (narrated steps advance, required-action steps stay blocked until the real action is performed, XP awards on completion, "Skip tour" works).
- Verify `data-tour` attributes don't affect `ChartToolbar.tsx`'s existing styling/behavior (attribute-only change).
- Verify schema validation rejects malformed `chart-tour` content the same way existing types do (via `safeParse` failure path already handled by `LessonPlayer.tsx`).
