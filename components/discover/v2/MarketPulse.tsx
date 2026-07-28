'use client';

import { IndexStrip } from './IndexStrip';
import { MoodCompact } from './MoodCompact';
import type { IndexQuote } from '@/lib/discover/discover-config';

/**
 * The ten-second read: what the major indices did today, and how the market
 * feels while doing it. Everything below this on the page is progressively
 * more work to consume, so this band has to stand on its own.
 */
export function MarketPulse({ indices }: { indices: IndexQuote[] }) {
  return (
    <section aria-labelledby="pulse-heading" className="mb-10">
      <h2
        id="pulse-heading"
        className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
      >
        Market pulse
      </h2>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <IndexStrip indices={indices} />
        <MoodCompact />
      </div>
    </section>
  );
}
