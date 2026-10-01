'use client';

import { useTranslation } from 'react-i18next';

/**
 * 13F data-lag disclaimer — one shared component for both placements
 * (Discover section teaser, drill-down page above the holdings table) so
 * the copy can't drift out of sync between them. Rendered inline, not
 * footer-only: the point is to sit where the data is actually being read.
 */
export function Filing13FDisclaimer({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('discover');
  if (compact) {
    return (
      <p className="max-w-prose text-xs text-muted-foreground">
        {t('instDisclaimerCompact')}
      </p>
    );
  }

  return (
    <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
      {t('instDisclaimerFull')}
    </p>
  );
}
