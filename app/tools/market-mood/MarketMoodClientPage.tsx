'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw, AlertCircle, Info } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';
import type { MarketMoodData, MoodSignal } from '@/app/api/market/mood/route';

// ─── Color helpers ────────────────────────────────────────────────────────────

function moodColor(score: number): string {
  if (score <= 20) return '#ef4444';
  if (score <= 40) return '#f97316';
  if (score <= 60) return '#eab308';
  if (score <= 80) return '#84cc16';
  return '#22c55e';
}

function moodBg(score: number): string {
  if (score <= 20) return 'bg-red-500/8';
  if (score <= 40) return 'bg-orange-500/8';
  if (score <= 60) return 'bg-yellow-500/8';
  if (score <= 80) return 'bg-lime-500/8';
  return 'bg-green-500/8';
}

function moodBorder(score: number): string {
  if (score <= 20) return 'border-red-500/20';
  if (score <= 40) return 'border-orange-500/20';
  if (score <= 60) return 'border-yellow-500/20';
  if (score <= 80) return 'border-lime-500/20';
  return 'border-green-500/20';
}

// ─── SVG Arc Gauge ────────────────────────────────────────────────────────────
// Half-circle arc: left = fear (0), top = neutral (50), right = greed (100)
// Angles: 180° (left) → 0° (right), passing over the top via counterclockwise arc
// SVG y-axis is flipped: point(θ) = (cx + r·cos θ, cy − r·sin θ)

const GCX = 150, GCY = 152, GR = 112, GSW = 22;

function arcSeg(fromDeg: number, toDeg: number, r = GR): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = GCX + r * Math.cos(toRad(fromDeg));
  const y1 = GCY - r * Math.sin(toRad(fromDeg));
  const x2 = GCX + r * Math.cos(toRad(toDeg));
  const y2 = GCY - r * Math.sin(toRad(toDeg));
  // sweep=0 → counterclockwise in SVG = goes over the top (decreasing angle)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function needleCoords(score: number, r: number): { x: number; y: number } {
  const deg = 180 - (score / 100) * 180;
  const toRad = (d: number) => (d * Math.PI) / 180;
  return {
    x: GCX + r * Math.cos(toRad(deg)),
    y: GCY - r * Math.sin(toRad(deg)),
  };
}

// 5 colored bands: Extreme Fear → Fear → Neutral → Greed → Extreme Greed
const BANDS = [
  { from: 180, to: 144, color: '#ef4444' },
  { from: 144, to: 108, color: '#f97316' },
  { from: 108, to:  72, color: '#eab308' },
  { from:  72, to:  36, color: '#84cc16' },
  { from:  36, to:   0, color: '#22c55e' },
];

function ArcGauge({ score, animated }: { score: number; animated: boolean }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!animated) return;
    let start: number | null = null;
    const duration = 1100;
    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const tick = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setAnimatedScore(Math.round(ease(progress) * score));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score, animated]);

  const displayScore = animated ? animatedScore : score;

  const tip = needleCoords(displayScore, GR - 6);
  const tipOuter = needleCoords(displayScore, GR + 2);
  const color = moodColor(displayScore);

  return (
    <svg viewBox="0 0 300 165" width="100%" className="max-w-[380px] mx-auto select-none">
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ef4444" />
          <stop offset="25%"  stopColor="#f97316" />
          <stop offset="50%"  stopColor="#eab308" />
          <stop offset="75%"  stopColor="#84cc16" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
        <filter id="needleGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Track arc */}
      <path
        d={arcSeg(180, 0)}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.08}
        strokeWidth={GSW}
        strokeLinecap="round"
        className="text-foreground"
      />

      {/* Colored bands */}
      {BANDS.map((b) => (
        <path
          key={b.from}
          d={arcSeg(b.from, b.to)}
          fill="none"
          stroke={b.color}
          strokeWidth={GSW}
          strokeOpacity={0.25}
          strokeLinecap="butt"
        />
      ))}

      {/* Active fill up to current score */}
      <path
        d={arcSeg(180, 180 - (displayScore / 100) * 180)}
        fill="none"
        stroke="url(#gaugeGrad)"
        strokeWidth={GSW}
        strokeLinecap="round"
      />

      {/* Needle */}
      <line
        x1={GCX}
        y1={GCY}
        x2={tip.x.toFixed(2)}
        y2={tip.y.toFixed(2)}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        filter="url(#needleGlow)"
      />
      {/* Needle cap on arc */}
      <circle cx={tipOuter.x.toFixed(2)} cy={tipOuter.y.toFixed(2)} r={4} fill={color} />

      {/* Center pivot */}
      <circle cx={GCX} cy={GCY} r={7}  fill="hsl(var(--background))" />
      <circle cx={GCX} cy={GCY} r={4}  fill={color} />

      {/* Edge labels */}
      <text x={28}  y={GCY + 16} fontSize={9} textAnchor="middle" fill="#ef4444" fontWeight={600} opacity={0.8}>FEAR</text>
      <text x={272} y={GCY + 16} fontSize={9} textAnchor="middle" fill="#22c55e" fontWeight={600} opacity={0.8}>GREED</text>
    </svg>
  );
}

