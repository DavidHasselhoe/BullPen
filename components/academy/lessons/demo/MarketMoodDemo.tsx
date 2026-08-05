'use client';

import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MoodHero, SignalCard, MoodSkeleton } from '@/components/market/MarketMoodDisplay';
import type { MarketMoodData } from '@/app/api/market/mood/route';
import { DemoSurfaceShell } from './DemoSurfaceShell';

interface Props {
  onClose: () => void;
  children: ReactNode;
}

/**
 * Market Mood demo: mounts the REAL Market Mood tool, public live data with no
 * user entanglement, so the learner sees an actual Fear & Greed composite and
 * its signals update live. View-only, no required action, matching
 * PortfolioDemo's shape rather than ScreenerDemo/DividendDemo's gated ones.
 */
export function MarketMoodDemo({ onClose, children }: Props) {
  const { data, isLoading } = useQuery<MarketMoodData>({
    queryKey: ['academy-market-mood-demo'],
    queryFn: async () => {
      const res = await fetch('/api/market/mood');
      if (!res.ok) throw new Error('Failed to load market mood');
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  return (
    <DemoSurfaceShell eyebrow="Demo · Reading market sentiment" title="Market Mood" onClose={onClose}>
      <p className="mb-6 text-sm text-muted-foreground">
        This is BullPen&apos;s real Market Mood tool, a live composite of market signals that
        gauge fear and greed across the market right now.
      </p>

      {isLoading || !data ? (
        <MoodSkeleton />
      ) : (
        <div className="space-y-10">
          <MoodHero score={data.composite} label={data.label} animated />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.signals.map((signal) => (
              <SignalCard key={signal.name} signal={signal} />
            ))}
          </div>
        </div>
      )}

      {children}
    </DemoSurfaceShell>
  );
}
