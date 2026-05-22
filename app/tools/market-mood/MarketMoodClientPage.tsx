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

// ─── Color scale ──────────────────────────────────────────────────────────────

function moodColor(score: number): string {
  if (score <= 20) return '#ef4444';
  if (score <= 40) return '#f97316';
  if (score <= 60) return '#eab308';
  if (score <= 80) return '#84cc16';
  return '#22c55e';
}

// ─── Gauge math ───────────────────────────────────────────────────────────────
// Arc from 180° (left/fear) → 0° (right/greed) passing over the top.
// SVG y-axis is down, so: pt(deg) = (cx + r·cos deg, cy − r·sin deg)
// sweep=0 (counterclockwise in SVG) → arc goes over the top ✓

const CX = 160, CY = 154, GR = 124, GSW = 12;
const HALF_CIRC = Math.PI * GR; // full arc length ≈ 389.6 px

function svgPt(deg: number, r = GR) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function arcD(fromDeg: number, toDeg: number, r = GR): string {
  const s = svgPt(fromDeg, r);
  const e = svgPt(toDeg, r);
  const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// ─── Arc Gauge ────────────────────────────────────────────────────────────────
//
// Key technique: stroke-dasharray on the FULL gradient arc instead of drawing
// multiple overlapping arcs. Only one stroke at one radius = no smear artifacts.
// dashOffset starts at HALF_CIRC (nothing visible) and eases to
// HALF_CIRC * (1 - score/100) (score-portion visible from the fear/left side).

const BANDS = [
  { from: 180, to: 144, color: '#ef4444' },
  { from: 144, to: 108, color: '#f97316' },
  { from: 108, to:  72, color: '#eab308' },
  { from:  72, to:  36, color: '#84cc16' },
  { from:  36, to:   0, color: '#22c55e' },
] as const;

function ArcGauge({ score, animated }: { score: number; animated: boolean }) {
  const [dashOff, setDashOff]     = useState(HALF_CIRC);
  const [needleDeg, setNeedleDeg] = useState(180);
  const rafRef = useRef<number>(0);
  const t0Ref  = useRef<number | null>(null);

  useEffect(() => {
    if (!animated) return;
    const targetDash   = HALF_CIRC * (1 - score / 100);
    const targetAngle  = 180 - (score / 100) * 180;
    const duration     = 1300;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4); // quartic ease-out

    t0Ref.current = null;
    const tick = (ts: number) => {
      if (!t0Ref.current) t0Ref.current = ts;
      const p = Math.min((ts - t0Ref.current) / duration, 1);
      const e = ease(p);
      setDashOff(HALF_CIRC  + (targetDash  - HALF_CIRC) * e);
      setNeedleDeg(180      + (targetAngle - 180)        * e);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score, animated]);

  const liveDash  = animated ? dashOff    : HALF_CIRC * (1 - score / 100);
  const liveAngle = animated ? needleDeg  : 180 - (score / 100) * 180;
  const tipInner  = svgPt(liveAngle, GR - 5);
  const tipOuter  = svgPt(liveAngle, GR + 2);
  const color     = moodColor(score);

  return (
    <svg
      viewBox="0 0 320 178"
      className="w-full max-w-[340px] mx-auto select-none overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id="moodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ef4444" />
          <stop offset="25%"  stopColor="#f97316" />
          <stop offset="50%"  stopColor="#eab308" />
          <stop offset="75%"  stopColor="#84cc16" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>

        {/* Soft glow for needle tip */}
        <filter id="tipGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Zone bands — background hint only, behind the gradient fill */}
      {BANDS.map((b) => (
        <path
          key={b.from}
          d={arcD(b.from, b.to)}
          fill="none"
          stroke={b.color}
          strokeWidth={GSW}
          strokeOpacity={0.10}
          strokeLinecap="butt"
        />
      ))}

      {/* Full gradient arc — only the active portion revealed via dashOffset.
          Single stroke at one radius: no overlap, no antialiasing smear. */}
      <path
        d={arcD(180, 0)}
        fill="none"
        stroke="url(#moodGrad)"
        strokeWidth={GSW}
        strokeLinecap="round"
        strokeDasharray={`${HALF_CIRC.toFixed(1)} ${HALF_CIRC.toFixed(1)}`}
        strokeDashoffset={liveDash.toFixed(2)}
      />

      {/* Needle — thin line, drawn after arc so it's on top */}
      <line
        x1={CX} y1={CY}
        x2={tipInner.x.toFixed(2)} y2={tipInner.y.toFixed(2)}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.9}
      />

      {/* Needle tip glow dot */}
      <circle
        cx={tipOuter.x.toFixed(2)} cy={tipOuter.y.toFixed(2)}
        r={5} fill={color} filter="url(#tipGlow)"
      />
      <circle
        cx={tipOuter.x.toFixed(2)} cy={tipOuter.y.toFixed(2)}
        r={2.5} fill="white" opacity={0.95}
      />

      {/* Center pivot */}
      <circle cx={CX} cy={CY} r={8}   fill="hsl(var(--background))" />
      <circle cx={CX} cy={CY} r={4}   fill={color} opacity={0.9} />
      <circle cx={CX} cy={CY} r={1.5} fill="white" opacity={0.8} />

      {/* FEAR / GREED endpoint labels */}
      <text x={28}  y={CY + 20} fontSize={8} fill="#ef4444" fontWeight={700}
        textAnchor="middle" letterSpacing={1.5} opacity={0.55}>FEAR</text>
      <text x={292} y={CY + 20} fontSize={8} fill="#22c55e" fontWeight={700}
        textAnchor="middle" letterSpacing={1.5} opacity={0.55}>GREED</text>
    </svg>
  );
}

