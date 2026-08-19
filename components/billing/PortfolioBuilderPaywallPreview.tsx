'use client';

/**
 * Static, fabricated suggested allocation used purely as a paywall teaser
 * for AI Portfolio Builder. Never a real recommendation.
 */
const MOCK_ROWS: { symbol: string; name: string; pct: number }[] = [
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', pct: 40 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', pct: 18 },
  { symbol: 'AVGO', name: 'Broadcom Inc.', pct: 12 },
];

export function PortfolioBuilderPaywallPreview() {
  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      <div className="pointer-events-none opacity-70 blur-[3px]">
        <p className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggested allocation</p>
        <div className="mt-3 space-y-2.5">
          {MOCK_ROWS.map((r) => (
            <div key={r.symbol} className="flex items-center gap-3 text-left">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{r.symbol}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{r.pct}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top fade keeps the dialog's close button legible over the preview. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent" />
      {/* Bottom fade blends the preview into the content below it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />

      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">
        Preview
      </span>
    </div>
  );
}
