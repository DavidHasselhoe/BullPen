'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShieldAlert, RefreshCw, AlertTriangle, Info, CheckCircle2,
  Crown, Trash2, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { useAuth } from '@/hooks/use-auth';
import type { QuotaState } from '@/lib/billing/quotas';
import type { HoldingWithPrice } from './types';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiskMetric {
  score: number;
  label: string;
  detail: string;
}

interface StressScenario {
  scenario: string;
  estimatedImpact: string;
  severity: 'low' | 'medium' | 'high';
}

interface RiskAnalysis {
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

interface PortfolioRiskAnalysisProps {
  holdings: HoldingWithPrice[];
}

// ─── Color & style helpers ─────────────────────────────────────────────────────

function riskColor(score: number): string {
  if (score <= 33) return '#22c55e';
  if (score <= 60) return '#f59e0b';
  if (score <= 79) return '#f97316';
  return '#ef4444';
}

function riskTextClass(level: string) {
  switch (level) {
    case 'Low':      return 'text-green-500';
    case 'Moderate': return 'text-emerald-400';
    case 'Elevated': return 'text-amber-400';
    case 'High':     return 'text-orange-400';
    case 'Very High':return 'text-red-500';
    default:         return 'text-foreground';
  }
}

function riskBgBorder(level: string) {
  switch (level) {
    case 'Low':       return 'bg-green-500/[0.06] border-green-500/25';
    case 'Moderate':  return 'bg-emerald-500/[0.06] border-emerald-500/25';
    case 'Elevated':  return 'bg-amber-500/[0.06] border-amber-500/25';
    case 'High':      return 'bg-orange-500/[0.06] border-orange-500/25';
    case 'Very High': return 'bg-red-500/[0.06] border-red-500/25';
    default:          return 'bg-muted/10 border-border/30';
  }
}

function severityChip(severity: string) {
  switch (severity) {
    case 'critical': return 'bg-red-500/15 text-red-400 border border-red-500/25';
    case 'high':     return 'bg-orange-500/15 text-orange-400 border border-orange-500/25';
    case 'medium':   return 'bg-amber-500/15 text-amber-400 border border-amber-500/25';
    default:         return 'bg-blue-500/15 text-blue-400 border border-blue-500/25';
  }
}

function metricBarColor(score: number): string {
  if (score >= 70) return 'bg-red-500';
  if (score >= 50) return 'bg-orange-500';
  if (score >= 30) return 'bg-amber-500';
  return 'bg-green-500';
}

// ─── Section label (terminal-style ALL CAPS micro-typography) ─────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-muted-foreground/45 mb-3 select-none">
      {children}
    </p>
  );
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const clamp = Math.min(endDeg, startDeg + 359.99);
  const x1 = cx + r * Math.cos(toRad(startDeg - 90));
  const y1 = cy + r * Math.sin(toRad(startDeg - 90));
  const x2 = cx + r * Math.cos(toRad(clamp - 90));
  const y2 = cy + r * Math.sin(toRad(clamp - 90));
  const large = clamp - startDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function ScoreRing({ score, riskLevel, animated }: { score: number; riskLevel: string; animated: boolean }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    if (!animated) return;
    let frame: number;
    let start: number | null = null;
    const duration = 900;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setDisplayed(Math.round(ease(p) * score));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, animated]);

  const d = animated ? displayed : score;
  const color = riskColor(score);

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div className="relative">
        <svg viewBox="0 0 120 120" width={108} height={108}>
          <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="12" className="text-muted/30" />
          {d > 0 && (
            <path d={arcPath(60, 60, 46, 0, (d / 100) * 360)} fill="none"
              stroke={color} strokeWidth="12" strokeLinecap="round" />
          )}
          <text x="60" y="56" textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="800" fontFamily="monospace">{d}</text>
          <text x="60" y="70" textAnchor="middle" fontSize="9" fill="currentColor" className="fill-muted-foreground/50">/100</text>
        </svg>
      </div>
      <span className={cn('text-xs font-bold tracking-tight', riskTextClass(riskLevel))}>
        {riskLevel} Risk
      </span>
    </div>
  );
}

// ─── Metric cell ──────────────────────────────────────────────────────────────

