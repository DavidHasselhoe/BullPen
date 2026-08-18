# Portfolio Risk Analysis Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Portfolio Risk Analysis results UI (`components/holdings/PortfolioRiskAnalysis.tsx`) from a dense, orange-accented, card-heavy layout into a quiet, institutional-grade analytics surface — summary first, evidence second, detailed reasoning last — using BullPen's actual design system instead of the generic spec it was requested from.

**Architecture:** Split the current 870-line monolith into a `components/holdings/risk-analysis/` directory of focused presentational components (one per section of the new information hierarchy), a shared `colors.ts` (the single DESIGN.md-compliant severity/color mapping) and `types.ts` (moved out of the component file, unchanged shape). `PortfolioRiskAnalysis.tsx` keeps 100% of its existing state machine, polling, quota/paywall, and mutation logic — it only stops owning the "loaded" state's presentation, delegating to a new `RiskAnalysisResult` orchestrator component. No API route, database schema, or AI prompt changes — this is a presentation-layer rebuild only. This matches the existing `components/deep-dive/` and `components/tools/portfolio-builder/` subdirectory convention for AI-result surfaces.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, existing shadcn/ui primitives (`Accordion`, `Badge`, `Button`, `Card`), the existing `Sparkline` component. No new dependencies.

**Spec:** This plan's Design Decisions section below reconciles the user's external redesign brief (pasted in conversation, not a file) against `DESIGN.md`/`PRODUCT.md`. There is no separate spec file — the brief and the reconciliation live here.

## Design Decisions (spec)

The user's brief was written without knowledge of BullPen's actual design system. These are the reconciliations, made deliberately rather than by silently reinterpreting the brief:

1. **No orange, no 5-tier traffic light.** The brief asks for "one primary risk accent: orange/red." BullPen's palette (`DESIGN.md` §2, "The One Signal Rule") has exactly two meaningful colors — Signal Emerald and Signal Red — plus Warn Amber and Info Blue reserved for status pills. Orange doesn't exist in the system. The current code's 4-5 tier green/amber/orange/red scale collapses to **3 visual tiers**: nothing-to-flag (default foreground, no color), Warn Amber (caution), Signal Red (the risk accent, "something genuinely requires attention" per the brief's own §2). Applied uniformly to `riskLevel` (Low/Moderate → neutral, Elevated → amber, High/Very High → red), `topRisks` severity (critical/high → red, medium → amber, low → Info Blue, since "low" is genuinely informational, which is exactly what Info Blue is for), and `stressScenarios` severity (high → red, medium → amber, low → Info Blue). One mapping function, reused everywhere — see Task 1.
2. **Score gauge**: replace the circular SVG-arc `ScoreRing` with a horizontal spectrum bar modeled on the existing `components/stock/VolatilityGauge.tsx` (a calm→volatile gradient track with a position marker and Low/High labels) — an established pattern in this exact codebase for "where does this number sit on a spectrum," not a new visual language. This satisfies the brief's explicit "do not use the large circular gauge, use a cleaner horizontal risk scale" request using a real existing component as the reference instead of inventing one from scratch.
3. **Progressive disclosure uses the existing `Accordion`** (`components/ui/accordion.tsx`, Radix-backed), not hand-rolled expand/collapse state. `DESIGN.md` §6 already mandates this ("put explanatory/methodology copy behind an Accordion, collapsed by default... don't render several paragraphs of always-visible explanatory text as a grid of static cards") — the brief's progressive-disclosure requirement and BullPen's existing rule are the same rule.
4. **Recommendations stay as `string[]`.** The brief's mockup shows structured `Current / Suggested range / Why / Potential effect` fields per recommendation. The AI's actual JSON schema (`app/api/holdings/risk-analysis/route.ts:56`) only returns `recommendations: string[]` — free-text bullet points. Per the brief's own §19 ("do not invent fake data, do not hardcode values that are currently dynamic"), this plan does **not** fabricate those sub-fields. Recommendations render as a clean numbered "Recommended Actions" list using the real string content. Upgrading the AI prompt/schema to emit structured fields is a separate, later change (data model, not presentation) — flagged to the user, not done here.
5. **No currency or geography exposure section.** The brief's §12 lists these as optional "if the underlying data supports it." It doesn't — the schema has no currency-exposure or geography fields, only `sectorBreakdown`. Omitted entirely rather than fabricated.
6. **The typewriter reveal on the summary is removed**, not preserved. It already had a `prefers-reduced-motion` fallback that rendered the text immediately; that fallback becomes the only behavior. Rationale: the brief's own quality bar (§22) asks "can a user understand the portfolio's main risk in 10 seconds?" — a character-by-character reveal of the one paragraph that answers that question works against it, and per `DESIGN.md`/the brief §18, animation should communicate a state change, not decorate. This is the one place this plan removes existing motion rather than only restyling.
7. **"AI Assessment" (brief §13) aggregates real, existing AI output** — the six risk-dimension `detail` strings (already returned by the API, currently shown inline in each metric tile) plus a static "how this score is calculated" methodology blurb sourced directly from the real weighting already encoded in the system prompt (concentration 25%, sectorDiversification 20%, marketCapBias 15%, volatilityExposure 20%, correlationRisk 10%, liquidityRisk 10% — `app/api/holdings/risk-analysis/route.ts:61`). This is documentation of real, already-shipped logic, not fabricated copy.
8. **Primary/Secondary/Tail risk highlights (brief §6)** are derived, not invented: Primary = `topRisks[0]`, Secondary = `topRisks[1]` (the system prompt already guarantees `topRisks` is "ordered by severity" — `route.ts:70` — no client-side re-sort needed), Tail = the `stressScenarios` entry with the largest parsed drawdown magnitude (reusing the existing `splitImpact` regex parser, moved into a shared util).
9. **Score trend delta** compares the currently-displayed analysis against the next-older entry in the history list (matched by timestamp, not blindly `history[1]`, so it stays correct after restoring an older saved analysis) — real data only, and `Sparkline`'s own "< 2 points renders nothing" guard means no trend visual is fabricated when there isn't enough history.
10. **Scope**: Risk Analysis only, per the user's explicit "start with this redesign." Deep Dive (`components/deep-dive/`) and Portfolio Builder (`components/tools/portfolio-builder/`) have structurally similar but fully independent implementations (their own score-ring variants, their own colored-stripe severity maps) and are **not** touched by this plan — noted as a future extension, not started here.

