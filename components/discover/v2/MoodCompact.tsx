'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketMoodData } from '@/app/api/market/mood/route';

/**
 * A compact read on how the market feels, from the existing Fear & Greed
 * composite at /api/market/mood (already CDN-cached for 15 minutes, so this
 * costs nothing extra).
 *
 * The score alone is a number nobody can act on, so the tile leads with the
 * word — "Fear", "Greed" — and carries the strongest contributing signal's
 * plain-language explanation underneath. That's the "explain, don't just
 * report" principle: the sentence is the point, the number is the evidence.
 *
 * The scale is its own muted spectrum, never the emerald/red signal pair —
 * greed is not "good" and fear is not "a loss", and borrowing the gain/loss
 * colours here would teach exactly the wrong reflex.
 */

function moodColor(score: number): string {
  if (score <= 20) return '#dc6464';  // extreme fear  — muted red
  if (score <= 40) return '#d8884c';  // fear          — burnt orange
  if (score <= 60) return '#c9a851';  // neutral       — wheat
  if (score <= 80) return '#86a55c';  // greed         — sage
  return '#5fa67a';                   // extreme greed — muted teal-green
}

export function MoodCompact() {
  const { data, isLoading } = useQuery<MarketMoodData>({
    queryKey: ['market-mood'],
    queryFn: async () => {
      const res = await fetch('/api/market/mood');
      if (!res.ok) throw new Error(`Mood failed: ${res.status}`);
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (isLoading) {
    return <div className="h-[104px] rounded-xl border border-border/30 animate-shimmer" aria-hidden />;
  }
  // A missing mood shouldn't leave a hole at the top of the page.
  if (!data) return null;

  const color = moodColor(data.composite);
  // The heaviest-weighted signal is listed first by the API; its detail line is
  // the most useful single sentence we can show in this much space.
  const headline = data.signals[0]?.detail ?? null;

  return (
    <Link
      href="/tools/market-mood"
      className={cn(
        'group block rounded-xl border border-border/50 bg-card/40 px-4 py-3.5',
        'transition-colors duration-200 hover:border-border',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-muted-foreground">Market mood</span>
        <ArrowUpRight
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/70"
          aria-hidden
        />
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold leading-none tabular-nums" style={{ color }}>
          {data.composite}
        </span>
        <span className="text-[11px] text-muted-foreground/45">/100</span>
        <span
          className="text-sm font-semibold"
          style={{ color }}
        >
          {data.label}
        </span>
      </div>

      {/* Position on the fear→greed spectrum. The track is a neutral ramp and
          the marker is the only coloured mark, so the reading is the position
          rather than the hue. */}
      <div
        className="relative mt-3 h-1.5 rounded-full bg-foreground/8"
        role="meter"
        aria-valuenow={data.composite}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Market mood: ${data.label}, ${data.composite} out of 100`}
      >
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
          style={{ left: `${data.composite}%`, backgroundColor: color }}
        />
      </div>

      {headline && (
        <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/70">
          {headline}
        </p>
      )}
    </Link>
  );
}
