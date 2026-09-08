/**
 * 13F data-lag disclaimer — one shared component for both placements
 * (Discover section teaser, drill-down page above the holdings table) so
 * the copy can't drift out of sync between them. Rendered inline, not
 * footer-only: the point is to sit where the data is actually being read.
 */
export function Filing13FDisclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-xs text-muted-foreground/80">
        Based on quarterly SEC 13F filings, disclosed up to 45 days after quarter-end. Excludes short positions, most options, and non-US holdings.
      </p>
    );
  }

  return (
    <p className="text-xs leading-relaxed text-muted-foreground/80">
      SEC rules allow up to 45 days&apos; lag between quarter-end and filing, and funds may seek confidential treatment
      for further delay on new positions. 13F filings disclose only US-listed equities, ETFs, and some options. They
      don&apos;t include short positions, cash, bonds, or most international holdings, so this is a partial picture of
      the fund&apos;s actual portfolio, not the whole thing.
    </p>
  );
}
