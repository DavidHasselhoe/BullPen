'use client';

import { useTranslation } from 'react-i18next';
import { IndexStrip } from './IndexStrip';
import { MoodCompact } from './MoodCompact';
import type { IndexQuote } from '@/lib/discover/discover-config';

/**
 * The ten-second read: what the major indices did today, and how the market
 * feels while doing it. Everything below this on the page is progressively
 * more work to consume, so this band has to stand on its own.
 */
export function MarketPulse({ indices }: { indices: IndexQuote[] }) {
  const { t } = useTranslation('discover');
  return (
    <section aria-labelledby="pulse-heading" className="mb-10">
      <h2
        id="pulse-heading"
        className="mb-3 text-lg font-semibold tracking-tight text-foreground"
      >
        {t('marketPulseHeading')}
      </h2>

      {/* Flex rather than a 3fr/1fr grid: when the mood read is unavailable its
          tile renders nothing, and the grid kept an empty quarter-width column. */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 lg:flex-[3]">
          <IndexStrip indices={indices} />
        </div>
        <MoodCompact />
      </div>
    </section>
  );
}
