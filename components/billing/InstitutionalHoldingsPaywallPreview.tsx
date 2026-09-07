'use client';

/**
 * Fabricated mini holdings-table visual used purely as a paywall teaser —
 * same posture as RiskAnalysisPaywallPreview: the dialog has no access to a
 * real result for an anonymous/free caller (the holdings route 403s before
 * any real data leaves the server), so the numbers here stay fabricated and
 * blurred on purpose rather than risk showing something real-looking that's
 * wrong. When a real fund name is known at the trigger site, an unblurred
 * "Berkshire Hathaway's Q2 2026 holdings" line leads the preview — that
 * part is true, it's just metadata already public in the free fund list.
 */
interface Props {
  fundName?: string;
}

const MOCK_ROWS = [
  { symbol: 'AAPL', pct: 22.0 },
  { symbol: 'AXP', pct: 17.1 },
  { symbol: 'KO', pct: 10.9 },
];

export function InstitutionalHoldingsPaywallPreview({ fundName }: Props) {
  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      {fundName && (
        <p className="mb-3 text-left text-xs font-medium text-foreground">{fundName}&apos;s full holdings</p>
      )}
      <div className="pointer-events-none space-y-2 opacity-70 blur-[3px]">
        {MOCK_ROWS.map((row) => (
          <div key={row.symbol} className="flex items-center justify-between text-sm">
            <span className="font-mono font-semibold text-foreground">{row.symbol}</span>
            <span className="font-mono tabular-nums text-muted-foreground">{row.pct.toFixed(1)}%</span>
          </div>
        ))}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/3 rounded-full bg-primary" />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />

      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">
        Preview
      </span>
    </div>
  );
}
