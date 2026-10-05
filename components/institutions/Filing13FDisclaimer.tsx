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

  // One line until asked: five always-open lines above the data pushed the
  // holdings down a fifth of a phone screen (DESIGN.md: explanation goes
  // behind a disclosure). Native <details>, so it needs no script.
  return (
    <details className="group max-w-prose text-xs text-muted-foreground">
      <summary className="cursor-pointer list-none underline-offset-4 hover:text-foreground hover:underline [&::-webkit-details-marker]:hidden">
        {t('instDisclaimerSummary')}
      </summary>
      <p className="mt-1.5 leading-relaxed">{t('instDisclaimerFull')}</p>
    </details>
  );
}
