'use client';

/**
 * The fund's holdings as weighted bar rows rather than a spreadsheet. Bar
 * length is the position's size relative to the fund's largest holding, and
 * each of the top rows carries the same color as its wedge in the donut above
 * (both read from one buildAllocation() call), so the two visuals are one
 * connected system rather than two separate charts of the same numbers.
 *
 * Only the top holdings get a detail row. The tail collapses into a single
 * summary row — for a fund like Citadel that tail is 7000+ positions, so it
 * also expands in pages rather than mounting every row at once.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { fmtShares, fmtUsd } from '@/lib/institutions/format';
import type { Allocation, AllocationEntry } from '@/lib/institutions/allocation';
import type { HoldingsDiff } from '@/lib/institutions/compute-diff';

/** Rows revealed per "show more" step once the tail is expanded. */
const REST_PAGE_SIZE = 50;
/** Smallest bar width, so a rounding-error position is still visibly a bar. */
const MIN_BAR_PCT = 1.5;

interface QoqChange {
  changePct?: number;
  isNew?: boolean;
}

function QoqBadge({ changePct, isNew }: QoqChange) {
  if (isNew) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        New
      </span>
    );
  }
  if (changePct == null) return null;
  const up = changePct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 font-mono text-xs tabular-nums ${
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      }`}
      title={`${up ? 'Increased' : 'Reduced'} ${Math.abs(changePct).toFixed(1)}% since last quarter`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {up ? '+' : ''}
      {changePct.toFixed(1)}%
    </span>
  );
}

interface HoldingRowProps {
  entry: AllocationEntry;
  /** Largest holding's pct, so bars share one scale across the whole list. */
  maxPct: number;
  change: QoqChange;
  /** Highlighted from the donut above. Marked by lighting this row up, never
   *  by dimming the others: with a list this long, a cursor drifting across it
   *  would otherwise strobe the whole page in and out. */
  highlighted: boolean;
  onHighlight: (key: string | null) => void;
}

function HoldingRow({ entry, maxPct, change, highlighted, onHighlight }: HoldingRowProps) {
  const barPct = Math.max(MIN_BAR_PCT, maxPct > 0 ? (entry.pct / maxPct) * 100 : 0);

  return (
    <li
      className={`px-4 py-3 transition-colors duration-150 hover:bg-muted/25 ${highlighted ? 'bg-muted/25' : ''}`}
      onMouseEnter={() => onHighlight(entry.key)}
      onMouseLeave={() => onHighlight(null)}
    >
      <div className="flex items-center gap-3">
        {entry.symbol ? (
          <CompanyLogo ticker={entry.symbol} name={entry.name} size={28} />
        ) : (
          <span
            className="h-[28px] w-[28px] shrink-0 rounded-full"
            style={{ backgroundColor: entry.color, opacity: 0.35 }}
            aria-hidden
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {entry.symbol ? (
              <Link
                href={`/stock/${entry.symbol}`}
                className="shrink-0 font-mono text-sm font-semibold text-foreground transition-colors hover:text-primary"
              >
                {entry.symbol}
              </Link>
            ) : (
              <span className="shrink-0 truncate text-sm text-foreground">{entry.name}</span>
            )}
            {/* The issuer name is the first thing dropped as width tightens:
                the logo and ticker already say which company this is, while a
                dollar figure clipped mid-number ("$51.2…") is just wrong. */}
            <span className="hidden min-w-0 truncate text-xs text-muted-foreground/75 sm:inline">
              {entry.symbol && entry.name}
            </span>
            <span className="ml-auto shrink-0 pl-2 font-mono text-xs tabular-nums text-muted-foreground/75">
              {fmtUsd(entry.valueUsd)}
              <span className="hidden lg:inline"> &middot; {fmtShares(entry.shares)}</span>
            </span>
            <QoqBadge {...change} />
            <span className="w-[4.5rem] shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
              {entry.pct.toFixed(2)}%
            </span>
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full"
              style={{ width: `${barPct}%`, backgroundColor: entry.color }}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

interface HoldingsBarListProps {
  allocation: Allocation;
  diff?: HoldingsDiff | null;
  highlightedKey: string | null;
  onHighlight: (key: string | null) => void;
}

export function HoldingsBarList({ allocation, diff, highlightedKey, onHighlight }: HoldingsBarListProps) {
  const [expanded, setExpanded] = useState(false);
  const [visibleRest, setVisibleRest] = useState(REST_PAGE_SIZE);

  const changeByCusip = new Map<string, number>();
  for (const h of diff?.increased ?? []) changeByCusip.set(h.cusip, h.valueChangePct);
  for (const h of diff?.decreased ?? []) changeByCusip.set(h.cusip, h.valueChangePct);
  const newCusips = new Set(diff?.newPositions.map((h) => h.cusip) ?? []);

  const changeFor = (key: string): QoqChange => ({
    changePct: changeByCusip.get(key),
    isNew: newCusips.has(key),
  });

  const maxPct = allocation.top[0]?.pct ?? 0;
  const shownRest = expanded ? allocation.rest.slice(0, visibleRest) : [];
  const hiddenRestCount = allocation.rest.length - shownRest.length;
  const exited = diff?.exited ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-border/50">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">Holding</span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
          % of portfolio
        </span>
      </div>

      <ul className="divide-y divide-border/30">
        {allocation.top.map((entry) => (
          <HoldingRow
            key={entry.key}
            entry={entry}
            maxPct={maxPct}
            change={changeFor(entry.key)}
            highlighted={highlightedKey === entry.key}
            onHighlight={onHighlight}
          />
        ))}

        {shownRest.map((entry) => (
          <HoldingRow
            key={entry.key}
            entry={entry}
            maxPct={maxPct}
            change={changeFor(entry.key)}
            highlighted={highlightedKey === entry.key}
            onHighlight={onHighlight}
          />
        ))}
      </ul>

      {allocation.rest.length > 0 && (
        <div className="border-t border-border/30">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                <ChevronDown className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm text-foreground/85">
                {allocation.rest.length.toLocaleString()} more position
                {allocation.rest.length === 1 ? '' : 's'}
                <span className="ml-2 text-xs text-muted-foreground/75">
                  <span className="font-mono tabular-nums">{fmtUsd(allocation.restValue)}</span>
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                {allocation.restPct.toFixed(2)}%
              </span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setVisibleRest(REST_PAGE_SIZE);
                }}
                className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Show less
              </button>
              {hiddenRestCount > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleRest((n) => n + REST_PAGE_SIZE)}
                  className="rounded-md text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Show {Math.min(REST_PAGE_SIZE, hiddenRestCount)} more
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    ({hiddenRestCount.toLocaleString()} left)
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {exited.length > 0 && (
        <div className="border-t border-border/50 bg-muted/10">
          <p className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
            Sold since last quarter
          </p>
          <ul className="divide-y divide-border/20">
            {exited.map((h) => (
              <li key={`exited-${h.cusip}`} className="flex items-center gap-3 px-4 py-2.5">
                {h.symbol ? (
                  <CompanyLogo ticker={h.symbol} name={h.nameOfIssuer} size={22} />
                ) : (
                  <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-muted/60" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {h.symbol ? (
                    <Link
                      href={`/stock/${h.symbol}`}
                      className="font-mono font-semibold text-foreground/70 transition-colors hover:text-primary"
                    >
                      {h.symbol}
                    </Link>
                  ) : (
                    h.nameOfIssuer
                  )}
                  {h.symbol && <span className="ml-2 text-xs text-muted-foreground/70">{h.nameOfIssuer}</span>}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
                  was {fmtUsd(h.valueUsd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
