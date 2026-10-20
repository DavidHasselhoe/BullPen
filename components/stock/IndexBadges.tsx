'use client';

import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { IndexId } from '@/lib/market-data/index-membership';

const KEYS: Record<IndexId, { label: string; tip: string }> = {
  sp500: { label: 'indexBadgeSp500', tip: 'indexBadgeSp500Tip' },
  nasdaq100: { label: 'indexBadgeNasdaq100', tip: 'indexBadgeNasdaq100Tip' },
  dow30: { label: 'indexBadgeDow30', tip: 'indexBadgeDow30Tip' },
};

/** "S&P 500", "Nasdaq-100", "Dow 30" beside the sector line, each explained in a sentence. */
export function IndexBadges({ indices }: { indices: IndexId[] }) {
  const { t } = useTranslation('stock');
  if (indices.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={t('indexBadgesLabel')}>
      {indices.map((id) => (
        <li key={id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t(KEYS[id].label)}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{t(KEYS[id].tip)}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
