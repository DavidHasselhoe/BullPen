'use client';

import { useTranslation } from 'react-i18next';

/**
 * Filing-lag disclaimer for congressional and executive-branch disclosures.
 *
 * One shared component for both placements (the Discover section teaser and
 * the member page above the trades) so the copy cannot drift between them —
 * the same reason Filing13FDisclaimer exists for the 13F side. Rendered
 * inline rather than in a footer: it belongs where the data is actually being
 * read, and the member pages are publicly crawlable, so a reader can arrive
 * on one without ever passing the Discover section.
 */
export function DisclosureNote({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('discover');
  return (
    <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
      {t(compact ? 'congDisclosureCompact' : 'congDisclosureFull')}
    </p>
  );
}
