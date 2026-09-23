'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CongressTradeRow } from '@/app/api/congress/recent/route';

const TRADES_QUERY = {
  queryKey: ['congress-recent-trades'] as const,
  queryFn: async (): Promise<{ success: boolean; trades: CongressTradeRow[] }> => {
    const res = await fetch('/api/congress/recent');
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    return res.json();
  },
  staleTime: 30 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  refetchOnWindowFocus: false,
};

/**
 * '$500,001 - $1,000,000' to '$500K - $1M'.
 *
 * Shortens the bracket without inventing one. The two ends stay two ends:
 * a filing discloses a range, so collapsing it to a midpoint would put a
 * number on screen that nobody actually filed. Falls back to the raw filed
 * string whenever the bounds are missing, so the reader always sees the
 * bracket as filed rather than nothing.
 */
function formatRange(low: number | null, high: number | null, raw: string): string {
  if (low == null || high == null) return raw;
  return `${compact(low)} - ${compact(high)}`;
}

function compact(n: number): string {
  // Brackets are filed at .001 boundaries ($15,001, $500,001). Rounding to the
  // nearest thousand is what makes '$500,001' read as '$500K' rather than
  // '$500.001K', and never crosses into the next bracket.
  const rounded = Math.round(n / 1000) * 1000;
  if (rounded >= 1_000_000) {
    const m = rounded / 1_000_000;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (rounded >= 1000) return `$${Math.round(rounded / 1000)}K`;
  return `$${rounded.toLocaleString('en-US')}`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const PARTY_LABEL: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };

/** Party is shown as a neutral letter, not a colored chip. Signal Emerald and
 *  Signal Red mean gain and loss everywhere else in the app, and red/blue
 *  party coloring would both collide with that and editorialise a feed whose
 *  whole point is that it only reports what was filed. */
function partyLine(t: CongressTradeRow): string {
  return [t.party ? (PARTY_LABEL[t.party] ?? t.party) : null, t.chamber, t.state]
    .filter(Boolean)
    .join(' · ');
}

/** A row the section will actually render: the API filters to equities, and
 *  this narrows the type so the ticker link can't be built from a null. */
type TickerTrade = CongressTradeRow & { symbol: string };

function TradeRowItem({ t }: { t: TickerTrade }) {
  const isBuy = t.tradeType.toLowerCase() === 'buy';
  const isSell = t.tradeType.toLowerCase() === 'sell';
  const Icon = isBuy ? ArrowUpRight : isSell ? ArrowDownRight : Clock;

  // Buys and sells reuse the chart markers' emerald/red, but the word is
  // always present too — gain/loss colour must never be the only carrier of
  // meaning (PRODUCT.md), and red-green colourblindness is common here.
  const actionLabel = isBuy ? 'Bought' : isSell ? 'Sold' : t.tradeType;
  const actionTone = isBuy
    ? 'text-emerald-400 bg-emerald-400/10'
    : isSell
      ? 'text-red-400 bg-red-400/10'
      : 'text-muted-foreground bg-muted/50';

  const traded = formatDate(t.transactionDate);

  return (
    <li className="flex items-start gap-3 border-b border-border/50 py-3 last:border-b-0">
      {/* Fixed width so the ticker column lines up: 'Bought' and 'Sold' are
          different lengths, and a ragged left edge makes a dense list of
          numbers much harder to scan down. */}
      <span
        className={cn(
          'mt-0.5 inline-flex w-[5.25rem] shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium',
          actionTone,
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {actionLabel}
      </span>

      {/* Two stacked lines rather than three side-by-side columns. At 375px a
          third column squeezed the company name to 'Blo…' and wrapped the
          member's name down four lines; stacking lets each line use the full
          width and degrade by dropping detail instead of shredding it. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <Link
              href={`/stock/${t.symbol}`}
              className="shrink-0 rounded-sm font-mono text-sm font-semibold tabular-nums text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.symbol}
            </Link>
            {/* clamp-ok: company name beside its ticker — the ticker carries
                the identity, the full name is in the title. Hidden outright on
                phones, where there is no width for it to be readable at all. */}
            <span
              className="hidden truncate text-xs text-muted-foreground sm:inline"
              title={t.assetDescription}
            >
              {t.assetDescription}
            </span>
          </div>
          <p className="shrink-0 font-mono text-sm tabular-nums text-foreground">
            {formatRange(t.amountLow, t.amountHigh, t.amountRange)}
          </p>
        </div>

        <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <p className="min-w-0">
            <span className="font-medium text-foreground/80">{t.politicianName}</span>
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            {partyLine(t)}
          </p>
          <p className="shrink-0 tabular-nums">
            {traded}
            {t.daysToDisclose != null && (
              <span className={cn('ml-1.5', t.filedLate && 'text-amber-400')}>
                {t.filedLate
                  ? `filed ${t.daysToDisclose}d late`
                  : `filed ${t.daysToDisclose}d later`}
              </span>
            )}
          </p>
        </div>
      </div>
    </li>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/50 py-3">
          <div className="h-6 w-16 shrink-0 animate-pulse rounded-md bg-muted/60" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-40 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-56 animate-pulse rounded bg-muted/40" />
          </div>
          <div className="h-3.5 w-20 shrink-0 animate-pulse rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

export function CongressTradesSection() {
  const { data, isLoading, error } = useQuery(TRADES_QUERY);

  // Belt and braces: the route already filters to rows with a ticker, but a
  // null slipping through would render a link to /stock/null.
  const trades = useMemo(
    () => (data?.trades ?? []).filter((t): t is TickerTrade => t.symbol != null),
    [data],
  );

  if (error) return null;
  if (!isLoading && trades.length === 0) return null;

  return (
    <section aria-labelledby="congress-trades-heading" className="mt-12 mb-10">
      <div className="mb-1 flex items-end justify-between gap-3">
        <h2
          id="congress-trades-heading"
          className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
        >
          Congress Trading
        </h2>
      </div>

      <p className="mb-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        Stock trades disclosed by members of Congress under the STOCK Act. Members file within 45
        days of trading, so this is a record of what was reported, not a live feed. Amounts are the
        ranges Congress requires, not exact figures.
      </p>

      {isLoading ? (
        <SectionSkeleton />
      ) : (
        <ul className="rounded-xl border border-border/60 px-4">
          {trades.map((t) => (
            <TradeRowItem key={t.id} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}