// ─── Signal spectrum bar ──────────────────────────────────────────────────────

function SpectrumBar({ score }: { score: number }) {
  const color = moodColor(score);
  return (
    <div className="relative h-[3px] w-full mt-1">
      {/* Inactive track */}
      <div className="absolute inset-0 rounded-full bg-white/5" />
      {/* Active fill */}
      <div
        className="absolute left-0 top-0 h-full rounded-full"
        style={{
          width: `${score}%`,
          background: `linear-gradient(to right, #ef444455, ${color})`,
        }}
      />
      {/* Marker tick */}
      <div
        className="absolute top-1/2 h-[10px] w-[2px] rounded-full bg-white/80"
        style={{ left: `calc(${score}% - 1px)`, transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

// ─── Signal card ─────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: MoodSignal }) {
  const color = moodColor(signal.score);
  return (
    <div
      className="rounded-xl p-3.5 flex flex-col gap-2.5 border"
      style={{ background: `${color}09`, borderColor: `${color}18` }}
    >
      {/* Name + label */}
      <div className="flex items-start justify-between gap-1.5 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/55 leading-snug">
          {signal.name}
        </span>
        <span
          className="text-[9px] font-black uppercase tracking-[0.06em] px-1.5 py-[3px] rounded shrink-0 leading-none"
          style={{ color, background: `${color}18` }}
        >
          {signal.label}
        </span>
      </div>

      {/* Score */}
      <div className="flex items-baseline gap-1">
        <span
          className="text-[42px] font-mono font-black leading-none tabular-nums"
          style={{ color }}
        >
          {signal.score}
        </span>
        <span className="text-[10px] text-muted-foreground/30 pb-0.5">/100</span>
      </div>

      <SpectrumBar score={signal.score} />

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
        <Skeleton className="h-[178px] w-[340px] max-w-full rounded-2xl" />
        <Skeleton className="h-[80px] w-28 rounded-lg" />
        <Skeleton className="h-4 w-20 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[168px] rounded-xl" />
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

      {/* Score-reactive ambient glow — faint radial that shifts with composite */}
      {data && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 55% at 50% 22%, ${color}0d 0%, transparent 65%)`,
          }}
        />
      )}

      <div className="relative max-w-xl mx-auto px-4 py-6 space-y-7">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Market Mood</h1>
            <p className="text-xs text-muted-foreground/60">Fear &amp; Greed Index · {data?.signals.length ?? 4}-signal composite</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground/60', isFetching && 'animate-spin')} />
          </Button>
        </div>

        {/* Body */}
        {isLoading ? (
          <MoodSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Failed to load market data</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : data ? (
          <>
            {/* Gauge hero */}
            <div className="flex flex-col items-center">
              <ArcGauge score={composite} animated={!!data} />

              {/* Score + label float just below the arc baseline */}
              <div className="flex flex-col items-center -mt-3">
                <span
                  className="text-[76px] font-mono font-black tabular-nums leading-none"
                  style={{ color }}
                >
                  {composite}
                </span>
                <span
                  className="text-[13px] font-bold uppercase tracking-[0.22em] mt-1.5"
                  style={{ color }}
                >
                  {data.label}
                </span>
                {updatedLabel && (
                  <span className="text-[10px] text-muted-foreground/30 mt-2.5 font-mono tracking-wider">
                    Updated {updatedLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Signal cards — 2-col grid, expands gracefully if fewer signals */}
            <div className={cn(
              'grid gap-3',
              data.signals.length > 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-sm mx-auto w-full'
            )}>
              {data.signals.map((signal) => (
                <SignalCard key={signal.name} signal={signal} />
              ))}
            </div>

            {/* Methodology */}
            <div className="flex gap-2.5 items-start rounded-xl border border-border/20 bg-muted/10 px-4 py-3.5">
              <Info className="h-3 w-3 text-muted-foreground/30 shrink-0 mt-[3px]" />
              <p className="text-[11px] text-muted-foreground/45 leading-relaxed">
                Composite weighted by VIX volatility (35%), S&amp;P 500 momentum vs 125-day
                average (30%), high-yield bond demand HYG/LQD (20%), and safe-haven flight
                SPY/TLT (15%). Score 0 = extreme fear, 100 = extreme greed.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
