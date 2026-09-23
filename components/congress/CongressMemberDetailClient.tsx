'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Info } from 'lucide-react';
import { InstitutionalHoldingsPieChart } from '@/components/institutions/InstitutionalHoldingsPieChart';
import { buildAllocation } from '@/lib/institutions/allocation';
import { positionLine } from '@/lib/congress/member-list';
import { formatAmountRange, isFiledLate, tradeDirection } from '@/lib/congress/types';
import { cn } from '@/lib/utils';
import { PoliticianAvatar } from './PoliticianAvatar';
import type { CongressMemberDetail, CongressHoldingRow } from '@/app/api/congress/[slug]/route';
import type { CongressTradeRow } from '@/lib/congress/types';

type TradeFilter = 'all' | 'buy' | 'sell';

const FILTERS: { key: TradeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'buy', label: 'Buys' },
  { key: 'sell', label: 'Sells' },
];

function compactUsd(n: number): string {
  // Estimated values only (see migration 150) — rendered compactly on purpose.
  // "$53,300,729.38" would claim a precision that a chain of bracket midpoints
  // cannot support.
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
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

/**
 * Options positions, which are kept out of the allocation donut.
 *
 * Same rule buildAllocation already applies to 13F filings, and for the same
 * reason: an option's value is not comparable to a share position's, so
 * charting them together makes a bet on a stock read as owning the stock. It
 * matters more here, because the vendor gives no option fields on a position
 * at all, so we cannot even tell whether its value is the premium paid or the
 * notional it covers.
 *
 * Rare but high-impact: exactly one of 3,601 stored positions is an option,
 * and it is 69.7% of that member's book.
 */
function isOptionPosition(h: CongressHoldingRow): boolean {
  return /\b(call|put)\s+option/i.test(h.companyName ?? '');
}

/** Map an estimated congressional position onto the shape buildAllocation and
 *  the donut already speak. `cusip` is the allocation key, and a ticker is a
 *  stable one here; congressional filings have no CUSIP at all. */
function toDiffable(h: CongressHoldingRow) {
  return {
    cusip: h.symbol,
    putCall: null,
    symbol: h.symbol,
    nameOfIssuer: h.companyName ?? h.symbol,
    valueUsd: h.currentValue ?? 0,
    shares: h.estimatedShares ?? 0,
    portfolioPct: null,
  };
}

function TradeRow({ t }: { t: CongressTradeRow & { symbol: string } }) {
  const dir = tradeDirection(t.tradeType);
  const isBuy = dir === 'buy';
  const isSell = dir === 'sell';
  const Icon = isBuy ? ArrowUpRight : isSell ? ArrowDownRight : Info;
  const late = isFiledLate(t.daysToDisclose);

  return (
    <li className="flex items-start gap-3 border-b border-border/50 py-3 last:border-b-0">
      <span
        className={cn(
          'mt-0.5 inline-flex w-[5.25rem] shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium',
          isBuy
            ? 'bg-emerald-400/10 text-emerald-400'
            : isSell
              ? 'bg-red-400/10 text-red-400'
              : 'bg-muted/50 text-muted-foreground',
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {isBuy ? 'Bought' : isSell ? 'Sold' : t.tradeType}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <Link
              href={`/stock/${t.symbol}`}
              className="shrink-0 rounded-sm font-mono text-sm font-semibold tabular-nums text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.symbol}
            </Link>
            {/* clamp-ok: company name beside its ticker; hidden on phones
                where there is no width for it to be legible */}
            <span
              className="hidden truncate text-xs text-muted-foreground sm:inline"
              title={t.assetDescription}
            >
              {t.assetDescription}
            </span>
          </div>
          <p className="shrink-0 font-mono text-sm tabular-nums text-foreground">
            {formatAmountRange(t.amountLow, t.amountHigh, t.amountRange)}
          </p>
        </div>
        <p className="mt-0.5 text-right text-xs tabular-nums text-muted-foreground">
          {formatDate(t.transactionDate)}
          {t.daysToDisclose != null && (
            <span className={cn('ml-1.5', late && 'text-amber-400')}>
              {late ? `filed ${t.daysToDisclose}d late` : `filed ${t.daysToDisclose}d later`}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

export function CongressMemberDetailClient({ slug }: { slug: string }) {
  const [filter, setFilter] = useState<TradeFilter>('all');
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['congress-member', slug] as const,
    queryFn: async (): Promise<{ success: boolean; member: CongressMemberDetail }> => {
      const res = await fetch(`/api/congress/${slug}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const member = data?.member;

  const priced = useMemo(
    () => (member?.holdings ?? []).filter((h) => (h.currentValue ?? 0) > 0),
    [member],
  );

  const optionPositions = useMemo(() => priced.filter(isOptionPosition), [priced]);

  const allocation = useMemo(() => {
    const shares = priced.filter((h) => !isOptionPosition(h));
    return shares.length > 0 ? buildAllocation(shares.map(toDiffable)) : null;
  }, [priced]);

  const tradesWithTicker = useMemo(
    () =>
      (member?.trades ?? []).filter((t): t is CongressTradeRow & { symbol: string } => !!t.symbol),
    [member],
  );

  const counts = useMemo(
    () => ({
      all: tradesWithTicker.length,
      buy: tradesWithTicker.filter((t) => tradeDirection(t.tradeType) === 'buy').length,
      sell: tradesWithTicker.filter((t) => tradeDirection(t.tradeType) === 'sell').length,
    }),
    [tradesWithTicker],
  );

  const visibleTrades = useMemo(() => {
    if (filter === 'all') return tradesWithTicker;
    return tradesWithTicker.filter((t) => tradeDirection(t.tradeType) === filter);
  }, [tradesWithTicker, filter]);

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy>
        <div className="h-14 w-64 animate-pulse rounded bg-muted/60" />
        <div className="h-72 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
        <p className="text-sm text-foreground">We could not load this member right now.</p>
        <Link
          href="/discover"
          className="mt-3 inline-block text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Back to Discover
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/discover"
        className="mb-5 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Discover
      </Link>

      <header className="mb-6 flex items-center gap-4">
        <PoliticianAvatar displayName={member.displayName} slug={member.slug} size={64} />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight text-foreground">
            {member.displayName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{positionLine(member)}</p>
        </div>
      </header>

      {/* ---------------- Estimated portfolio ---------------- */}
      <section aria-labelledby="congress-holdings-heading" className="mb-10">
        <h2
          id="congress-holdings-heading"
          className="mb-1 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
        >
          Estimated portfolio
        </h2>

        {allocation ? (
          <>
            {/* The vendor's own caveat, stored with the snapshot it describes
                (migration 150) and shown above the chart rather than under it.
                These numbers are reconstructed from the midpoint of each filed
                bracket, so the chart is not the same class of fact as a 13F
                donut and must not be read as one. */}
            {member.holdingsDisclaimer && (
              <p className="mb-3 flex max-w-2xl items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{member.holdingsDisclaimer}</span>
              </p>
            )}
            <InstitutionalHoldingsPieChart
              allocation={allocation}
              totalValueUsd={allocation.total}
              highlightedKey={highlightedKey}
              onHighlight={setHighlightedKey}
              // Not a 13F. Calling a bracket-midpoint reconstruction the same
              // thing as a filed institutional value would be the exact
              // category error migration 150 warns about.
              centerLabel="Estimated value"
            />
            <ul className="mt-4 space-y-1.5">
              {allocation.top.map((h) => (
                <li
                  key={h.key}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/40"
                  onMouseEnter={() => setHighlightedKey(h.key)}
                  onMouseLeave={() => setHighlightedKey(null)}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: h.color }}
                    aria-hidden
                  />
                  <Link
                    href={`/stock/${h.symbol}`}
                    className="w-16 shrink-0 rounded-sm font-mono text-sm font-semibold tabular-nums text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {h.symbol}
                  </Link>
                  {/* clamp-ok: company name in a dense allocation row */}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={h.name}>
                    {h.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    ~{compactUsd(h.valueUsd)}
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                    {h.pct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>

            {/* Named rather than silently dropped. Excluding them from the
                chart is a valuation decision, not a reason to pretend the
                position is not there. */}
            {optionPositions.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Not shown above:{' '}
                  {optionPositions.map((h) => h.companyName ?? h.symbol).join(', ')}. Options are
                  left out of the allocation because their value is not comparable to a share
                  position, so charting them together would make a bet on a stock read as owning
                  it.
                </span>
              </p>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
            <p className="text-sm text-foreground">No position estimate for this member yet.</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
              Their disclosed trades are below. A portfolio estimate is built separately and has
              not been generated for them yet.
            </p>
          </div>
        )}
      </section>

      {/* ---------------- Disclosed trades ---------------- */}
      <section aria-labelledby="congress-trades-heading" className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2
            id="congress-trades-heading"
            className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
          >
            Disclosed trades
          </h2>

          <div className="flex items-center gap-1" role="group" aria-label="Filter trades">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filter === f.key
                    ? 'border-border bg-muted/60 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {f.label}
                <span className="font-mono text-xs tabular-nums text-muted-foreground/70">
                  {counts[f.key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {visibleTrades.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
            <p className="text-sm text-foreground">
              {filter === 'all'
                ? 'No disclosed stock trades for this member yet.'
                : `No ${filter === 'buy' ? 'buys' : 'sells'} in the trades we hold.`}
            </p>
          </div>
        ) : (
          <ul className="rounded-xl border border-border/60 px-4">
            {visibleTrades.map((t) => (
              <TradeRow key={t.id} t={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
