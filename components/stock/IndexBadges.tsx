'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { IndexId } from '@/lib/market-data/index-membership';
import type { IndexBadgeFact } from '@/lib/market-data/index-events';

const KEYS: Record<IndexId, { label: string; tip: string }> = {
  sp500: { label: 'indexBadgeSp500', tip: 'indexBadgeSp500Tip' },
  nasdaq100: { label: 'indexBadgeNasdaq100', tip: 'indexBadgeNasdaq100Tip' },
  dow30: { label: 'indexBadgeDow30', tip: 'indexBadgeDow30Tip' },
};

/**
 * "S&P 500", "Nasdaq-100", "Dow 30" beside the sector line, each explained in a
 * sentence, plus when it joined (last ~90 days, to the week) and its weight with
 * the date that weight is from (lib/market-data/index-events.ts). Each opens
 * its index page (app/discover/indexes/[id]).
 */
export function IndexBadges({ indices, facts = {} }: { indices: IndexId[]; facts?: Partial<Record<IndexId, IndexBadgeFact>> }) {
  const { t, i18n } = useTranslation('stock');
  if (indices.length === 0) return null;
  // Date-only values, so pinned to UTC: no zone may move them a day.
  const day = (ymd: string) =>
    new Date(`${ymd}T12:00:00Z`).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={t('indexBadgesLabel')}>
      {indices.map((id) => {
        const index = t(KEYS[id].label);
        const fact = facts[id];
        return (
          <li key={id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/discover/indexes/${id}`}
                  className="inline-flex min-h-6 items-center rounded-full border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {index}
                </Link>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 space-y-1">
                <p>{t(KEYS[id].tip)}</p>
                {fact?.joinedWeekOf && <p>{t('indexJoinedTip', { index, date: day(fact.joinedWeekOf) })}</p>}
                {fact?.weightPct != null && fact.weightAsOf && (
                  <p>
                    {t('indexWeightTip', {
                      index,
                      pct: new Intl.NumberFormat(i18n.language, { style: 'percent', maximumSignificantDigits: 2 }).format(fact.weightPct / 100),
                      date: day(fact.weightAsOf),
                    })}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
