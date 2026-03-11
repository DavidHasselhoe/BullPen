'use client';

import { useState, useEffect, useMemo } from 'react';
import { arc as d3Arc } from 'd3';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HoldingWithPrice } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RiskMetric {
  score: number;
  label: string;
  detail: string;
}

interface RiskAnalysis {
  overallRiskScore: number;
  riskLevel: string;
  metrics: {
    concentration: RiskMetric;
    sectorDiversification: RiskMetric;
    marketCapBias: RiskMetric;
    volatilityExposure: RiskMetric;
  };
  topRisks: { severity: string; factor: string; description: string }[];
  sectorBreakdown: { sector: string; symbols: string[]; estimatedWeight: number }[];
  recommendations: string[];
  portfolioSummary: string;
}

interface PortfolioRiskAnalysisProps {
  holdings: HoldingWithPrice[];
}

// ─── Gauge ───────────────────────────────────────────────────────────────────

// d3 angle convention: 0 = 12-o'clock, clockwise positive
// Gauge arc: 9 o'clock (score 0) → 12 o'clock (top) → 3 o'clock (score 100)
const GAUGE_START = -Math.PI / 2; // 9 o'clock
const GAUGE_END = Math.PI / 2;    // 3 o'clock

// SVG dimensions: arc center sits at the bottom edge so the flat face is flush
const GAUGE_R_OUTER = 84;
const GAUGE_R_INNER = 60;
const GAUGE_CX = 100;
const GAUGE_CY = GAUGE_R_OUTER + 10; // top padding + radius = arc top at y=10
const GAUGE_W = 200;
const GAUGE_H = GAUGE_CY; // SVG height ends exactly at the flat edge

function gaugeColor(score: number): string {
  if (score <= 33) return '#22c55e'; // green-500
  if (score <= 60) return '#f59e0b'; // amber-500
  if (score <= 79) return '#f97316'; // orange-500
  return '#ef4444';                  // red-500
}

function buildGaugePath(startAngle: number, endAngle: number, rInner: number, rOuter: number) {
  const gen = d3Arc()
    .innerRadius(rInner)
    .outerRadius(rOuter)
    .cornerRadius(4);
  return (
    gen({ startAngle, endAngle, innerRadius: rInner, outerRadius: rOuter } as Parameters<typeof gen>[0]) ?? ''
  );
}

/**
 * Clean semicircular gauge — no needle, no internal text.
 * Score and risk level are rendered as HTML beneath the SVG.
 */
function GaugeChart({
  score,
  riskLevel,
  animated,
}: {
  score: number;
  riskLevel: string;
  animated: boolean;
}) {
  const [displayScore, setDisplayScore] = useState(animated ? 0 : score);

  useEffect(() => {
    if (!animated) {
      setDisplayScore(score);
      return;
    }
    let frame: number;
    let start: number | null = null;
    const duration = 900;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    const tick = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setDisplayScore(Math.round(ease(progress) * score));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, animated]);

  const color = gaugeColor(score);
  const bgPath = buildGaugePath(GAUGE_START, GAUGE_END, GAUGE_R_INNER, GAUGE_R_OUTER);
  const fillEnd = GAUGE_START + (displayScore / 100) * Math.PI;
  const fillPath = displayScore > 0 ? buildGaugePath(GAUGE_START, fillEnd, GAUGE_R_INNER, GAUGE_R_OUTER) : '';

  return (
    <div className="flex flex-col items-center gap-3 shrink-0">
      {/* Arc — text-free, clean */}
      <svg
        viewBox={`0 0 ${GAUGE_W} ${GAUGE_H}`}
        width={GAUGE_W}
        height={GAUGE_H}
        className="overflow-visible"
      >
        <g transform={`translate(${GAUGE_CX}, ${GAUGE_CY})`}>
          {/* Background track */}
          <path d={bgPath} fill="currentColor" className="text-muted/50" />
          {/* Colored fill arc */}
          {fillPath && <path d={fillPath} fill={color} />}
          {/* Subtle end-cap dots at 0 and 100 */}
          {[0, 100].map((t) => {
            const angle = GAUGE_START + (t / 100) * Math.PI;
            const rm = (GAUGE_R_INNER + GAUGE_R_OUTER) / 2;
            return (
              <circle
                key={t}
                cx={rm * Math.cos(angle)}
                cy={rm * Math.sin(angle)}
                r={3}
                fill="currentColor"
                className="text-background"
              />
            );
          })}
        </g>
      </svg>

      {/* Score label — outside the SVG, no overlap possible */}
      <div className="text-center">
        <div className="flex items-baseline justify-center gap-1 leading-none">
          <span className="text-4xl font-black text-foreground tabular-nums">{displayScore}</span>
          <span className="text-sm font-medium text-muted-foreground">/100</span>
        </div>
        <span className={cn('text-sm font-bold mt-1 block', riskLevelColor(riskLevel))}>
          {riskLevel} Risk
        </span>
      </div>
    </div>
  );
}

// ─── Metric Bar ───────────────────────────────────────────────────────────────

function MetricBar({ label, score, detail }: { label: string; score: number; detail: string }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setWidth(score), 120);
    return () => clearTimeout(timer);
  }, [score]);

  const color =
    score >= 70 ? 'bg-red-500' : score >= 50 ? 'bg-orange-500' : score >= 30 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm font-bold tabular-nums text-foreground">{score}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', color)}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
    </div>
  );
}

// ─── Severity styling ─────────────────────────────────────────────────────────

