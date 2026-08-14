'use client';

import { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShieldAlert, RefreshCw, AlertTriangle, Info, CheckCircle2,
  Crown, Trash2, Clock, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/use-auth';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
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

// ─── Section label (terminal-style ALL CAPS micro-typography) ─────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 select-none font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
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

function ScoreRing({ score, animated }: { score: number; animated: boolean }) {
  const [displayed, setDisplayed] = useState(0);
  // Lazy init (client-only) so we can skip the count-up under reduced-motion
  // without a synchronous setState inside the effect.
  const [reduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    if (!animated || reduced) return;
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
  }, [score, animated, reduced]);

  const d = animated && !reduced ? displayed : score;
  const color = riskColor(score);

  return (
    <div className="relative shrink-0">
      <svg viewBox="0 0 120 120" width={126} height={126} role="img" aria-label={`Overall risk score ${score} out of 100`}>
        <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="11" className="text-muted/30" />
        {d > 0 && (
          <path d={arcPath(60, 60, 46, 0, (d / 100) * 360)} fill="none"
            stroke={color} strokeWidth="11" strokeLinecap="round" />
        )}
        <text x="60" y="59" textAnchor="middle" className="fill-foreground" fontSize="27" fontWeight="800" fontFamily="monospace">{d}</text>
        <text x="60" y="75" textAnchor="middle" fontSize="10" className="fill-muted-foreground/50">/ 100</text>
      </svg>
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
        className="group w-full cursor-pointer space-y-2 p-3 text-left transition-colors hover:bg-muted/[0.05]"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.1em] text-muted-foreground/85 leading-none">{label}</span>
          <div className="flex items-center gap-1.5">
            <span className={cn('text-base font-black tabular-nums leading-none', metricBarColor(metric.score).replace('bg-', 'text-'))}>{metric.score}</span>
            {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground/80" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/80 group-hover:text-muted-foreground/85" />}
          </div>
        </div>
        <div className="h-1 w-full rounded-full bg-muted/50 overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-700 ease-out', metricBarColor(metric.score))}
            style={{ width: `${barW}%` }} />
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0">
          <p className="text-[12px] text-muted-foreground leading-relaxed border-t border-border/20 pt-2.5">
            {metric.detail}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Stress scenarios (stacked cards) ─────────────────────────────────────────
// The AI returns a full descriptive paragraph in `estimatedImpact`, so these wrap
// as readable prose — never a no-wrap table cell (which overflowed the card).

function severityStripe(severity: string): string {
  switch (severity) {
    case 'high':   return 'bg-red-500';
    case 'medium': return 'bg-amber-500';
    default:       return 'bg-blue-500';
  }
}

function severityFigureText(severity: string): string {
  switch (severity) {
    case 'high':   return 'text-red-400';
    case 'medium': return 'text-amber-400';
    default:       return 'text-blue-400';
  }
}

// Pull a leading drawdown figure ("-30% to -45%") out of the impact text so it
// reads as a scannable stat; the remainder becomes the description.
function splitImpact(impact: string): { figure: string | null; rest: string } {
  const m = impact.match(
    /^\s*-?\d+(?:\.\d+)?%\s*(?:to|–|—|-)\s*-?\d+(?:\.\d+)?%|^\s*[-−]?\d+(?:\.\d+)?%/i
  );
  if (!m) return { figure: null, rest: impact.trim() };
  const figure = m[0].trim();
  const rest = impact.slice(m[0].length).replace(/^[\s.,—–-]+/, '').trim();
  return { figure, rest };
}

function StressScenarioList({ scenarios }: { scenarios: StressScenario[] }) {
  return (
    <div className="space-y-2.5">
      {scenarios.map((s, i) => {
        const { figure, rest } = splitImpact(s.estimatedImpact);
        return (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl border border-border/40 bg-muted/[0.04] py-3.5 pl-5 pr-4"
          >
            <span className={cn('absolute inset-y-0 left-0 w-1', severityStripe(s.severity))} aria-hidden />
            <div className="mb-2 flex items-start justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">{s.scenario}</span>
              <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', severityChip(s.severity))}>
                {s.severity}
              </span>
            </div>
            {figure && (
              <div className={cn('mb-1.5 font-mono text-lg font-bold leading-none tabular-nums', severityFigureText(s.severity))}>
                {figure}
              </div>
            )}
            <p className="text-[13px] leading-relaxed text-muted-foreground">{rest || s.estimatedImpact}</p>
          </div>
        );
      })}
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
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Clock className="h-2.5 w-2.5 text-muted-foreground/80" />
        <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground/80">Saved analyses</span>
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
              <span className="text-[10px] text-muted-foreground/80">{item.riskLevel}</span>
              <span className="text-[9px] text-muted-foreground/80 tabular-nums">{formatAgo(item.createdAt)}</span>
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="px-1.5 py-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition-all"
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3 text-muted-foreground/85 hover:text-red-400" />
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
  const { open: openAIPanel } = useAIPanel();
  const haloGradientId = useId();

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
  const [errorMessage, setErrorMessage] = useState('');
  const [animated, setAnimated] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sequential loading (Phase 1: symbol tick-off) — purely decorative; the
  // underlying Claude call is a single non-streaming request with no real
  // granular progress to report, same as the server's single 'analyzing' phase.
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
    // Reduced-motion: reveal the summary immediately, no typewriter.
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayedSummary(analysis.portfolioSummary);
      return;
    }
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
  const { data: historyData } = useQuery<{ analyses: SavedRiskAnalysis[] }>({
    queryKey: HISTORY_KEY,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
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

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollStatus = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/holdings/risk-analysis?id=${id}`);
        const data: StatusResponse = await res.json();
        if (!data.success) return;

        if (data.status === 'done' && data.analysis) {
          stopPolling();
          setAnalysis(data.analysis);
          setRestoredFrom(null);
          setState('loaded');
          requestAnimationFrame(() => setTimeout(() => setAnimated(true), 50));
          queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
        } else if (data.status === 'error') {
          stopPolling();
          setErrorMessage(data.errorMessage || 'Something went wrong analyzing your portfolio.');
          setState('error');
        }
        // status === 'pending': keep polling, nothing to update — the analysis
        // is a single non-streaming call so there's no finer-grained phase.
      } catch {
        // Transient network hiccup — keep polling, the next tick will retry.
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, queryClient]);

  // On mount: resume polling if an analysis was started and the user left
  // mid-run and came back (or just reloaded the page).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/holdings/risk-analysis');
        const data = await res.json();
        if (cancelled || !data?.success || !data.pendingId) return;
        setState('loading');
        pollStatus(data.pendingId);
      } catch { /* stay idle */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyze() {
    stopPolling();
    setState('loading');
    setErrorMessage('');
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || `Request failed: ${res.status}`);
        setState('error');
        return;
      }
      const data = await res.json();
      if (!data.id) throw new Error('Failed to start analysis');
      pollStatus(data.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to analyze portfolio');
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
            <div className="space-y-6 py-2">
              <EmptyState
                pose="thinking"
                title="AI-Powered Risk Assessment"
                description={`Concentration, sector exposure, correlation, liquidity, and stress scenarios across your ${holdings.length} holding${holdings.length !== 1 ? 's' : ''}.`}
                imageSize={112}
                className="py-2"
              >
                <div className="flex justify-center">
                  <Button
                    onClick={analyze}
                    size="sm"
                    className="gap-1.5 bg-white text-black hover:bg-neutral-50 border border-black/85 animate-ai-signal-halo"
                  >
                    <svg className="ai-halo-svg" style={{ width: 'calc(100% + 8px)', height: 'calc(100% + 8px)' }} aria-hidden="true">
                      <defs>
                        <linearGradient id={haloGradientId} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" className="ai-halo-stop-fade" />
                          <stop offset="50%" className="ai-halo-stop-peak" />
                          <stop offset="100%" className="ai-halo-stop-fade" />
                        </linearGradient>
                      </defs>
                      <rect x="0" y="0" width="100%" height="100%" rx="11" stroke={`url(#${haloGradientId})`} />
                    </svg>
                    <ShieldAlert className="h-3.5 w-3.5 ai-halo-icon" /> Run Analysis
                  </Button>
                </div>
              </EmptyState>

              {history.length > 0 && (
                <div className="border-t border-border/20 pt-4">
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
                <p className="text-[11px] text-muted-foreground/85">Running 6-dimension risk assessment</p>
              </div>
              <div className="max-w-[190px] mx-auto space-y-1.5 font-mono text-[11px]">
                {holdings.slice(0, Math.min(loadingStep, holdings.length)).map((h) => (
                  <div key={h.symbol} className="flex items-center gap-2 text-muted-foreground/85">
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
                  <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse shrink-0" />
                    {ANALYZE_STAGES[analyzeStep]}
                  </p>
                  <div className="flex items-end gap-1" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30 motion-safe:animate-bounce"
                        style={{ animationDelay: `${i * 0.18}s`, animationDuration: '0.9s' }} />
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/85 text-center max-w-xs mx-auto leading-relaxed">
                Typically 15–30 seconds. Feel free to leave this page. We&apos;ll notify you when it&apos;s ready.
              </p>
            </div>
          )}

          {/* ── Error ───────────────────────────────────────────────────────── */}
          {state === 'error' && (
            <div className="flex flex-col items-center py-7 gap-3 text-center">
              <AlertTriangle className="h-7 w-7 text-destructive/80" />
              <p className="text-sm text-destructive/90">{errorMessage || 'Something went wrong analyzing your portfolio.'}</p>
              <Button variant="outline" size="sm" onClick={analyze} className="gap-1.5 animate-ai-sweep">
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

              {/* Hero — score ring + level + meter + summary */}
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
                <ScoreRing score={analysis.overallRiskScore} animated={animated} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={cn('text-2xl font-bold tracking-tight', riskTextClass(analysis.riskLevel))}>
                      {analysis.riskLevel} Risk
                    </span>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/85">
                      Overall assessment
                    </span>
                  </div>
                  <div className="h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-muted/40">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${analysis.overallRiskScore}%`, backgroundColor: riskColor(analysis.overallRiskScore) }} />
                  </div>
                  <p className="max-w-prose text-sm leading-relaxed text-foreground/85">
                    {displayedSummary}
                    {!summaryDone && (
                      <span className="ml-0.5 inline-block h-[1.05em] w-[2px] align-middle bg-primary/60 motion-safe:animate-pulse" />
                    )}
                  </p>
                </div>
              </div>

              {/* Risk Dimensions */}
              <div>
                <SectionLabel>Risk Dimensions</SectionLabel>
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
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
              </div>

              {/* Stress Scenarios — full width, wrapping cards */}
              {analysis.stressScenarios?.length > 0 && (
                <div>
                  <SectionLabel>Stress Scenarios</SectionLabel>
                  <StressScenarioList scenarios={analysis.stressScenarios} />
                </div>
              )}

              {/* Sector Breakdown — full width */}
              {analysis.sectorBreakdown?.length > 0 && (
                <div>
                  <SectionLabel>Sector Breakdown</SectionLabel>
                  <div className="space-y-3">
                    {[...analysis.sectorBreakdown]
                      .sort((a, b) => b.estimatedWeight - a.estimatedWeight)
                      .map((s) => (
                        <div key={s.sector}>
                          <div className="mb-1.5 flex items-baseline justify-between gap-3">
                            <span className="truncate text-[13px] text-foreground/85">{s.sector}</span>
                            <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{s.estimatedWeight.toFixed(0)}%</span>
                          </div>
                          <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                            <div className="h-full rounded-full bg-primary/50 transition-all duration-700"
                              style={{ width: `${Math.min(s.estimatedWeight, 100)}%` }} />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {s.symbols.map((sym) => (
                              <span key={sym} className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/80">
                                {sym}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

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
                          <Icon className="h-4 w-4 shrink-0 mt-0.5 opacity-70 text-current" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-[13px] font-bold text-foreground">{risk.factor}</span>
                              <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded', severityChip(risk.severity))}>
                                {risk.severity}
                              </span>
                            </div>
                            <p className="text-[12.5px] text-muted-foreground leading-relaxed">{risk.description}</p>
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
                      <li key={i} className="flex gap-3 items-start">
                        <span className="text-[11px] font-mono font-bold text-primary/70 shrink-0 mt-[3px] tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                        <p className="text-[13px] text-muted-foreground leading-relaxed">{rec}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/15">
                <span className="text-[9px] font-mono text-muted-foreground/80 uppercase tracking-[0.15em] select-none">
                  {restoredFrom ? `Restored · ${generatedTime}` : `Generated · ${generatedTime}`}
                </span>
                <button
                  onClick={() => openAIPanel({
                    query: buildAskBullQuery(analysis, holdings),
                    context: { tickers: holdings.map((h) => h.symbol), label: 'Your portfolio' },
                  })}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  Ask Bull about this
                </button>
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
