'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle2,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import type { QuotaState } from '@/lib/billing/quotas';
import type { HoldingWithPrice } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Color helpers ────────────────────────────────────────────────────────────

function gaugeColor(score: number): string {
  if (score <= 33) return '#22c55e';
  if (score <= 60) return '#f59e0b';
  if (score <= 79) return '#f97316';
  return '#ef4444';
}

function riskLevelColor(level: string) {
  switch (level) {
    case 'Low':      return 'text-green-600 dark:text-green-400';
    case 'Moderate': return 'text-emerald-600 dark:text-emerald-400';
    case 'Elevated': return 'text-amber-600 dark:text-amber-400';
    case 'High':     return 'text-orange-600 dark:text-orange-400';
    case 'Very High':return 'text-red-600 dark:text-red-400';
    default:         return 'text-foreground';
  }
}

function riskBandColor(level: string): string {
  switch (level) {
    case 'Low':      return 'bg-green-500/8 border-green-500/20';
    case 'Moderate': return 'bg-emerald-500/8 border-emerald-500/20';
    case 'Elevated': return 'bg-amber-500/8 border-amber-500/20';
    case 'High':     return 'bg-orange-500/8 border-orange-500/20';
    case 'Very High':return 'bg-red-500/8 border-red-500/20';
    default:         return 'bg-muted/20 border-border/40';
  }
}

function severityConfig(severity: string) {
  switch (severity) {
    case 'critical':
      return { border: 'border-red-500/60', bg: 'bg-red-500/8', badge: 'bg-red-500/15 text-red-600 dark:text-red-400', icon: AlertTriangle };
    case 'high':
      return { border: 'border-orange-500/60', bg: 'bg-orange-500/8', badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400', icon: AlertTriangle };
    case 'medium':
      return { border: 'border-amber-500/60', bg: 'bg-amber-500/8', badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icon: Info };
    default:
      return { border: 'border-blue-500/60', bg: 'bg-blue-500/8', badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', icon: Info };
  }
}

function stressSeverityChip(severity: StressScenario['severity']) {
  if (severity === 'high') return 'bg-red-500/15 text-red-600 dark:text-red-400';
  if (severity === 'medium') return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
}

// ─── Score ring (pure SVG, no d3) ────────────────────────────────────────────

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
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (!animated) return;
    let frame: number;
    let start: number | null = null;
    const duration = 900;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    const tick = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setAnimatedScore(Math.round(ease(progress) * score));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, animated]);

  const displayScore = animated ? animatedScore : score;

  const color = gaugeColor(score);
  const endDeg = (displayScore / 100) * 360;

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <div className="relative">
        <svg viewBox="0 0 160 160" width={144} height={144}>
          {/* Background track */}
          <circle cx="80" cy="80" r="61" fill="none" stroke="currentColor" strokeWidth="18" className="text-muted/40" />
          {/* Colored arc */}
          {displayScore > 0 && (
            <path
              d={arcPath(80, 80, 61, 0, endDeg)}
              fill="none"
              stroke={color}
              strokeWidth="18"
              strokeLinecap="round"
            />
          )}
          {/* Center text */}
          <text x="80" y="74" textAnchor="middle" className="fill-foreground" fontSize="28" fontWeight="900" fontFamily="monospace">
            {displayScore}
          </text>
          <text x="80" y="92" textAnchor="middle" fontSize="11" fontFamily="sans-serif" fill="currentColor" className="fill-muted-foreground/60">
            /100
          </text>
        </svg>
      </div>
      <span className={cn('text-sm font-bold tracking-tight', riskLevelColor(riskLevel))}>
        {riskLevel} Risk
      </span>
    </div>
  );
}

// ─── Metric cell ──────────────────────────────────────────────────────────────