function severityConfig(severity: string) {
  switch (severity) {
    case 'critical':
      return { border: 'border-red-500/60', bg: 'bg-red-500/8', badge: 'bg-red-500/15 text-red-600 dark:text-red-400', icon: AlertTriangle, label: 'Critical' };
    case 'high':
      return { border: 'border-orange-500/60', bg: 'bg-orange-500/8', badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400', icon: AlertTriangle, label: 'High' };
    case 'medium':
      return { border: 'border-amber-500/60', bg: 'bg-amber-500/8', badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icon: Info, label: 'Medium' };
    default:
      return { border: 'border-blue-500/60', bg: 'bg-blue-500/8', badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', icon: Info, label: 'Low' };
  }
}

function riskLevelColor(level: string) {
  switch (level) {
    case 'Low': return 'text-green-600 dark:text-green-400';
    case 'Moderate': return 'text-emerald-600 dark:text-emerald-400';
    case 'Elevated': return 'text-amber-600 dark:text-amber-400';
    case 'High': return 'text-orange-600 dark:text-orange-400';
    case 'Very High': return 'text-red-600 dark:text-red-400';
    default: return 'text-foreground';
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

type State = 'idle' | 'loading' | 'loaded' | 'error';

export function PortfolioRiskAnalysis({ holdings }: PortfolioRiskAnalysisProps) {
  const [state, setState] = useState<State>('idle');
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [showSectors, setShowSectors] = useState(false);

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

  async function analyze() {
    setState('loading');
    setError(null);
    setAnimated(false);
    try {
      const res = await fetch('/api/holdings/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: payload }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Analysis failed');
      setAnalysis(data.analysis);
      setState('loaded');
      // Slight delay so DOM is ready before animation starts
      requestAnimationFrame(() => setTimeout(() => setAnimated(true), 50));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze portfolio');
      setState('error');
    }
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Portfolio Risk Analysis
          </CardTitle>
          <Button
            size="sm"
            variant={state === 'loaded' ? 'outline' : 'default'}
            onClick={analyze}
            disabled={state === 'loading'}
            className="shrink-0 gap-2"
          >
            {state === 'loading' ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Analyzing…
              </>
            ) : state === 'loaded' ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Re-analyze
              </>
            ) : (
              <>
                <ShieldAlert className="h-3.5 w-3.5" />
                Analyze Risk
              </>
            )}
          </Button>
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
              Analyze concentration, sector exposure, market cap bias, and volatility across your {holdings.length} position{holdings.length !== 1 ? 's' : ''}.
            </p>
            <Button onClick={analyze} className="mt-1 gap-2">
              <ShieldAlert className="h-4 w-4" />
              Analyze Portfolio Risk
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {state === 'loading' && (
          <div className="space-y-6 py-2">
            <div className="flex flex-col md:flex-row gap-6">
              <Skeleton className="h-32 w-52 rounded-xl mx-auto md:mx-0" />
              <div className="flex-1 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-8" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            </div>
            <Skeleton className="h-16 w-full rounded-lg" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
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
            {/* Executive summary */}
            <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/40 pl-3">
              {analysis.portfolioSummary}
            </p>

            {/* Gauge + Metrics */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
              {/* Gauge */}
              <div className="mx-auto md:mx-0">
                <GaugeChart
                  score={analysis.overallRiskScore}
                  riskLevel={analysis.riskLevel}
                  animated={animated}
                />
              </div>

              {/* Metric bars */}
              <div className="flex-1 space-y-4 w-full">
                <MetricBar
                  label="Concentration"
                  score={analysis.metrics.concentration.score}
                  detail={analysis.metrics.concentration.detail}
                />
                <MetricBar
                  label="Sector Diversification"
                  score={analysis.metrics.sectorDiversification.score}
                  detail={analysis.metrics.sectorDiversification.detail}
                />
                <MetricBar
                  label="Market Cap Bias"
                  score={analysis.metrics.marketCapBias.score}
                  detail={analysis.metrics.marketCapBias.detail}
                />
                <MetricBar
                  label="Volatility Exposure"
                  score={analysis.metrics.volatilityExposure.score}
                  detail={analysis.metrics.volatilityExposure.detail}
                />
              </div>
            </div>

            {/* Sector breakdown (collapsible) */}
            {analysis.sectorBreakdown && analysis.sectorBreakdown.length > 0 && (
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <button
                  onClick={() => setShowSectors((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors"
                >
                  Sector Breakdown
                  {showSectors ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {showSectors && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border/40">
                    {analysis.sectorBreakdown
                      .sort((a, b) => b.estimatedWeight - a.estimatedWeight)
                      .map((s) => (
                        <div key={s.sector} className="flex items-center gap-3 py-1.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-foreground">{s.sector}</span>
                              <span className="text-xs font-semibold text-foreground tabular-nums">
                                {s.estimatedWeight.toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary/70 transition-all duration-700"
                                style={{ width: `${s.estimatedWeight}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {s.symbols.map((sym) => (
                                <span
                                  key={sym}
                                  className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono"
                                >
                                  {sym}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Risk factors */}
            {analysis.topRisks && analysis.topRisks.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Key Risk Factors</h3>
                {analysis.topRisks.map((risk, i) => {
                  const cfg = severityConfig(risk.severity);
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded-lg border-l-4 px-4 py-3 flex gap-3 items-start',
                        cfg.border,
                        cfg.bg
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 mt-0.5 opacity-80" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold text-foreground">{risk.factor}</span>
                          <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', cfg.badge)}>
                            {risk.severity.charAt(0).toUpperCase() + risk.severity.slice(1)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{risk.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recommendations */}
            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Recommendations</h3>
                <div className="space-y-2">
                  {analysis.recommendations.map((rec, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                      <p className="text-sm text-muted-foreground leading-relaxed">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
