'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';
import type { MarketMoodData, MoodSignal } from '@/app/api/market/mood/route';

// ─── Score → color ────────────────────────────────────────────────────────────

function moodColor(score: number): string {
  if (score <= 20) return '#ef4444';
  if (score <= 40) return '#f97316';
  if (score <= 60) return '#eab308';
  if (score <= 80) return '#84cc16';
  return '#22c55e';
}

// ─── Gauge geometry ──────────────────────────────────────────────────────────
// Semicircle from 180° (left/FEAR) over the top to 0° (right/GREED).
// SVG y-axis is down, so for an angle measured from +x counter-clockwise:
//   pt(deg) = (cx + r·cos deg, cy − r·sin deg).
// All draw operations use the same radius — no overlapping strokes, no smear.

const W = 360, H = 220;
const CX = 180, CY = 178, R = 138;
const STROKE = 10;
const ARC_LEN = Math.PI * R; // half-circumference

function svgPt(deg: number, r = R) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function arcD(fromDeg: number, toDeg: number, r = R): string {
  const s = svgPt(fromDeg, r);
  const e = svgPt(toDeg, r);
  const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// ─── Arc Gauge ────────────────────────────────────────────────────────────────

function Gauge({ score, label, animated }: { score: number; label: string; animated: boolean }) {
  // Eased value driven by rAF — both the gradient fill and the marker dot
  // share one tween so they stay in lockstep. When `animated=false` we just
  // read the final value directly without ever touching state in the effect.
  const [animP, setAnimP] = useState(0);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    if (!animated) return;
    const target = score / 100;
    const duration = 1300;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    t0Ref.current = null;
    const tick = (ts: number) => {
      if (!t0Ref.current) t0Ref.current = ts;
      const t = Math.min((ts - t0Ref.current) / duration, 1);
      setAnimP(target * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score, animated]);

  const p = animated ? animP : score / 100;
  const dashOffset = ARC_LEN * (1 - p);
  const markerAngle = 180 - p * 180;
  const marker = svgPt(markerAngle);
  const color = moodColor(score);

  // Tick positions along the bottom (FEAR / NEUTRAL / GREED)
  const TICKS = [
    { value: 0,   label: 'FEAR',    align: 'start'  as const, color: '#ef4444' },
    { value: 50,  label: 'NEUTRAL', align: 'middle' as const, color: '#eab308' },
    { value: 100, label: 'GREED',   align: 'end'    as const, color: '#22c55e' },
  ];

  return (
    <div className="relative w-full max-w-[420px] mx-auto select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="moodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#ef4444" />
            <stop offset="28%"  stopColor="#f97316" />
            <stop offset="50%"  stopColor="#eab308" />
            <stop offset="72%"  stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track — single subtle arc, no underlying color bands */}
        <path
          d={arcD(180, 0)}
          fill="none"
          stroke="hsl(var(--border))"
          strokeOpacity={0.35}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />

        {/* Active gradient fill — revealed via dashoffset (single stroke, no overlap) */}
        <path
          d={arcD(180, 0)}
          fill="none"
          stroke="url(#moodGrad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN.toFixed(1)} ${ARC_LEN.toFixed(1)}`}
          strokeDashoffset={dashOffset.toFixed(2)}
        />

        {/* Marker dot at the score position on the arc — soft outer glow,
            crisp solid center, white inner pip for that "scrubber" feel.   */}
        <circle cx={marker.x} cy={marker.y} r={10} fill={color} opacity={0.22} filter="url(#dotGlow)" />
        <circle cx={marker.x} cy={marker.y} r={6}  fill={color} />
        <circle cx={marker.x} cy={marker.y} r={2}  fill="hsl(var(--background))" />

        {/* Minor tick marks under the arc baseline */}
        {[0, 25, 50, 75, 100].map((v) => {
          const a = 180 - (v / 100) * 180;
          const inner = svgPt(a, R - STROKE / 2 - 6);
          const outer = svgPt(a, R - STROKE / 2 - 2);
          return (
            <line
              key={v}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke="hsl(var(--border))"
              strokeOpacity={0.45}
              strokeWidth={1}
            />
          );
        })}

        {/* Axis labels — outside the arc, well clear of the score area */}
        {TICKS.map((t) => {
          const a = 180 - (t.value / 100) * 180;
          const pt = svgPt(a, R + 18);
          return (
            <text
              key={t.value}
              x={pt.x}
              y={pt.y + 4}
              fontSize={9.5}
              fontWeight={700}
              fill={t.color}
              opacity={0.55}
              letterSpacing={1.6}
              textAnchor={t.align}
            >
              {t.label}
            </text>
          );
        })}
      </svg>

      {/* Score + label — absolutely positioned inside the bowl so the geometry
          stays perfect at every breakpoint, no negative-margin hacks. */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center pointer-events-none"
        style={{ top: '46%' }}
      >
        <span
          className="font-mono font-black tabular-nums leading-none"
          style={{
            color,
            fontSize: 'clamp(56px, 17vw, 88px)',
            textShadow: `0 0 40px ${color}33`,
          }}
        >
          {score}
        </span>
        <span
          className="text-[11px] font-bold uppercase mt-2"
          style={{ color, letterSpacing: '0.32em' }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// ─── Signal card ─────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: MoodSignal }) {
  const color = moodColor(signal.score);
  return (
    <div className="group relative rounded-2xl border border-border/40 bg-card/40 px-4 py-4 transition-colors hover:border-border/70">
      {/* Top row: label + chip */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55 leading-snug">
          {signal.name}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 leading-none border"
          style={{
            color,
            borderColor: `${color}33`,
            background: `${color}10`,
          }}
        >
          {signal.label}
        </span>
      </div>

      {/* Score */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <span
          className="font-mono font-black tabular-nums leading-none"
          style={{ color, fontSize: '38px' }}
        >
          {signal.score}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/35 mb-0.5">/100</span>
      </div>

      {/* Sleeker spectrum bar */}
      <div className="relative h-[2px] w-full rounded-full bg-white/[0.06] overflow-visible mb-3">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            width: `${signal.score}%`,
            background: `linear-gradient(to right, ${color}33, ${color})`,
          }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 rounded-full border-[1.5px] -translate-y-1/2"
          style={{
            left: `calc(${signal.score}% - 5px)`,
            background: 'hsl(var(--background))',
            borderColor: color,
          }}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/55">
        {signal.detail}
      </p>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function MoodSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-[220px] w-full max-w-[420px] rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[170px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketMoodClientPage() {
  const router = useRouter();
  const { hasAnimatedBackground } = useBackground();

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } =
    useQuery<MarketMoodData>({
      queryKey: ['market-mood'],
      queryFn: async () => {
        const res = await fetch('/api/market/mood');
        if (!res.ok) throw new Error('Failed to load market mood');
        return res.json();
      },
      staleTime:       15 * 60 * 1000,
      gcTime:          30 * 60 * 1000,
      refetchInterval: 15 * 60 * 1000,
      retry: 1,
    });

  const composite = data?.composite ?? 0;
  const color     = moodColor(composite);

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : null;

  return (
    <div className={cn('min-h-screen relative overflow-hidden', !hasAnimatedBackground && 'bg-background')}>

      {/* Score-reactive ambient glow — sits high, behind the gauge */}
      {data && (
        <div
          className="absolute inset-x-0 top-0 h-[420px] pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 70% 100% at 50% 0%, ${color}14 0%, transparent 70%)`,
          }}
        />
      )}

      <div className="relative max-w-2xl mx-auto px-4 py-6 sm:py-8 space-y-10">

        {/* Header — refined hairline divider below */}
        <div className="flex items-center gap-3 pb-4 border-b border-border/30">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 -ml-2" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold tracking-tight leading-tight">Market Mood</h1>
            <p className="text-[11px] text-muted-foreground/55 mt-0.5 font-mono tracking-wider uppercase">
              Fear &amp; Greed Index
            </p>
          </div>
          {updatedLabel && (
            <span className="hidden sm:inline text-[10px] text-muted-foreground/40 font-mono tracking-wider">
              {updatedLabel}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground/60', isFetching && 'animate-spin')} />
          </Button>
        </div>

        {/* Body */}
        {isLoading ? (
          <MoodSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Couldn&apos;t load market data right now.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : data ? (
          <>
            {/* Gauge hero */}
            <div className="pt-2 pb-4">
              <Gauge score={composite} label={data.label} animated={!!data} />
            </div>

            {/* Section header for signals */}
            <div className="flex items-end justify-between gap-3 -mb-2 px-1">
              <div>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
                  Signal Breakdown
                </h2>
                <p className="text-xs text-muted-foreground/40 mt-1">
                  How each input contributes to the composite
                </p>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/35 tracking-wider">
                {data.signals.length} of 4
              </span>
            </div>

            {/* Signal cards */}
            <div className={cn(
              'grid gap-3',
              data.signals.length > 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-md mx-auto w-full'
            )}>
              {data.signals.map((signal) => (
                <SignalCard key={signal.name} signal={signal} />
              ))}
            </div>

            {/* Methodology — quieter, indented, mono accent */}
            <div className="border-t border-border/30 pt-5 px-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/45 mb-2">
                Methodology
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/50">
                Composite weighted by{' '}
                <span className="font-mono text-muted-foreground/75">VIX</span> volatility (35%),{' '}
                <span className="font-mono text-muted-foreground/75">S&amp;P 500</span> momentum vs 125-day average (30%),{' '}
                high-yield bond demand <span className="font-mono text-muted-foreground/75">HYG/LQD</span> (20%),{' '}
                and safe-haven flight <span className="font-mono text-muted-foreground/75">SPY/TLT</span> (15%).
                A score of <span className="font-mono text-red-400/80">0</span> represents extreme fear;{' '}
                <span className="font-mono text-emerald-400/80">100</span>, extreme greed.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