function MetricCell({ label, metric }: { label: string; metric: RiskMetric }) {
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(metric.score), 150);
    return () => clearTimeout(t);
  }, [metric.score]);

  const barColor =
    metric.score >= 70 ? 'bg-red-500'
    : metric.score >= 50 ? 'bg-orange-500'
    : metric.score >= 30 ? 'bg-amber-500'
    : 'bg-green-500';

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 leading-tight">{label}</span>
        <span className="text-sm font-bold tabular-nums text-foreground shrink-0">{metric.score}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor)}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-3">{metric.detail}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type State = 'idle' | 'loading' | 'loaded' | 'error';

export function PortfolioRiskAnalysis({ holdings }: PortfolioRiskAnalysisProps) {
  const [state, setState] = useState<State>('idle');
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);

  // Sequential loading reveal
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Typewriter reveal for summary
  const [displayedSummary, setDisplayedSummary] = useState('');
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const payload = useMemo(
    () =>
      holdings.map((h) => ({
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

  // Start sequential loading animation
  useEffect(() => {
    if (state === 'loading') {
      setLoadingStep(0);
      loadingTimerRef.current = setInterval(() => {
        setLoadingStep((s) => s + 1);
      }, 220);
    } else {
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    }
    return () => {
      if (loadingTimerRef.current) clearInterval(loadingTimerRef.current);
    };
  }, [state]);

  // Typewriter reveal when analysis loads
  useEffect(() => {
    if (state !== 'loaded' || !analysis) return;
    setDisplayedSummary('');
    let i = 0;
    const full = analysis.portfolioSummary;
    typewriterRef.current = setInterval(() => {
      i++;
      setDisplayedSummary(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(typewriterRef.current!);
        typewriterRef.current = null;
      }
    }, 14);
    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, [state, analysis]);

  async function analyze() {
    setState('loading');
    setError(null);
    setAnimated(false);
    setDisplayedSummary('');
    try {
      const res = await fetch('/api/holdings/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: payload }),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze portfolio');
      setState('error');
    }
  }

  const generatedTime = analysis?.generatedAt
    ? new Date(analysis.generatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;

  const summaryDone = analysis ? displayedSummary.length >= analysis.portfolioSummary.length : false;

  return (
    <>
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              Portfolio Risk Analysis
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">
                <Crown className="h-2.5 w-2.5" /> Pro
              </span>
            </CardTitle>
            {state === 'idle' && (
              <Button size="sm" onClick={analyze} className="shrink-0 gap-2">
                <ShieldAlert className="h-3.5 w-3.5" />
                Analyze Risk
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* Idle state */}
          {state === 'idle' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="rounded-full bg-primary/8 p-4">
                <ShieldAlert className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">AI-Powered Risk Assessment</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Analyze concentration, sector exposure, correlation, liquidity, and stress scenarios across your {holdings.length} position{holdings.length !== 1 ? 's' : ''}.
              </p>
              <Button onClick={analyze} className="mt-1 gap-2">
                <ShieldAlert className="h-4 w-4" />
                Analyze Portfolio Risk
              </Button>
            </div>
          )}

          {/* Loading — sequential holdings reveal */}
          {state === 'loading' && (
            <div className="py-8 space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-foreground">Analyzing portfolio with Claude…</p>
                <p className="text-xs text-muted-foreground/60">Running 6-dimension risk assessment</p>
              </div>
              <div className="max-w-[200px] mx-auto space-y-1.5 font-mono text-xs">
                {holdings.slice(0, Math.min(loadingStep, holdings.length)).map((h) => (
                  <div key={h.symbol} className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-green-500 shrink-0">✓</span>
                    <span className="tabular-nums">{h.symbol}</span>
                  </div>
                ))}
                {loadingStep < holdings.length && (
                  <div className="flex items-center gap-2 text-foreground/50">
                    <span className="animate-pulse shrink-0">…</span>
                    <span className="tabular-nums">{holdings[loadingStep]?.symbol}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex flex-col items-center py-8 gap-3 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={analyze}>Try Again</Button>
            </div>
          )}

          {/* Results */}
          {state === 'loaded' && analysis && (
            <div className="space-y-6">
              {/* Risk level band */}
              <div className={cn('rounded-xl border px-4 py-3 flex items-center justify-between gap-4', riskBandColor(analysis.riskLevel))}>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
                  Overall Risk Level
                </div>
                <div className={cn('text-sm font-bold tracking-tight', riskLevelColor(analysis.riskLevel))}>
                  {analysis.riskLevel}
                </div>
              </div>

              {/* Score ring + summary */}
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="mx-auto sm:mx-0 shrink-0">
                  <ScoreRing score={analysis.overallRiskScore} riskLevel={analysis.riskLevel} animated={animated} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-2">
                    Summary
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
                    {displayedSummary}
                    {!summaryDone && (
                      <span className="inline-block w-[2px] h-[1em] bg-primary/60 ml-0.5 animate-pulse align-middle" />
                    )}
                  </p>
                </div>
              </div>

              {/* Metrics 2×3 grid */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
                  Risk Dimensions
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { key: 'concentration',         label: 'Concentration' },
                    { key: 'sectorDiversification', label: 'Sector Diversification' },
                    { key: 'marketCapBias',          label: 'Market Cap Bias' },
                    { key: 'volatilityExposure',     label: 'Volatility' },
                    { key: 'correlationRisk',        label: 'Correlation Risk' },
                    { key: 'liquidityRisk',          label: 'Liquidity Risk' },
                  ] as const).map(({ key, label }) => (
                    <MetricCell
                      key={key}
                      label={label}
                      metric={analysis.metrics[key]}
                    />
                  ))}
                </div>
              </div>

              {/* Stress scenarios */}
              {analysis.stressScenarios && analysis.stressScenarios.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
                    Stress Scenarios
                  </p>
                  <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30">
                    {analysis.stressScenarios.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm text-foreground/80 leading-snug">{s.scenario}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold tabular-nums text-foreground">{s.estimatedImpact}</span>
                          <span className={cn('text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full', stressSeverityChip(s.severity))}>
                            {s.severity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sector breakdown */}
              {analysis.sectorBreakdown && analysis.sectorBreakdown.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
                    Sector Breakdown
                  </p>
                  <div className="space-y-2">
                    {analysis.sectorBreakdown
                      .sort((a, b) => b.estimatedWeight - a.estimatedWeight)
                      .map((s) => (
                        <div key={s.sector}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-foreground/80">{s.sector}</span>
                            <span className="text-xs font-semibold text-foreground tabular-nums">{s.estimatedWeight.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-1.5">
                            <div
                              className="h-full rounded-full bg-primary/60 transition-all duration-700"
                              style={{ width: `${s.estimatedWeight}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {s.symbols.map((sym) => (
                              <span key={sym} className="text-[10px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                                {sym}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Risk factors */}
              {analysis.topRisks && analysis.topRisks.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
                    Key Risk Factors
                  </p>
                  <div className="space-y-2">
                    {analysis.topRisks.map((risk, i) => {
                      const cfg = severityConfig(risk.severity);
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={i}
                          className={cn('rounded-lg border-l-4 px-4 py-3 flex gap-3 items-start', cfg.border, cfg.bg)}
                        >
                          <Icon className="h-4 w-4 shrink-0 mt-0.5 opacity-80" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-sm font-semibold text-foreground">{risk.factor}</span>
                              <span className={cn('text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full', cfg.badge)}>
                                {risk.severity.charAt(0).toUpperCase() + risk.severity.slice(1)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{risk.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {analysis.recommendations && analysis.recommendations.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
                    Recommendations
                  </p>
                  <div className="space-y-2.5">
                    {analysis.recommendations.map((rec, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
                        <p className="text-sm text-muted-foreground leading-relaxed">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-border/30">
                <span className="text-[10px] font-mono text-muted-foreground/35 tracking-[0.1em] uppercase select-none">
                  Generated by Claude Sonnet{generatedTime ? ` · ${generatedTime}` : ''}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={analyze}
                  disabled={state === 'loading'}
                  className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                  Re-analyze
                </Button>
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
