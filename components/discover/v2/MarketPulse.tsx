'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { IndexStrip } from './IndexStrip';
import { MoodCompact } from './MoodCompact';
import type { IndexQuote } from '@/lib/discover/discover-config';

const INDEX_PAGES = ['sp500', 'nasdaq100', 'dow30'] as const;

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
          {/* The tiles open the funds; these open what the funds hold. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            <span>{t('marketPulseInsideLabel')}</span>
            {INDEX_PAGES.map((id, i) => (
              <span key={id}>
                <Link
                  href={`/discover/indexes/${id}`}
                  className="inline-flex min-h-6 items-center font-medium text-foreground/80 underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
                >
                  {t(`indexName_${id}`)}
                </Link>
                {i < INDEX_PAGES.length - 1 && <span aria-hidden>,</span>}
              </span>
            ))}
          </p>
        </div>
        <MoodCompact />
      </div>
    </section>
  );
}
