'use client';

/**
 * Teaser behind the Institutional Holdings paywall.
 *
 * With `rows` (the fund page passes its public teaser: the real top three),
 * those are shown as they are, since the page above already shows them. With
 * no rows, the preview is shape only: bars, no tickers, no percentages. It
 * used to draw Berkshire's real top three under every fund's name, which on
 * Citadel's page claimed Citadel held 22% Apple.
 */
interface Props {
  fundName?: string;
  rows?: { symbol: string | null; name: string; pct: number }[];
}

const PLACEHOLDER_WIDTHS = ['w-2/3', 'w-1/2', 'w-1/3'];

export function InstitutionalHoldingsPaywallPreview({ fundName, rows }: Props) {
  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      {fundName && (
        <p className="mb-3 text-left text-xs font-medium text-foreground">{fundName}&apos;s full holdings</p>
      )}
      {rows && rows.length > 0 ? (
        <div className="pointer-events-none space-y-2">
          {rows.map((row) => (
            <div key={row.symbol ?? row.name} className="flex items-center justify-between text-sm">
              <span className="font-mono font-semibold text-foreground">{row.symbol ?? row.name}</span>
              <span className="font-mono tabular-nums text-muted-foreground">{row.pct.toFixed(1)}%</span>
            </div>
          ))}
          <div className="space-y-2 pt-1 opacity-60 blur-[3px]">
            {PLACEHOLDER_WIDTHS.map((w) => (
              <div key={w} className={`h-3 rounded bg-muted ${w}`} />
            ))}
          </div>
        </div>
      ) : (
        <div className="pointer-events-none space-y-2.5 opacity-70 blur-[2px]">
          {PLACEHOLDER_WIDTHS.map((w) => (
            <div key={w} className="flex items-center justify-between gap-6">
              <div className={`h-3 rounded bg-muted ${w}`} />
              <div className="h-3 w-10 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />
    </div>
  );
}