// ─── Signal mini-bar ─────────────────────────────────────────────────────────

function SignalBar({ score }: { score: number }) {
  const pct = `${score}%`;
  return (
    <div className="relative h-2 w-full rounded-full overflow-hidden bg-gradient-to-r from-red-500/20 via-yellow-500/20 to-green-500/20">
      {/* Gradient fill up to score */}
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{
          width: pct,
          background: 'linear-gradient(to right, #ef4444, #f97316, #eab308, #84cc16, #22c55e)',
          backgroundSize: '500px 100%',
          backgroundPosition: '0 0',
        }}
      />
      {/* Position marker */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-1 h-3.5 rounded-full bg-white shadow-sm"
        style={{ left: pct, transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
}

// ─── Signal card ─────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: MoodSignal }) {
  const color = moodColor(signal.score);
  return (
    <div className={cn(
      'rounded-xl border p-4 flex flex-col gap-3',
      moodBg(signal.score), moodBorder(signal.score)
    )}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest leading-tight">
          {signal.name}
        </span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ color, background: `${color}20` }}
        >
          {signal.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <span
          className="text-4xl font-black tabular-nums leading-none"
          style={{ color }}
        >
          {signal.score}
        </span>
        <span className="text-xs text-muted-foreground text-right">/100</span>
      </div>

      <SignalBar score={signal.score} />

      <p className="text-xs text-muted-foreground leading-relaxed">{signal.detail}</p>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function MoodSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-[165px] w-full max-w-[380px] rounded-xl" />
        <Skeleton className="h-16 w-32 rounded-lg" />
        <Skeleton className="h-5 w-24 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[168px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MarketMoodClientPage() {
  const router = useRouter();
  const { hasAnimatedBackground } = useBackground();
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<MarketMoodData>({
    queryKey: ['market-mood'],
    queryFn: async () => {
      const res = await fetch('/api/market/mood');
      if (!res.ok) throw new Error('Failed to load market mood');
      return res.json();
    },
    staleTime:      15 * 60 * 1000,
    gcTime:         30 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  });

  const composite = data?.composite ?? 0;
  const compositeColor = moodColor(composite);

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : null;

  return (
    <div className={cn(
      'min-h-screen',
      !hasAnimatedBackground && 'bg-background'
    )}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Market Mood</h1>
            <p className="text-xs text-muted-foreground">Fear &amp; Greed Index · 4-signal composite</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>

        {/* Body */}
        {isLoading ? (
          <MoodSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Failed to load market data</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : data ? (
          <>
            {/* Composite gauge */}
            <div className="flex flex-col items-center gap-1">
              <ArcGauge score={composite} animated={!!data} />

              {/* Score + label beneath gauge */}
              <div className="flex flex-col items-center -mt-2">
                <span
                  className="text-6xl font-black tabular-nums leading-none tracking-tight"
                  style={{ color: compositeColor }}
                >
                  {composite}
                </span>
                <span
                  className="text-base font-bold mt-1 uppercase tracking-widest"
                  style={{ color: compositeColor }}
                >
                  {data.label}
                </span>
                {updatedLabel && (
                  <span className="text-[10px] text-muted-foreground/50 mt-2 font-mono">
                    Updated {updatedLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Signal cards 2×2 */}
            <div className="grid grid-cols-2 gap-4">
              {data.signals.map((signal) => (
                <SignalCard key={signal.name} signal={signal} />
              ))}
            </div>

            {/* Methodology note */}
            <div className="flex gap-2 rounded-lg border border-border/30 bg-muted/20 p-3">
              <Info className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                Composite weighted by VIX volatility (35%), S&P 500 momentum vs 125-day average (30%),
                high-yield bond demand HYG/LQD (20%), and safe-haven flight SPY/TLT (15%).
                Score 0 = extreme fear, 100 = extreme greed.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