## Global Constraints

- No orange anywhere. Only Signal Emerald (`text-emerald-400`/`text-emerald-500`), Signal Red (`text-red-400`/`text-red-500`), Warn Amber (`text-amber-400`), Info Blue (`text-blue-400`), and neutral foreground/muted-foreground tokens.
- No `border-l-[3px]` / colored left-border-stripe accents anywhere (`DESIGN.md` explicit Don't).
- Every price/percentage/score numeral renders in a `font-mono tabular-nums` treatment (`DESIGN.md` "Tabular Numerals Rule").
- Every gain/loss/severity signal pairs color with an icon, sign, or text label — never color alone (`PRODUCT.md` accessibility requirement).
- No fabricated data — every number/label rendered must trace to a real field in `RiskAnalysis`, `SavedRiskAnalysis`, or the static methodology text sourced from the real system prompt.
- Reuse `Accordion`, `Badge`, `Button`, `Sparkline` from existing `components/ui`/`components/viz` — do not hand-roll new expand/collapse or trend-line primitives.
- Preserve every piece of existing behavior in `PortfolioRiskAnalysis.tsx` not explicitly called out for removal above: state machine, polling, background-generation resume-on-mount, quota/paywall dialog, notification-on-complete (server-side, untouched), Ask-Bull button, restore/delete mutations, loading-state symbol ticking, idle/error states.
- `npm run lint` is the quality gate (no test framework in this repo per `CLAUDE.md`); manual browser verification (dev server + real portfolio data) is required before considering any task done, per `CLAUDE.md`'s "start the dev server and use the feature in a browser" rule for frontend work.
- Per `CLAUDE.md`, invoke `/impeccable polish` on the changed surface before this is considered shipped (final task).

---

## File Structure

| File | Responsibility |
|---|---|
| `components/holdings/risk-analysis/types.ts` | `RiskAnalysis`/`RiskMetric`/`StressScenario` types, moved from the main file (create) |
| `components/holdings/risk-analysis/colors.ts` | The one DESIGN.md-compliant severity/color/tier mapping, plus `splitImpact` (create) |
| `components/holdings/risk-analysis/RiskScoreHero.tsx` | Score + level, horizontal gauge, trend delta, summary, primary/secondary/tail highlights (create) |
| `components/holdings/risk-analysis/RiskProfile.tsx` | Compact 6-row risk-dimension bars (create) |
| `components/holdings/risk-analysis/TopRisks.tsx` | Ranked, accordion-expandable risk list (create) |
| `components/holdings/risk-analysis/StressScenarios.tsx` | Redesigned scenario rows with accordion reasoning (create) |
| `components/holdings/risk-analysis/SectorExposure.tsx` | Compact sector bars, accordion-expand to tickers (create) |
| `components/holdings/risk-analysis/Recommendations.tsx` | Numbered "Recommended Actions" list (create) |
| `components/holdings/risk-analysis/AnalysisHistory.tsx` | Sparkline trend + compact restore/delete list (create) |
| `components/holdings/risk-analysis/AIAssessment.tsx` | Accordion: per-metric detail + methodology (create) |
| `components/holdings/risk-analysis/RiskAnalysisResult.tsx` | Orchestrator composing the above in hierarchy order (create) |
| `components/holdings/PortfolioRiskAnalysis.tsx` | Slimmed to trigger/state-machine/polling; renders `RiskAnalysisResult` (modify) |

---

### Task 1: Shared types and color system

**Files:**
- Create: `components/holdings/risk-analysis/types.ts`
- Create: `components/holdings/risk-analysis/colors.ts`

**Interfaces:**
- Produces: `RiskMetric`, `StressScenario`, `RiskAnalysis` types (re-exported, identical shape to the current inline types); `RiskTier = 'neutral' | 'caution' | 'risk' | 'info'`; `scoreTier(score: number): RiskTier`; `levelTier(level: string): RiskTier`; `topRiskTier(severity: string): RiskTier`; `scenarioTier(severity: string): RiskTier`; `tierTextClass(tier: RiskTier): string`; `tierBarClass(tier: RiskTier): string`; `tierBadgeClass(tier: RiskTier): string`; `splitImpact(impact: string): { figure: string | null; rest: string }`.

- [ ] **Step 1: Write `types.ts`**

```ts
// components/holdings/risk-analysis/types.ts
// Moved out of PortfolioRiskAnalysis.tsx unchanged — same shape the AI's JSON
// schema returns (app/api/holdings/risk-analysis/route.ts:36-58).

export interface RiskMetric {
  score: number;
  label: string;
  detail: string;
}

export interface StressScenario {
  scenario: string;
  estimatedImpact: string;
  severity: 'low' | 'medium' | 'high';
}

export interface RiskAnalysis {
  overallRiskScore: number;
  riskLevel: string;
  generatedAt: string;
  metrics: {
    concentration: RiskMetric;
    sectorDiversification: RiskMetric;
    marketCapBias: RiskMetric;
    volatilityExposure: RiskMetric;
    correlationRisk: RiskMetric;
    liquidityRisk: RiskMetric;
  };
  topRisks: { severity: string; factor: string; description: string }[];
  sectorBreakdown: { sector: string; symbols: string[]; estimatedWeight: number }[];
  stressScenarios: StressScenario[];
  recommendations: string[];
  portfolioSummary: string;
}
```

- [ ] **Step 2: Write `colors.ts`**

```ts
// components/holdings/risk-analysis/colors.ts
//
// The one severity/color mapping for the whole feature. Collapses the old
// 4-5 tier green/amber/orange/red scale to the 3 tiers BullPen's palette
// actually has (DESIGN.md "The One Signal Rule"): neutral (nothing to flag),
// caution (Warn Amber), risk (Signal Red) — plus 'info' for genuinely
// low-severity/informational items (Info Blue), which is what that token is
// for. No orange anywhere; it isn't part of the system.

export type RiskTier = 'neutral' | 'info' | 'caution' | 'risk';

/** Risk-dimension score (0-100) and the overall score share the same bands. */
export function scoreTier(score: number): RiskTier {
  if (score >= 70) return 'risk';
  if (score >= 45) return 'caution';
  return 'neutral';
}

/** riskLevel: 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Very High' (route.ts:62 thresholds). */
export function levelTier(level: string): RiskTier {
  switch (level) {
    case 'High':
    case 'Very High':
      return 'risk';
    case 'Elevated':
      return 'caution';
    default:
      return 'neutral';
  }
}

/** topRisks[].severity: 'critical' | 'high' | 'medium' | 'low' (route.ts:48). */
export function topRiskTier(severity: string): RiskTier {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'risk';
    case 'medium':
      return 'caution';
    default:
      return 'info';
  }
}

/** stressScenarios[].severity: 'low' | 'medium' | 'high' (route.ts:54). */
export function scenarioTier(severity: string): RiskTier {
  switch (severity) {
    case 'high':
      return 'risk';
    case 'medium':
      return 'caution';
    default:
      return 'info';
  }
}

export function tierTextClass(tier: RiskTier): string {
  switch (tier) {
    case 'risk':    return 'text-red-400';
    case 'caution': return 'text-amber-400';
    case 'info':    return 'text-blue-400';
    default:        return 'text-foreground';
  }
}

export function tierBarClass(tier: RiskTier): string {
  switch (tier) {
    case 'risk':    return 'bg-red-500';
    case 'caution': return 'bg-amber-500';
    case 'info':    return 'bg-blue-500';
    default:        return 'bg-muted-foreground/40';
  }
}

export function tierBadgeClass(tier: RiskTier): string {
  switch (tier) {
    case 'risk':    return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'caution': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'info':    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    default:        return 'bg-muted text-muted-foreground border-border/40';
  }
}

/**
 * Pulls a leading drawdown figure ("-30% to -45%") out of a stress scenario's
 * estimatedImpact prose so it reads as a scannable stat; the remainder is the
 * description. Moved from the old StressScenarioList unchanged.
 */
export function splitImpact(impact: string): { figure: string | null; rest: string } {
  const m = impact.match(
    /^\s*-?\d+(?:\.\d+)?%\s*(?:to|–|—|-)\s*-?\d+(?:\.\d+)?%|^\s*[-−]?\d+(?:\.\d+)?%/i
  );
  if (!m) return { figure: null, rest: impact.trim() };
  const figure = m[0].trim();
  const rest = impact.slice(m[0].length).replace(/^[\s.,—–-]+/, '').trim();
  return { figure, rest };
}

/** Parses the larger-magnitude percentage out of a drawdown figure string, for ranking scenarios by severity. Returns 0 if unparseable. */
export function drawdownMagnitude(impact: string): number {
  const matches = impact.match(/-?\d+(?:\.\d+)?%/g);
  if (!matches) return 0;
  return Math.max(...matches.map((m) => Math.abs(parseFloat(m))));
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "risk-analysis"` — expect no output (these are new, self-contained files with no external type dependencies yet).

- [ ] **Step 4: Commit**

```bash
git add components/holdings/risk-analysis/types.ts components/holdings/risk-analysis/colors.ts
git commit -m "feat: add shared types and DESIGN.md-compliant color tiers for risk analysis redesign"
```

---

### Task 2: `RiskScoreHero`

**Files:**
- Create: `components/holdings/risk-analysis/RiskScoreHero.tsx`

**Interfaces:**
- Consumes: `RiskAnalysis` (Task 1), `SavedRiskAnalysis` (`app/api/holdings/risk-analysis/history/route.ts`), `scoreTier`/`levelTier`/`topRiskTier`/`tierTextClass`/`splitImpact`/`drawdownMagnitude` (Task 1).
- Produces: `RiskScoreHero` component, props `{ analysis: RiskAnalysis; displayedTimestamp: string; history: SavedRiskAnalysis[] }`. Self-contained — computes its own trend delta and primary/secondary/tail derivations.

- [ ] **Step 1: Write the component**

```tsx
// components/holdings/risk-analysis/RiskScoreHero.tsx
'use client';

import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RiskAnalysis } from './types';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';
import { scoreTier, levelTier, topRiskTier, tierTextClass, splitImpact, drawdownMagnitude } from './colors';

interface Props {
  analysis: RiskAnalysis;
  /** ISO timestamp of the analysis currently on screen — analysis.generatedAt, or the restored-from timestamp. */
  displayedTimestamp: string;
  history: SavedRiskAnalysis[];
}

/** Horizontal risk gauge, modeled on components/stock/VolatilityGauge.tsx's
 * calm->volatile gradient track — an established pattern in this codebase for
 * "where does this number sit on a spectrum," not a new visual language. */
function RiskScale({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="w-full max-w-xs">
      <div className="relative h-2 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500">
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground/80">
        <span>Low</span>
        <span>Moderate</span>
        <span>High</span>
      </div>
    </div>
  );
}

function TrendDelta({ analysis, displayedTimestamp, history }: Props) {
  const displayedTime = new Date(displayedTimestamp).getTime();
  const previous = history.find((h) => new Date(h.createdAt).getTime() < displayedTime);
  if (!previous) return null;

  const delta = analysis.overallRiskScore - previous.overallRiskScore;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
        <Minus className="h-3 w-3" /> No change vs previous analysis
      </span>
    );
  }
  const worse = delta > 0;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[13px]', worse ? tierTextClass('risk') : tierTextClass('neutral'))}>
      {worse ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta)} pts vs previous analysis
    </span>
  );
}

function RiskHighlight({ label, title, detail, tier }: { label: string; title: string; detail?: string; tier: 'risk' | 'caution' | 'info' }) {
  return (
    <div className="min-w-0">
      <div className={cn('text-[11px] font-semibold uppercase tracking-wider', tierTextClass(tier))}>{label}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground truncate">{title}</div>
      {detail && <div className="text-[13px] text-muted-foreground truncate">{detail}</div>}
    </div>
  );
}

export function RiskScoreHero({ analysis, displayedTimestamp, history }: Props) {
  const tier = levelTier(analysis.riskLevel);
  const primary = analysis.topRisks?.[0];
  const secondary = analysis.topRisks?.[1];
  const tailScenario = analysis.stressScenarios?.length
    ? [...analysis.stressScenarios].sort((a, b) => drawdownMagnitude(b.estimatedImpact) - drawdownMagnitude(a.estimatedImpact))[0]
    : null;
  const tailFigure = tailScenario ? splitImpact(tailScenario.estimatedImpact).figure : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-4xl font-bold tabular-nums leading-none text-foreground">
              {analysis.overallRiskScore}
              <span className="text-lg text-muted-foreground/60">/100</span>
            </span>
          </div>
          <div className={cn('text-base font-semibold', tierTextClass(tier))}>{analysis.riskLevel} Risk</div>
          <TrendDelta analysis={analysis} displayedTimestamp={displayedTimestamp} history={history} />
        </div>
        <RiskScale score={analysis.overallRiskScore} />
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-foreground/85">{analysis.portfolioSummary}</p>

      {(primary || secondary || tailScenario) && (
        <div className="grid grid-cols-1 gap-4 border-t border-border/20 pt-4 sm:grid-cols-3">
          {primary && (
            <RiskHighlight label="Primary risk" title={primary.factor} detail={primary.description} tier={topRiskTier(primary.severity) === 'info' ? 'info' : topRiskTier(primary.severity) === 'caution' ? 'caution' : 'risk'} />
          )}
          {secondary && (
            <RiskHighlight label="Secondary risk" title={secondary.factor} detail={secondary.description} tier={topRiskTier(secondary.severity) === 'info' ? 'info' : topRiskTier(secondary.severity) === 'caution' ? 'caution' : 'risk'} />
          )}
          {tailScenario && (
            <RiskHighlight label="Tail risk" title={tailScenario.scenario} detail={tailFigure ?? undefined} tier="risk" />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint components/holdings/risk-analysis/RiskScoreHero.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/risk-analysis/RiskScoreHero.tsx
git commit -m "feat: add RiskScoreHero with horizontal gauge replacing the circular ring"
```

---

### Task 3: `RiskProfile`

**Files:**
- Create: `components/holdings/risk-analysis/RiskProfile.tsx`

**Interfaces:**
- Consumes: `RiskAnalysis['metrics']`, `scoreTier`/`tierBarClass`/`tierTextClass` (Task 1).
- Produces: `RiskProfile` component, props `{ metrics: RiskAnalysis['metrics'] }`.

- [ ] **Step 1: Write the component**

```tsx
// components/holdings/risk-analysis/RiskProfile.tsx
'use client';

import { cn } from '@/lib/utils';
import type { RiskAnalysis } from './types';
import { scoreTier, tierBarClass, tierTextClass } from './colors';

const METRIC_LABELS: Record<string, string> = {
  concentration: 'Concentration',
  sectorDiversification: 'Sector exposure',
  marketCapBias: 'Market-cap bias',
  volatilityExposure: 'Volatility',
  correlationRisk: 'Correlation',
  liquidityRisk: 'Liquidity',
};

interface Props {
  metrics: RiskAnalysis['metrics'];
}

export function RiskProfile({ metrics }: Props) {
  const rows = Object.entries(metrics) as [string, RiskAnalysis['metrics'][keyof RiskAnalysis['metrics']]][];

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">Risk profile</h3>
      <div className="space-y-2.5">
        {rows.map(([key, metric]) => {
          const tier = scoreTier(metric.score);
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-[13px] text-muted-foreground">{METRIC_LABELS[key] ?? key}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', tierBarClass(tier))}
                  style={{ width: `${Math.max(0, Math.min(100, metric.score))}%` }}
                />
              </div>
              <span className={cn('w-7 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums', tier === 'neutral' ? 'text-muted-foreground' : tierTextClass(tier))}>
                {metric.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint components/holdings/risk-analysis/RiskProfile.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/risk-analysis/RiskProfile.tsx
git commit -m "feat: add compact RiskProfile bars replacing the six-card grid"
```

---

### Task 4: `TopRisks`

**Files:**
- Create: `components/holdings/risk-analysis/TopRisks.tsx`

**Interfaces:**
- Consumes: `Accordion`/`AccordionItem`/`AccordionTrigger`/`AccordionContent` (`components/ui/accordion.tsx`), `topRiskTier`/`tierBadgeClass` (Task 1).
- Produces: `TopRisks` component, props `{ risks: RiskAnalysis['topRisks'] }`.

- [ ] **Step 1: Write the component**

```tsx
// components/holdings/risk-analysis/TopRisks.tsx
'use client';

import { cn } from '@/lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { RiskAnalysis } from './types';
import { topRiskTier, tierBadgeClass } from './colors';

interface Props {
  risks: RiskAnalysis['topRisks'];
}

export function TopRisks({ risks }: Props) {
  if (!risks?.length) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Top risks</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {risks.map((risk, i) => (
          <AccordionItem key={i} value={String(i)} className="border-border/20">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex min-w-0 items-baseline gap-3 text-left">
                <span className="font-mono text-xs text-muted-foreground/70 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="truncate text-sm font-medium text-foreground">{risk.factor}</span>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tierBadgeClass(topRiskTier(risk.severity)))}>
                  {risk.severity}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="pl-7 text-[13px] leading-relaxed text-muted-foreground">{risk.description}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint components/holdings/risk-analysis/TopRisks.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/risk-analysis/TopRisks.tsx
git commit -m "feat: add ranked accordion-based TopRisks list"
```

---

### Task 5: `StressScenarios`

**Files:**
- Create: `components/holdings/risk-analysis/StressScenarios.tsx`

**Interfaces:**
- Consumes: `Accordion` family, `scenarioTier`/`tierBadgeClass`/`tierTextClass`/`splitImpact` (Task 1).
- Produces: `StressScenarios` component, props `{ scenarios: RiskAnalysis['stressScenarios'] }`.

- [ ] **Step 1: Write the component**

```tsx
// components/holdings/risk-analysis/StressScenarios.tsx
'use client';

import { cn } from '@/lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { StressScenario } from './types';
import { scenarioTier, tierBadgeClass, tierTextClass, splitImpact } from './colors';

interface Props {
  scenarios: StressScenario[];
}

export function StressScenarios({ scenarios }: Props) {
  if (!scenarios?.length) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Downside scenarios</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {scenarios.map((s, i) => {
          const { figure, rest } = splitImpact(s.estimatedImpact);
          const tier = scenarioTier(s.severity);
          return (
            <AccordionItem key={i} value={String(i)} className="border-border/20">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{s.scenario}</div>
                    {figure && (
                      <div className={cn('font-mono text-lg font-bold tabular-nums leading-tight', tierTextClass(tier))}>
                        {figure}
                      </div>
                    )}
                  </div>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tierBadgeClass(tier))}>
                    {s.severity}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{rest || s.estimatedImpact}</p>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint components/holdings/risk-analysis/StressScenarios.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/risk-analysis/StressScenarios.tsx
git commit -m "feat: redesign StressScenarios as accordion rows, remove colored stripe accent"
```

---

### Task 6: `SectorExposure`

**Files:**
- Create: `components/holdings/risk-analysis/SectorExposure.tsx`

**Interfaces:**
- Consumes: `Accordion` family.
- Produces: `SectorExposure` component, props `{ sectors: RiskAnalysis['sectorBreakdown'] }`.

- [ ] **Step 1: Write the component**

```tsx
// components/holdings/risk-analysis/SectorExposure.tsx
'use client';

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { RiskAnalysis } from './types';

interface Props {
  sectors: RiskAnalysis['sectorBreakdown'];
}

export function SectorExposure({ sectors }: Props) {
  if (!sectors?.length) return null;
  const sorted = [...sectors].sort((a, b) => b.estimatedWeight - a.estimatedWeight);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Sector exposure</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {sorted.map((s) => (
          <AccordionItem key={s.sector} value={s.sector} className="border-border/20">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex flex-1 items-center gap-3 pr-2">
                <span className="min-w-0 flex-1 truncate text-left text-sm text-foreground">{s.sector}</span>
                <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full rounded-full bg-foreground/40" style={{ width: `${Math.min(s.estimatedWeight, 100)}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                  {s.estimatedWeight.toFixed(0)}%
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-1.5">
                {s.symbols.map((sym) => (
                  <span key={sym} className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground/85">
                    {sym}
                  </span>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint components/holdings/risk-analysis/SectorExposure.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/risk-analysis/SectorExposure.tsx
git commit -m "feat: redesign SectorExposure with accordion-expand ticker chips"
```

---

### Task 7: `Recommendations`

**Files:**
- Create: `components/holdings/risk-analysis/Recommendations.tsx`

**Interfaces:**
- Produces: `Recommendations` component, props `{ recommendations: string[] }`.

- [ ] **Step 1: Write the component**

```tsx
// components/holdings/risk-analysis/Recommendations.tsx
'use client';

interface Props {
  recommendations: string[];
}

// recommendations is a flat string[] (app/api/holdings/risk-analysis/route.ts:56)
// — no structured current/suggested-range/rationale fields exist to render,
// so this stays a clean numbered list rather than fabricating those sub-fields.
export function Recommendations({ recommendations }: Props) {
  if (!recommendations?.length) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Recommended actions</h3>
      <ol className="space-y-3">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold text-muted-foreground/70 tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="text-[13px] leading-relaxed text-foreground/85">{rec}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint components/holdings/risk-analysis/Recommendations.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/risk-analysis/Recommendations.tsx
git commit -m "feat: add Recommendations as a numbered action list"
```

---

### Task 8: `AnalysisHistory`

**Files:**
- Create: `components/holdings/risk-analysis/AnalysisHistory.tsx`

**Interfaces:**
- Consumes: `Sparkline` (`components/viz/Sparkline.tsx`), `SavedRiskAnalysis`, `tierTextClass`/`levelTier` (Task 1).
- Produces: `AnalysisHistory` component, props `{ items: SavedRiskAnalysis[]; onRestore: (id: string) => void; onDelete: (id: string) => void }` — same callback contract as the old `HistoryPanel` it replaces, so the call site in Task 11 doesn't need new wiring logic.

- [ ] **Step 1: Write the component**

```tsx
// components/holdings/risk-analysis/AnalysisHistory.tsx
'use client';

import { Trash2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sparkline } from '@/components/viz/Sparkline';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';
import { levelTier, tierTextClass } from './colors';

interface Props {
  items: SavedRiskAnalysis[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function AnalysisHistory({ items, onRestore, onDelete }: Props) {
  if (items.length === 0) return null;
  // history is created_at DESC (history/route.ts:28) — Sparkline wants oldest->newest.
  const scoresOldestFirst = [...items].reverse().map((h) => h.overallRiskScore);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground/70" />
          <h3 className="text-sm font-semibold text-foreground">Analysis history</h3>
        </div>
        {scoresOldestFirst.length >= 2 && (
          <Sparkline data={scoresOldestFirst} width={80} height={24} area ariaLabel="Risk score trend across saved analyses" />
        )}
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/30">
            <button onClick={() => onRestore(item.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className={cn('font-mono text-sm font-semibold tabular-nums', tierTextClass(levelTier(item.riskLevel)))}>
                {item.overallRiskScore}
              </span>
              <span className="text-[13px] text-muted-foreground">{item.riskLevel}</span>
              <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted-foreground/70">{formatAgo(item.createdAt)}</span>
            </button>
            <button
              onClick={() => onDelete(item.id)}
              aria-label="Delete this saved analysis"
              className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-red-500/10 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint components/holdings/risk-analysis/AnalysisHistory.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/risk-analysis/AnalysisHistory.tsx
git commit -m "feat: add AnalysisHistory with score-trend sparkline replacing the chip row"
```

---

### Task 9: `AIAssessment`

**Files:**
- Create: `components/holdings/risk-analysis/AIAssessment.tsx`

**Interfaces:**
- Consumes: `Accordion` family.
- Produces: `AIAssessment` component, props `{ metrics: RiskAnalysis['metrics'] }`.

- [ ] **Step 1: Write the component**

```tsx
// components/holdings/risk-analysis/AIAssessment.tsx
'use client';

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { RiskAnalysis } from './types';

const METRIC_LABELS: Record<string, string> = {
  concentration: 'Concentration',
  sectorDiversification: 'Sector diversification',
  marketCapBias: 'Market-cap bias',
  volatilityExposure: 'Volatility exposure',
  correlationRisk: 'Correlation risk',
  liquidityRisk: 'Liquidity risk',
};

// Real weighting from the system prompt (app/api/holdings/risk-analysis/route.ts:61)
// — documentation of already-shipped logic, not new copy.
const METHODOLOGY_TEXT =
  'The overall score is a weighted average across six dimensions: concentration (25%), ' +
  'sector diversification (20%), volatility exposure (20%), market-cap bias (15%), ' +
  'correlation risk (10%), and liquidity risk (10%). Each dimension is scored 0-100 ' +
  'from the portfolio\'s actual holdings, allocations, and sector membership.';

interface Props {
  metrics: RiskAnalysis['metrics'];
}

export function AIAssessment({ metrics }: Props) {
  const entries = Object.entries(metrics) as [string, RiskAnalysis['metrics'][keyof RiskAnalysis['metrics']]][];

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">AI assessment</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {entries.map(([key, metric]) => (
          <AccordionItem key={key} value={key} className="border-border/20">
            <AccordionTrigger className="py-3 hover:no-underline">
              <span className="text-sm text-foreground">{METRIC_LABELS[key] ?? key}</span>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{metric.detail}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
        <AccordionItem value="methodology" className="border-border/20">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="text-sm text-foreground">Methodology</span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{METHODOLOGY_TEXT}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint components/holdings/risk-analysis/AIAssessment.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/risk-analysis/AIAssessment.tsx
git commit -m "feat: add AIAssessment accordion aggregating per-metric reasoning and methodology"
```

---

### Task 10: `RiskAnalysisResult` orchestrator

**Files:**
- Create: `components/holdings/risk-analysis/RiskAnalysisResult.tsx`

**Interfaces:**
- Consumes: All of Tasks 2-9's components; `RiskAnalysis`/`SavedRiskAnalysis` types.
- Produces: `RiskAnalysisResult` component, props `{ analysis: RiskAnalysis; displayedTimestamp: string; history: SavedRiskAnalysis[]; onRestore: (id: string) => void; onDelete: (id: string) => void; footer: React.ReactNode }`. `footer` is a slot for the existing "Generated · <time> / Ask Bull about this" row (Task 11 passes it through unchanged rather than this component re-implementing footer logic that depends on `PortfolioRiskAnalysis`'s own state/handlers).

- [ ] **Step 1: Write the component**

```tsx
// components/holdings/risk-analysis/RiskAnalysisResult.tsx
'use client';

import type { RiskAnalysis } from './types';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';
import { RiskScoreHero } from './RiskScoreHero';
import { RiskProfile } from './RiskProfile';
import { TopRisks } from './TopRisks';
import { StressScenarios } from './StressScenarios';
import { SectorExposure } from './SectorExposure';
import { Recommendations } from './Recommendations';
import { AnalysisHistory } from './AnalysisHistory';
import { AIAssessment } from './AIAssessment';

interface Props {
  analysis: RiskAnalysis;
  displayedTimestamp: string;
  history: SavedRiskAnalysis[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  footer: React.ReactNode;
}

// Hierarchy order matches the redesign brief's target information architecture:
// score/summary -> risk profile -> top risks -> scenarios -> recommendations
// -> sector exposure -> history -> AI assessment (progressive disclosure last).
export function RiskAnalysisResult({ analysis, displayedTimestamp, history, onRestore, onDelete, footer }: Props) {
  return (
    <div className="space-y-7">
      <RiskScoreHero analysis={analysis} displayedTimestamp={displayedTimestamp} history={history} />

      <div className="space-y-6 border-t border-border/20 pt-6">
        <RiskProfile metrics={analysis.metrics} />
        <TopRisks risks={analysis.topRisks} />
        <StressScenarios scenarios={analysis.stressScenarios} />
        <Recommendations recommendations={analysis.recommendations} />
        <SectorExposure sectors={analysis.sectorBreakdown} />
      </div>

      <div className="space-y-6 border-t border-border/20 pt-6">
        <AnalysisHistory items={history} onRestore={onRestore} onDelete={onDelete} />
        <AIAssessment metrics={analysis.metrics} />
      </div>

      {footer}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint components/holdings/risk-analysis/RiskAnalysisResult.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/risk-analysis/RiskAnalysisResult.tsx
git commit -m "feat: add RiskAnalysisResult orchestrator composing the redesigned sections"
```

---

### Task 11: Rewire `PortfolioRiskAnalysis.tsx`

**Files:**
- Modify: `components/holdings/PortfolioRiskAnalysis.tsx`

**Interfaces:**
- Consumes: `RiskAnalysisResult` (Task 10), `RiskAnalysis` type from `./risk-analysis/types` (replacing the inline interface).
- Produces: no new exports — `PortfolioRiskAnalysis` keeps its existing `{ holdings }` prop contract, so every call site is unaffected.

- [ ] **Step 1: Remove the moved types, color helpers, `SectionLabel`, `ScoreRing`, `MetricCell`, stress-scenario helpers, and `HistoryPanel`**

Delete lines 22-350 of the current file (the `─── Types ───` through `─── History panel ───` sections — everything above `─── Main component ───`) and replace the import block at the top with:

```ts
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShieldAlert, RefreshCw, AlertTriangle, CheckCircle2, Crown, Sparkles,
} from 'lucide-react';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/use-auth';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import type { QuotaState } from '@/lib/billing/quotas';
import type { HoldingWithPrice } from './types';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';
import type { RiskAnalysis } from './risk-analysis/types';
import { RiskAnalysisResult } from './risk-analysis/RiskAnalysisResult';

type ErrorCode = 'invalid_key' | 'payment_required' | 'rate_limited' | 'parse_failed' | 'unknown';

interface StatusResponse {
  success: boolean;
  status?: 'pending' | 'done' | 'error';
  phase?: 'analyzing' | null;
  analysis?: RiskAnalysis | null;
  errorCode?: ErrorCode | null;
  errorMessage?: string | null;
}

interface PortfolioRiskAnalysisProps {
  holdings: HoldingWithPrice[];
}

const POLL_INTERVAL_MS = 2500;
const HISTORY_KEY = ['risk-analysis-history'];

// ─── Ask Bull query builder ────────────────────────────────────────────────────
// [display:...] is stripped in BullpenChat before rendering — the full prompt still reaches the AI.

function buildAskBullQuery(analysis: RiskAnalysis, holdings: HoldingWithPrice[]): string {
  const tickers = holdings.map((h) => h.symbol).join(', ');
  const topRisks = analysis.topRisks
    ?.slice(0, 3)
    .map((r) => `- ${r.factor} (${r.severity}): ${r.description}`)
    .join('\n') ?? '';
  const recommendations = analysis.recommendations
    ?.slice(0, 3)
    .map((r) => `- ${r}`)
    .join('\n') ?? '';

  return `[display:Explain my portfolio risk analysis]\nA risk analysis just ran on my portfolio (${tickers}). Overall risk: ${analysis.riskLevel} (${analysis.overallRiskScore}/100).\n\nTop risk factors:\n${topRisks}\n\nRecommendations given:\n${recommendations}\n\nCan you walk me through what this means in plain terms, and tell me which recommendation to prioritize first?`;
}
```

Note: `Info`, `Trash2`, `Clock`, `ChevronDown`, `ChevronUp` are dropped from the `lucide-react` import — they were only used by the removed `MetricCell`/`HistoryPanel`/top-risks-grid code, now owned by the new section components.

- [ ] **Step 2: Remove the typewriter effect**

Delete the `displayedSummary`/`typewriterRef` state and the "Typewriter reveal" `useEffect` (old lines 387-388, 443-460). Delete `summaryDone` (old line 588) and the `expandedMetric` state (old line 391, now owned internally by `TopRisks`'s `Accordion`). `RiskScoreHero` reads `analysis.portfolioSummary` directly — no intermediate reveal state needed.

- [ ] **Step 3: Replace the "Results" JSX block with `RiskAnalysisResult`**

Replace the entire `{/* ── Results ── */}` block (old lines 704-858) with:

```tsx
          {/* ── Results ─────────────────────────────────────────────────────── */}
          {state === 'loaded' && analysis && (
            <RiskAnalysisResult
              analysis={analysis}
              displayedTimestamp={restoredFrom ?? analysis.generatedAt}
              history={history}
              onRestore={restoreAnalysis}
              onDelete={(id) => deleteMutation.mutate(id)}
              footer={
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/15 pt-4">
                  <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground/80">
                    {restoredFrom ? `Restored · ${generatedTime}` : `Generated · ${generatedTime}`}
                  </span>
                  <button
                    onClick={() => openAIPanel({
                      query: buildAskBullQuery(analysis, holdings),
                      context: { tickers: holdings.map((h) => h.symbol), label: 'Your portfolio' },
                    })}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Sparkles className="h-3 w-3" />
                    Ask Bull about this
                  </button>
                </div>
              }
            />
          )}
```

The idle state's own `HistoryPanel` usage (old lines 643-647, rendered when there's no active analysis yet) becomes an `AnalysisHistory` usage — import it and swap the reference:

```tsx
              {history.length > 0 && (
                <div className="border-t border-border/20 pt-4">
                  <AnalysisHistory items={history} onRestore={restoreAnalysis} onDelete={(id) => deleteMutation.mutate(id)} />
                </div>
              )}
```

Add `import { AnalysisHistory } from './risk-analysis/AnalysisHistory';` to the import block from Step 1.

- [ ] **Step 4: Remove the now-dead `animated` state's only remaining consumer**

`animated` (old line 373) was passed to the removed `ScoreRing` for its count-up animation. Search the file for `animated`/`setAnimated` — if no other consumer remains after Steps 1-3, remove the state declaration and its two `setAnimated(true)` call sites (in `restoreAnalysis` and `pollStatus`'s success branch) along with the `requestAnimationFrame(() => setTimeout(() => setAnimated(true), 50));` lines, since nothing reads it anymore.

- [ ] **Step 5: Verify nothing else references removed identifiers**

Run: `npx eslint components/holdings/PortfolioRiskAnalysis.tsx` — this catches any leftover reference to `ScoreRing`, `MetricCell`, `HistoryPanel`, `SectionLabel`, `riskColor`, `riskTextClass`, `severityChip`, `metricBarColor`, `displayedSummary`, `summaryDone`, `expandedMetric`, or `animated` that Steps 1-4 missed (unused-var or undefined-name errors). Fix any that surface.

- [ ] **Step 6: Verify full file compiles and the feature works live**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "PortfolioRiskAnalysis"` — expect no output beyond the pre-existing, unrelated Supabase-generated-types class of error already present elsewhere in the codebase (per `CLAUDE.md`, these are suppressed at build time; if a NEW error references a symbol from this plan's own files, fix it — don't assume it's pre-existing without checking the symbol name).

Then, per `CLAUDE.md`'s frontend-work rule, start the dev server and exercise the real feature in a browser:
1. Navigate to the Holdings page's Risk Analysis card with a portfolio that has at least one existing saved analysis (or run a fresh analysis first).
2. Confirm the hero shows score, level, horizontal gauge, summary, and (if 2+ saved analyses exist) a trend delta — with no fabricated numbers when history is short.
3. Expand a Top Risk, a Stress Scenario, a Sector, and the AI Assessment accordion items — confirm each reveals real content and collapses cleanly.
4. Trigger "Re-analyze" and confirm the loading/error states (unchanged) still work, and the new result renders on completion.
5. Restore an older saved analysis from Analysis History and confirm the trend delta recalculates against the *next*-older entry, not always `history[1]`.
6. Check both light and dark mode, and resize to a narrow (375px) viewport to confirm no horizontal scroll and the hero/gauge stack sensibly.

- [ ] **Step 7: Commit**

```bash
git add components/holdings/PortfolioRiskAnalysis.tsx
git commit -m "refactor: rewire PortfolioRiskAnalysis to render the redesigned RiskAnalysisResult"
```

---

### Task 12: Lint, full-project check, and polish pass

**Files:** None (verification-only task).

- [ ] **Step 1: Full project lint**

Run: `npm run lint` — expect 0 errors (pre-existing warning count elsewhere in the repo is unrelated and acceptable per `CLAUDE.md`).

- [ ] **Step 2: Confirm no orange, no stripe accents, no fabricated fields remain**

Run: `grep -rn "orange" components/holdings/risk-analysis/ components/holdings/PortfolioRiskAnalysis.tsx` — expect no matches.
Run: `grep -rn "border-l-\[3px\]" components/holdings/risk-analysis/ components/holdings/PortfolioRiskAnalysis.tsx` — expect no matches.

- [ ] **Step 3: `/impeccable polish` pass**

Per `CLAUDE.md`'s pre-ship polish rule for UI/UX-heavy work, run `/impeccable polish` against the changed surface (the Holdings page's Risk Analysis card) before considering this shipped — it runs the design-system-alignment, spacing, interaction-state, and copy-consistency pass this plan's own review can't fully substitute for.

- [ ] **Step 4: Report back to the user**

Summarize what shipped, and explicitly flag the two scope decisions from the Design Decisions section that are genuine gaps versus the original brief (not bugs): (a) Recommendations render as plain text, not the brief's structured Current/Suggested-range mockup, because that data doesn't exist in the AI's schema yet; (b) currency/geography exposure sections were omitted for the same reason. Ask whether either is worth a follow-up schema/prompt change.

---

## Self-Review

**Spec coverage** (against the brief's §21 target hierarchy, reconciled per Design Decisions):
- Score hero + trend + summary + primary/secondary/tail — Task 2. ✓
- Risk profile (6 dimensions, muted bars) — Task 3. ✓
- Top risks (ranked, expandable) — Task 4. ✓
- Downside scenarios — Task 5. ✓
- Recommended actions — Task 7 (scoped to real data, see Design Decision 4). ✓
- Portfolio exposure / sectors — Task 6 (currency/geography omitted, Design Decision 5). ✓
- Analysis history / trend — Task 8. ✓
- AI assessment / methodology — Task 9. ✓
- Progressive disclosure throughout via `Accordion` — Tasks 4, 5, 6, 9. ✓
- No orange, restrained 3-tier color system — Task 1, enforced by Task 12 Step 2. ✓
- No circular gauge — Task 2 (`RiskScale`, horizontal). ✓
- No colored border-stripe accents — Task 12 Step 2 verifies their removal. ✓
- Existing functionality preserved (state machine, polling, quota/paywall, Ask Bull, restore/delete) — Task 11 only removes the typewriter effect (Design Decision 6) and the now-orphaned `animated`/`ScoreRing` state; everything else is a straight carry-over. ✓
- Responsive/dark-mode/reduced-motion — Task 11 Step 6 manual verification; no new animation added beyond existing 500ms bar transitions (within `DESIGN.md`'s 150-300ms micro-interaction guidance is exceeded slightly for the bar fill, matching the existing codebase's own 700ms precedent in the same component — left as-is rather than introducing a new timing value).

**Placeholder scan:** No `TBD`/`TODO` found. The two deliberate scope reductions (Recommendations structure, currency/geography) are explained inline in Design Decisions 4-5 and re-surfaced to the user in Task 12 Step 4, not left ambiguous.

**Type consistency:** `RiskAnalysis`/`StressScenario`/`RiskMetric` (Task 1) are the single source imported by every other task — no component redefines them. `RiskTier` and its four helper functions (Task 1) are the only color-decision surface; every later task imports from `colors.ts` rather than re-deriving a color. `RiskAnalysisResult`'s prop names (`displayedTimestamp`, `onRestore`, `onDelete`, `footer`) match exactly what Task 11 Step 3 passes.
