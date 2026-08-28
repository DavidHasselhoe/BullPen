'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import type { MoodSignal } from '@/app/api/market/mood/route';

// ─── Score → color (slightly desaturated, less neon) ─────────────────────────

export function moodColor(score: number): string {
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

/** Stable, human-legible data-tour anchor for a signal card, keyed by name
 *  (not array index — a signal can drop out if its data source fails, which
 *  would otherwise reorder/shrink the array under a positional key). */
export function signalTourId(name: string): string {
  return `mood-signal-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

// ─── Hero — score number + spectrum bar (modern, neutral, single-color) ──────

export function MoodHero({ score, label, animated }: { score: number; label: string; animated: boolean }) {
  const { t } = useTranslation('market');
  const eased = useEased(score / 100, animated); // 0..1
  const color = moodColor(score);
  const pct = `${(eased * 100).toFixed(2)}%`;

  return (
    <div className="space-y-7" data-tour="mood-hero">
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
          <span className="text-base text-muted-foreground/80 font-mono mb-2">/100</span>
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
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80">
          <span>{t('moodFear')}</span>
          <span className="font-mono tabular-nums text-muted-foreground/80">
            {t('moodScale')}
          </span>
          <span>{t('moodGreed')}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Signal card — neutral card surface, accent only on score + bar ──────────

export function SignalCard({ signal }: { signal: MoodSignal }) {
  const color = moodColor(signal.score);
  return (
    <div
      className="rounded-2xl border border-border/40 bg-card/30 px-4 py-4 transition-colors hover:border-border/70"
      data-tour={signalTourId(signal.name)}
    >
      {/* Top row: name + state chip */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
          {signal.name}
        </span>
        <span
          className="text-[11px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 leading-none"
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
        <span className="text-[11px] font-mono text-muted-foreground/80 mb-0.5">/100</span>
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

      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {signal.detail}
      </p>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

export function MoodSkeleton() {
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
