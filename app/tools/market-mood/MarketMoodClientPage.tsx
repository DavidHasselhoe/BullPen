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

// ─── Score → color (slightly desaturated, less neon) ─────────────────────────

function moodColor(score: number): string {
  if (score <= 20) return '#dc6464';  // extreme fear  — muted red
  if (score <= 40) return '#d8884c';  // fear          — burnt orange
  if (score <= 60) return '#c9a851';  // neutral       — wheat
  if (score <= 80) return '#86a55c';  // greed         — sage
  return '#5fa67a';                   // extreme greed — muted teal-green
}

// ─── Smooth rAF tween for any 0..1 progress value ────────────────────────────

function useEased(target: number, animated: boolean, durationMs = 1100): number {
  const [v, setV] = useState(0);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    if (!animated) return;
    t0Ref.current = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const tick = (ts: number) => {
      if (!t0Ref.current) t0Ref.current = ts;
      const t = Math.min((ts - t0Ref.current) / durationMs, 1);
      setV(target * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, animated, durationMs]);

  return animated ? v : target;
}

// ─── Hero — score number + spectrum bar (modern, neutral, single-color) ──────

function MoodHero({ score, label, animated }: { score: number; label: string; animated: boolean }) {
  const eased = useEased(score / 100, animated); // 0..1
  const color = moodColor(score);
  const pct = `${(eased * 100).toFixed(2)}%`;

  return (
    <div className="space-y-7">
      {/* Score + label — quiet centering, no glow, no shadow */}
      <div className="text-center">
        <div className="flex items-baseline justify-center gap-2">
          <span
            className="font-mono font-semibold tabular-nums leading-none"
            style={{
              color,
              fontSize: 'clamp(72px, 14vw, 104px)',
              letterSpacing: '-0.04em',
            }}
          >
            {score}
          </span>
          <span className="text-base text-muted-foreground/35 font-mono mb-2">/100</span>
        </div>
        <div
          className="text-[11px] font-semibold uppercase mt-3"
          style={{ color, letterSpacing: '0.3em', opacity: 0.85 }}
        >
          {label}
        </div>
      </div>

      {/* Spectrum bar with marker */}
      <div className="space-y-3 px-1">
        <div className="relative h-1 rounded-full bg-border/40">
          {/* Active fill — single color, opacity gradient so it never reads as neon */}
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-none"
            style={{
              width: pct,
              background: `linear-gradient(to right, ${color}55, ${color})`,
            }}
          />

          {/* Vertical guide line behind the marker — adds intentionality */}
          <div
            className="absolute -top-[3px] h-[10px] w-px"
            style={{ left: pct, background: color, opacity: 0.4, transform: 'translateX(-0.5px)' }}
          />

          {/* Marker — small chip-like circle */}
          <div
            className="absolute top-1/2 h-3.5 w-3.5 rounded-full border-[1.5px] shadow-sm"
            style={{
              left: pct,
              background: 'hsl(var(--background))',
              borderColor: color,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>

        {/* End labels */}
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/45">
          <span>Fear</span>
          <span className="font-mono tabular-nums text-muted-foreground/30">
            0&nbsp;·&nbsp;25&nbsp;·&nbsp;50&nbsp;·&nbsp;75&nbsp;·&nbsp;100
          </span>
          <span>Greed</span>
        </div>
      </div>
    </div>
  );
}

// ─── Signal card — neutral card surface, accent only on score + bar ──────────

function SignalCard({ signal }: { signal: MoodSignal }) {
  const color = moodColor(signal.score);
  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 px-4 py-4 transition-colors hover:border-border/70">
      {/* Top row: name + state chip */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55">
          {signal.name}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 leading-none"
          style={{ color, background: `${color}14` }}
        >
          {signal.label}
        </span>
      </div>

      {/* Score */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <span
          className="font-mono font-semibold tabular-nums leading-none"
          style={{ color, fontSize: '36px', letterSpacing: '-0.03em' }}
        >
          {signal.score}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/30 mb-0.5">/100</span>
      </div>

      {/* Mini spectrum bar */}
      <div className="relative h-[2px] w-full rounded-full bg-border/40 mb-3">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${signal.score}%`, background: color, opacity: 0.85 }}
        />
        <div
          className="absolute top-1/2 h-2 w-2 rounded-full border"
          style={{
            left: `${signal.score}%`,
            background: 'hsl(var(--background))',
            borderColor: color,
            transform: 'translate(-50%, -50%)',
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
    <div className="space-y-10">
      <div className="space-y-6">
        <Skeleton className="h-24 w-40 mx-auto rounded-lg" />
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[150px] rounded-2xl" />
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

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : null;

  return (
    <div className={cn('min-h-screen', !hasAnimatedBackground && 'bg-background')}>
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 space-y-10">

        {/* Header — refined hairline divider below, no decorative chrome */}
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
            <div className="pt-2 pb-2">
              <MoodHero score={composite} label={data.label} animated={!!data} />
            </div>

            {/* Section header for signals — counter on the title line so it
                can't collide with the subtitle text */}
            <div className="px-1 -mb-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
                  Signal Breakdown
                </h2>
                <span className="text-[10px] font-mono text-muted-foreground/35 tracking-wider">
                  {data.signals.length} of 4
                </span>
              </div>
              <p className="text-xs text-muted-foreground/40 mt-1">
                How each input contributes to the composite
              </p>
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

            {/* Methodology — quiet, editorial, mono accent on symbol codes */}
            <div className="border-t border-border/30 pt-5 px-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/45 mb-2">
                Methodology
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/50">
                Composite weighted by{' '}
                <span className="font-mono text-muted-foreground/75">VIX</span> volatility (35%),{' '}
                <span className="font-mono text-muted-foreground/75">S&amp;P 500</span> momentum vs 125-day average (30%),{' '}
                high-yield bond demand{' '}
                <span className="font-mono text-muted-foreground/75">HYG/LQD</span> (20%),{' '}
                and safe-haven flight{' '}
                <span className="font-mono text-muted-foreground/75">SPY/TLT</span> (15%).
                A score of <span className="font-mono">0</span> represents extreme fear;{' '}
                <span className="font-mono">100</span>, extreme greed.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
