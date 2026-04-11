'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { HelpCircle, X, Sparkles } from 'lucide-react';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import type { HealthScore, CategoryScore } from '@/lib/finance/health-score';

// ─── API response shape ───────────────────────────────────────────────────────

interface HealthScoreResponse {
  success: boolean;
  data?: HealthScore;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(grade: HealthScore['grade']): string {
  if (grade === 'A' || grade === 'B') return 'text-emerald-500';
  if (grade === 'C') return 'text-amber-400';
  return 'text-red-500';
}

function gradeBadgeClass(grade: HealthScore['grade']): string {
  if (grade === 'A' || grade === 'B')
    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (grade === 'C')
    return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
  return 'bg-red-500/10 text-red-500 border-red-500/20';
}

function scoreBarColor(ratio: number): string {
  if (ratio >= 0.7) return 'bg-emerald-500';
  if (ratio >= 0.45) return 'bg-amber-400';
  return 'bg-red-500';
}

// ─── How-it-works popover ─────────────────────────────────────────────────────

const METHODOLOGY = [
  { name: 'Profitability', max: 30, desc: 'Profit margin, net income, revenue growth' },
  { name: 'Financial Strength', max: 25, desc: 'Current ratio, debt-to-equity, free cash flow' },
  { name: 'Valuation', max: 20, desc: 'P/E ratio, P/B ratio, EV/EBITDA' },
  { name: 'Growth', max: 15, desc: 'Revenue growth TTM, EPS growth TTM' },
  { name: 'Market Risk', max: 10, desc: 'Beta (volatility), short interest ratio' },
];

function MethodologyPopover({ onClose, anchorRect }: { onClose: () => void; anchorRect: DOMRect | null }) {
  if (!anchorRect || typeof document === 'undefined') return null;

  // Align right edge of popover with right edge of the ? button, drop below it
  const top = anchorRect.bottom + 8;
  const left = Math.max(8, anchorRect.right - 272);

  return createPortal(
    <div
      style={{ position: 'fixed', top, left, width: 272, zIndex: 99999 }}
      className="rounded-xl border border-border bg-card shadow-2xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">How is this score calculated?</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        We score 5 fundamental categories using live data from TwelveData. Each category contributes a weighted portion of the 100-point total.
      </p>
      <div className="space-y-2">
        {METHODOLOGY.map((m) => (
          <div key={m.name} className="flex items-start gap-2">
            <span className="text-xs font-medium text-foreground w-28 shrink-0">{m.name}</span>
            <span className="text-xs text-muted-foreground leading-relaxed">
              {m.desc} <span className="text-muted-foreground/50">({m.max} pts)</span>
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-border/40 pt-2 space-y-1">
        <p className="text-[10px] text-muted-foreground/70 font-medium uppercase tracking-wide">Grade thresholds</p>
        {[
          { grade: 'A', range: '85–100', label: 'Strong' },
          { grade: 'B', range: '70–84', label: 'Good' },
          { grade: 'C', range: '55–69', label: 'Fair' },
          { grade: 'D', range: '40–54', label: 'Weak' },
          { grade: 'F', range: '0–39', label: 'At Risk' },
        ].map(({ grade, range, label }) => (
          <div key={grade} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-4 font-semibold text-foreground">{grade}</span>
            <span>{range}</span>
            <span className="text-muted-foreground/50">—</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
        This score is educational and does not constitute investment advice.
      </p>
    </div>,
    document.body
  );
}

// ─── Category bar ─────────────────────────────────────────────────────────────

function CategoryBar({ cat }: { cat: CategoryScore }) {
  const ratio = cat.max > 0 ? cat.score / cat.max : 0;
  const pct = Math.round(ratio * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{cat.name}</span>
        <span className="tabular-nums text-muted-foreground/60 text-[11px]">
          {cat.score}<span className="text-muted-foreground/30">/{cat.max}</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', scoreBarColor(ratio))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Circular score gauge ─────────────────────────────────────────────────────

function ScoreGauge({ score, grade }: { score: number; grade: HealthScore['grade'] }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color =
    grade === 'A' || grade === 'B' ? '#10b981' :
    grade === 'C' ? '#fbbf24' : '#ef4444';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="currentColor"
          strokeWidth="5" className="text-muted/50" />
        <circle cx="44" cy="44" r={radius} fill="none" stroke={color}
          strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-xl font-bold tabular-nums leading-none', gradeColor(grade))}>
          {score}
        </span>
        <span className={cn('text-[11px] font-semibold mt-0.5 tabular-nums', gradeColor(grade))}>
          {grade}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface HealthScoreCardProps {
  ticker: string;
  onSignalsReady?: (signals: HealthScore['metricSignals']) => void;
}

function buildExplainQuery(ticker: string, hs: HealthScore): string {
  const catLines = hs.categories
    .map((c) => `  ${c.name}: ${c.score}/${c.max}`)
    .join('\n');

  // [display:...] is stripped in BullpenChat before rendering — the full prompt still reaches the AI
  return `[display:Explain ${ticker} Financial Health Score]\nYou are a financial analyst inside Bullpen. Generate a structured Financial Health explanation using the framework below.

## Input Data
Company: ${ticker}
Overall Score: ${hs.score}/100
Grade: ${hs.grade} (${hs.label})
Category Scores:
${catLines}

## Output Format (follow exactly)

**${ticker} — Financial Health: ${hs.score}/100 (${hs.grade})**

**Bottom Line**
2 sentences max. First: overall quality. Second: key tension (e.g. strong company but expensive).

**What's Driving the Score**

Strengths (score ≥80% of max only):
- [Category] — [score/max]: one sharp sentence on why

Weaknesses (score ≤40% of max only):
- [Category] — [score/max]: one sharp sentence on why

Risk Profile:
- Market Risk interpretation (always include)

**How to Interpret This**
2–4 bullets. Focus on interactions between metrics. Highlight tensions, not definitions.

**Investor Takeaway**
- Best suited for: [investor type]
- Watch: [key variable]
- Key risk: [one risk]

## Rules
- Max ~220 words total
- No filler, no definitions, no repeated sentence structure
- Every sentence must add new information
- Adapt tone: high growth + high valuation → expectations risk; strong balance sheet → resilience; weak profitability → question business quality
- Do NOT explain what metrics measure — assume the reader is smart`;
}

export function HealthScoreCard({ ticker, onSignalsReady }: HealthScoreCardProps) {
  const { isSimplified } = useExperienceLevel();
  const { open: openAIPanel } = useAIPanel();
  const [showMethodology, setShowMethodology] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading } = useQuery<HealthScoreResponse>({
    queryKey: ['health-score', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/health-score`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 60 * 60 * 1000,
  });

  // Emit signals to parent after render — avoids "setState during render" warning
  useEffect(() => {
    if (data?.success && data.data?.metricSignals) {
      onSignalsReady?.(data.data.metricSignals);
    }
  }, [data, onSignalsReady]);

  // Close popover on outside click
  useEffect(() => {
    if (!showMethodology) return;
    const handler = (e: MouseEvent) => {
      if (helpButtonRef.current?.contains(e.target as Node)) return;
      setShowMethodology(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMethodology]);

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-36" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <Skeleton className="h-[88px] w-[88px] rounded-full shrink-0" />
            <div className="flex-1 space-y-3 pt-1">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.success || !data.data) return null;

  const hs = data.data;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold">Financial Health</CardTitle>
            {/* ? button — explains methodology */}
            <button
              ref={helpButtonRef}
              onClick={() => {
                const rect = helpButtonRef.current?.getBoundingClientRect() ?? null;
                setAnchorRect(rect);
                setShowMethodology((v) => !v);
              }}
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              aria-label="How is this score calculated?"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Rendered outside card via fixed positioning so it's never clipped */}
          {showMethodology && (
            <MethodologyPopover
              onClose={() => setShowMethodology(false)}
              anchorRect={anchorRect}
            />
          )}
          <span className={cn(
            'text-xs font-semibold px-2.5 py-0.5 rounded-full border',
            gradeBadgeClass(hs.grade)
          )}>
            {hs.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Score gauge + category breakdown */}
        <div className="flex gap-5 items-start">
          {/* Circular gauge */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <ScoreGauge score={hs.score} grade={hs.grade} />
            <span className="text-[10px] text-muted-foreground/50 tracking-wide uppercase">out of 100</span>
          </div>

          {/* Pro mode: category progress bars */}
          {!isSimplified && (
            <div className="flex-1 space-y-2.5 pt-1 min-w-0">
              {hs.categories.map((cat) => (
                <CategoryBar key={cat.name} cat={cat} />
              ))}
            </div>
          )}

          {/* Simplified mode: compact signal list */}
          {isSimplified && (
            <div className="flex-1 pt-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {hs.categories.map((cat) => {
                  const ratio = cat.score / cat.max;
                  const sig = ratio >= 0.7 ? 'positive' : ratio >= 0.45 ? 'neutral' : 'negative';
                  return (
                    <div key={cat.name} className="flex items-center gap-2">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', {
                        'bg-emerald-500': sig === 'positive',
                        'bg-amber-400':   sig === 'neutral',
                        'bg-red-500':     sig === 'negative',
                      })} />
                      <span className="text-xs text-muted-foreground truncate">{cat.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Summary + Explain button */}
        <div className="border-t border-border/40 pt-3 flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground leading-relaxed flex-1">
            {hs.summary}
          </p>
          <button
            onClick={() => openAIPanel({ query: buildExplainQuery(ticker, hs) })}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            Explain
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