function MetricCell({ label, metric, expanded, onToggle }: {
  label: string;
  metric: RiskMetric;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [barW, setBarW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBarW(metric.score), 150);
    return () => clearTimeout(t);
  }, [metric.score]);

  return (
    <div className="rounded-lg border border-border/30 bg-muted/[0.06] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-3 space-y-2 group"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-muted-foreground/60 leading-none">{label}</span>
          <div className="flex items-center gap-1.5">
            <span className={cn('text-base font-black tabular-nums leading-none', metricBarColor(metric.score).replace('bg-', 'text-'))}>{metric.score}</span>
            {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground/40" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/50" />}
          </div>
        </div>
        <div className="h-1 w-full rounded-full bg-muted/50 overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-700 ease-out', metricBarColor(metric.score))}
            style={{ width: `${barW}%` }} />
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0">
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed border-t border-border/20 pt-2.5">
            {metric.detail}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Stress scenarios compact table ───────────────────────────────────────────

function StressTable({ scenarios }: { scenarios: StressScenario[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="w-full">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground/40 pb-2.5 font-normal w-1/2">Scenario</th>
            <th className="text-right text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground/40 pb-2.5 font-normal pr-3">Est. Impact</th>
            <th className="text-right text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground/40 pb-2.5 font-normal">Sev.</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s, i) => {
            const isExpanded = expanded === i;
            return (
              <>
                <tr
                  key={i}
                  onClick={() => setExpanded(isExpanded ? null : i)}
                  className="border-t border-border/20 cursor-pointer hover:bg-muted/20 transition-colors"
                >
                  <td className="py-2.5 pr-3">
                    <span className={cn('text-foreground/80 leading-tight line-clamp-1', isExpanded && 'line-clamp-none')}>{s.scenario}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums font-mono text-foreground/90 whitespace-nowrap text-[11px]">
                    {s.estimatedImpact}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full', severityChip(s.severity))}>
                      {s.severity}
                    </span>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${i}-detail`} className="border-t-0">
                    <td colSpan={3} className="pb-3 pt-0 pr-2">
                      <p className="text-[11px] text-muted-foreground/70 leading-relaxed pl-0">
                        {s.estimatedImpact} — {s.scenario.toLowerCase()}
                      </p>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────

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

function HistoryPanel({
  items,
  onRestore,
  onDelete,
}: {
  items: SavedRiskAnalysis[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="border-b border-border/20 pb-3 mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Clock className="h-2.5 w-2.5 text-muted-foreground/40" />
        <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground/40">Saved analyses</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <div key={item.id} className="group flex items-center gap-0 rounded border border-border/30 bg-muted/20 overflow-hidden">
            <button
              onClick={() => onRestore(item.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <span className={cn('text-[10px] font-bold', riskTextClass(item.riskLevel))}>
                {item.overallRiskScore}
              </span>
              <span className="text-[10px] text-muted-foreground/60">{item.riskLevel}</span>
              <span className="text-[9px] text-muted-foreground/35 tabular-nums">{formatAgo(item.createdAt)}</span>
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="px-1.5 py-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition-all"
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3 text-muted-foreground/50 hover:text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type State = 'idle' | 'loading' | 'loaded' | 'error';

export function PortfolioRiskAnalysis({ holdings }: PortfolioRiskAnalysisProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Derive user's display currency from settings
  const userCurrency = useMemo((): string => {
    const s = (user?.settings as Record<string, unknown>) ?? {};
    const c = s.default_currency as string | undefined;
    if (!c || c === 'exchange') return 'USD';
    return c.toUpperCase();
  }, [user]);

  const [state, setState] = useState<State>('idle');
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [restoredFrom, setRestoredFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);

  // Sequential loading (Phase 1: symbol tick-off)
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyzeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [analyzeStep, setAnalyzeStep] = useState(0);

  // Typewriter reveal for summary
  const [displayedSummary, setDisplayedSummary] = useState('');
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Expanded metric cells
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const ANALYZE_STAGES = useMemo(() => [
    'Calculating concentration risk…',
    'Assessing sector diversification…',
    'Modelling stress scenarios…',
    'Computing correlation exposure…',
    'Evaluating liquidity risk…',
    'Generating recommendations…',
    'Synthesizing findings…',
  ], []);

  const payload = useMemo(
    () => holdings.map((h) => ({
      symbol: h.symbol,
      company_name: h.company_name,
      allocation: h.allocation,
      marketValue: h.marketValue,
      quantity: h.quantity,
      dayChangePercent: h.dayChangePercent,
      unrealizedPLPercent: h.unrealizedPLPercent,
    })),
    [holdings]
  );

  // Phase 1: tick off symbols
  useEffect(() => {
    if (state === 'loading') {
      setLoadingStep(0);
      setAnalyzeStep(0);
      loadingTimerRef.current = setInterval(() => setLoadingStep((s) => s + 1), 220);
    } else {
      if (loadingTimerRef.current) { clearInterval(loadingTimerRef.current); loadingTimerRef.current = null; }
      if (analyzeTimerRef.current) { clearInterval(analyzeTimerRef.current); analyzeTimerRef.current = null; }
    }
    return () => {
      if (loadingTimerRef.current) clearInterval(loadingTimerRef.current);
      if (analyzeTimerRef.current) clearInterval(analyzeTimerRef.current);
    };
  }, [state]);

  const allSymbolsLoaded = loadingStep >= holdings.length;
  useEffect(() => {
    if (state !== 'loading' || !allSymbolsLoaded) return;
    analyzeTimerRef.current = setInterval(
      () => setAnalyzeStep((s) => (s + 1) % ANALYZE_STAGES.length),
      2200
    );
    return () => { if (analyzeTimerRef.current) clearInterval(analyzeTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, allSymbolsLoaded]);

  // Typewriter reveal
  useEffect(() => {
    if (state !== 'loaded' || !analysis) return;
    setDisplayedSummary('');
    let i = 0;
    const full = analysis.portfolioSummary;
    typewriterRef.current = setInterval(() => {
      i++;
      setDisplayedSummary(full.slice(0, i));
      if (i >= full.length) { clearInterval(typewriterRef.current!); typewriterRef.current = null; }
    }, 14);
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current); };
  }, [state, analysis]);

  // Saved analyses history
  const historyKey = ['risk-analysis-history'];
  const { data: historyData } = useQuery<{ analyses: SavedRiskAnalysis[] }>({
    queryKey: historyKey,
    queryFn: () => fetch('/api/holdings/risk-analysis/history').then((r) => r.json()),
    staleTime: 30_000,
  });
  const history = historyData?.analyses ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/holdings/risk-analysis/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: historyKey }),
  });

  const restoreAnalysis = useCallback(async (id: string) => {
    const res = await fetch(`/api/holdings/risk-analysis/history?id=${id}`);
    const data = await res.json();
    if (data?.analysis) {
      setAnalysis(data.analysis as RiskAnalysis);
      setRestoredFrom(data.createdAt);
      setDisplayedSummary((data.analysis as RiskAnalysis).portfolioSummary);
      setState('loaded');
      requestAnimationFrame(() => setTimeout(() => setAnimated(true), 50));
    }
  }, []);

  async function analyze() {
    setState('loading');
    setError(null);
    setAnimated(false);
    setDisplayedSummary('');
    setRestoredFrom(null);
    setExpandedMetric(null);
    try {
      const res = await fetch('/api/holdings/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: payload, currency: userCurrency }),
      });
      if (res.status === 402) {
        const data = await res.json();
        setPaywallQuota(data.quota ?? null);
        setShowPaywall(true);
        setState('idle');
        return;
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Analysis failed');
      setAnalysis(data.analysis);
      setState('loaded');
      requestAnimationFrame(() => setTimeout(() => setAnimated(true), 50));
      queryClient.invalidateQueries({ queryKey: historyKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze portfolio');
      setState('error');
    }
  }

  const generatedTime = (restoredFrom ?? analysis?.generatedAt)
    ? new Date(restoredFrom ?? analysis!.generatedAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const summaryDone = analysis ? displayedSummary.length >= analysis.portfolioSummary.length : false;

  const METRIC_LABELS: Record<string, string> = {
    concentration: 'Concentration',
    sectorDiversification: 'Sector Divers.',
    marketCapBias: 'Mkt Cap Bias',
    volatilityExposure: 'Volatility',
    correlationRisk: 'Correlation',
    liquidityRisk: 'Liquidity',
  };

  return (
    <>
      <Card className="border-border/40 bg-card">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <CardHeader className="pb-3 border-b border-border/20">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Portfolio Risk Analysis
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full">
                <Crown className="h-2 w-2" /> Pro
              </span>
            </CardTitle>
            {state === 'idle' && (
              <Button size="sm" onClick={analyze} className="shrink-0 gap-1.5 h-7 text-xs">
                <ShieldAlert className="h-3 w-3" /> Analyze
              </Button>
            )}
            {state === 'loaded' && (
              <Button size="sm" variant="ghost" onClick={analyze}
                className="shrink-0 gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground">
                <RefreshCw className="h-3 w-3" /> Re-analyze
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {/* ── Idle ───────────────────────────────────────────────────────── */}
          {state === 'idle' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <div className="rounded-full bg-primary/8 p-3.5">
                <ShieldAlert className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">AI-Powered Risk Assessment</p>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                Concentration, sector exposure, correlation, liquidity, and stress scenarios across your {holdings.length} holding{holdings.length !== 1 ? 's' : ''}.
              </p>
              <Button onClick={analyze} size="sm" className="mt-1 gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Run Analysis
              </Button>
              {history.length > 0 && (
                <div className="w-full max-w-sm mt-2">
                  <HistoryPanel items={history} onRestore={restoreAnalysis} onDelete={(id) => deleteMutation.mutate(id)} />
                </div>
              )}
            </div>
          )}

          {/* ── Loading ─────────────────────────────────────────────────────── */}
          {state === 'loading' && (
            <div className="py-7 space-y-4">
              <div className="text-center space-y-0.5">
                <p className="text-sm font-medium text-foreground">Analyzing portfolio…</p>
                <p className="text-[11px] text-muted-foreground/50">Running 6-dimension risk assessment</p>
              </div>
              <div className="max-w-[190px] mx-auto space-y-1.5 font-mono text-[11px]">
                {holdings.slice(0, Math.min(loadingStep, holdings.length)).map((h) => (
                  <div key={h.symbol} className="flex items-center gap-2 text-muted-foreground/70">
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    <span className="tabular-nums">{h.symbol}</span>
                  </div>
                ))}
                {loadingStep < holdings.length && (
                  <div className="flex items-center gap-2 text-foreground/40">
                    <span className="h-3 w-3 rounded-full border border-muted-foreground/30 shrink-0 motion-safe:animate-pulse" />
                    <span className="tabular-nums">{holdings[loadingStep]?.symbol}</span>
                  </div>
                )}
              </div>
              {allSymbolsLoaded && (
                <div className="flex flex-col items-center gap-2.5 pt-1">
                  <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse shrink-0" />
                    {ANALYZE_STAGES[analyzeStep]}
                  </p>
                  <div className="flex items-end gap-1" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30 motion-safe:animate-bounce"
                        style={{ animationDelay: `${i * 0.18}s`, animationDuration: '0.9s' }} />
                    ))}
                  </div>
                  <p className="text-[9px] text-muted-foreground/35 text-center">Typically 15–30 seconds</p>
                </div>
              )}
            </div>
          )}

          {/* ── Error ───────────────────────────────────────────────────────── */}
          {state === 'error' && (
            <div className="flex flex-col items-center py-7 gap-3 text-center">
              <AlertTriangle className="h-7 w-7 text-destructive/80" />
              <p className="text-sm text-destructive/90">{error}</p>
              <Button variant="outline" size="sm" onClick={analyze} className="gap-1.5">
                <RefreshCw className="h-3 w-3" /> Try Again
              </Button>
            </div>
          )}

          {/* ── Results ─────────────────────────────────────────────────────── */}
          {state === 'loaded' && analysis && (
            <div className="space-y-6">

              {/* History chips */}
              {history.length > 0 && (
                <HistoryPanel items={history} onRestore={restoreAnalysis} onDelete={(id) => deleteMutation.mutate(id)} />
              )}

              {/* Risk level band */}
              <div className={cn('rounded-lg border px-4 py-2.5 flex items-center justify-between', riskBgBorder(analysis.riskLevel))}>
                <span className="text-[9px] font-mono font-bold uppercase tracking-[0.28em] text-muted-foreground/50">
                  Overall Risk Level
                </span>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-32 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${analysis.overallRiskScore}%`, backgroundColor: riskColor(analysis.overallRiskScore) }} />
                  </div>
                  <span className={cn('text-sm font-black tabular-nums', riskTextClass(analysis.riskLevel))}>
                    {analysis.riskLevel}
                  </span>
                </div>
              </div>

              {/* Score ring + summary */}
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <ScoreRing score={analysis.overallRiskScore} riskLevel={analysis.riskLevel} animated={animated} />
                <div className="flex-1 min-w-0">
                  <SectionLabel>Summary</SectionLabel>
                  <p className="text-[13px] text-foreground/85 leading-relaxed">
                    {displayedSummary}
                    {!summaryDone && (
                      <span className="inline-block w-[2px] h-[1.1em] bg-primary/60 ml-0.5 motion-safe:animate-pulse align-middle" />
                    )}
                  </p>
                </div>
              </div>

              {/* Risk Dimensions — 2×3 grid, click to expand detail */}
              <div>
                <SectionLabel>Risk Dimensions</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(analysis.metrics) as [string, RiskMetric][]).map(([key, metric]) => (
                    <MetricCell
                      key={key}
                      label={METRIC_LABELS[key] ?? key}
                      metric={metric}
                      expanded={expandedMetric === key}
                      onToggle={() => setExpandedMetric(expandedMetric === key ? null : key)}
                    />
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground/35 mt-2 text-center">Click a metric to expand detail</p>
              </div>

              {/* Stress scenarios + Sector side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <SectionLabel>Stress Scenarios</SectionLabel>
                  {analysis.stressScenarios?.length > 0 && (
                    <StressTable scenarios={analysis.stressScenarios} />
                  )}
                </div>

                <div>
                  <SectionLabel>Sector Breakdown</SectionLabel>
                  {analysis.sectorBreakdown?.length > 0 && (
                    <div className="space-y-2.5">
                      {[...analysis.sectorBreakdown]
                        .sort((a, b) => b.estimatedWeight - a.estimatedWeight)
                        .map((s) => (
                          <div key={s.sector}>
                            <div className="flex items-baseline justify-between mb-1 gap-2">
                              <span className="text-xs text-foreground/80 truncate">{s.sector}</span>
                              <span className="text-xs font-bold tabular-nums text-foreground shrink-0">{s.estimatedWeight.toFixed(0)}%</span>
                            </div>
                            <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden mb-1">
                              <div className="h-full rounded-full bg-primary/50 transition-all duration-700"
                                style={{ width: `${s.estimatedWeight}%` }} />
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {s.symbols.map((sym) => (
                                <span key={sym} className="text-[9px] font-mono bg-muted/40 text-muted-foreground/70 px-1 py-0.5 rounded">
                                  {sym}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Key Risk Factors — 2-col on lg */}
              {analysis.topRisks?.length > 0 && (
                <div>
                  <SectionLabel>Key Risk Factors</SectionLabel>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {analysis.topRisks.map((risk, i) => {
                      const Icon = risk.severity === 'medium' || risk.severity === 'low' ? Info : AlertTriangle;
                      return (
                        <div
                          key={i}
                          className={cn(
                            'rounded-lg border-l-[3px] px-3.5 py-3 flex gap-3 items-start',
                            risk.severity === 'critical' ? 'border-red-500 bg-red-500/[0.05]'
                            : risk.severity === 'high' ? 'border-orange-500 bg-orange-500/[0.05]'
                            : risk.severity === 'medium' ? 'border-amber-500 bg-amber-500/[0.05]'
                            : 'border-blue-500 bg-blue-500/[0.05]'
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-70 text-current" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-[11px] font-bold text-foreground/90">{risk.factor}</span>
                              <span className={cn('text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded', severityChip(risk.severity))}>
                                {risk.severity}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground/75 leading-relaxed">{risk.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {analysis.recommendations?.length > 0 && (
                <div>
                  <SectionLabel>Recommendations</SectionLabel>
                  <ol className="space-y-2">
                    {analysis.recommendations.map((rec, i) => (
                      <li key={i} className="flex gap-2.5 items-start">
                        <span className="text-[9px] font-mono font-bold text-primary/60 shrink-0 mt-0.5 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                        <p className="text-[12px] text-muted-foreground/85 leading-relaxed">{rec}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-border/15">
                <span className="text-[9px] font-mono text-muted-foreground/25 uppercase tracking-[0.15em] select-none">
                  {restoredFrom ? `Restored · ${generatedTime}` : `Generated · ${generatedTime}`}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AiPaywallDialog
        open={showPaywall}
        onOpenChange={setShowPaywall}
        featureName="Portfolio Risk Analysis"
        quota={paywallQuota ?? undefined}
      />
    </>
  );
}
