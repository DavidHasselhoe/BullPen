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

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { fmtShares, fmtUsd } from '@/lib/institutions/format';
import { useOwnedSymbols } from '@/hooks/use-owned-symbols';
import { buildStatusIndex } from '@/lib/institutions/compute-diff';
import type { Allocation, AllocationEntry } from '@/lib/institutions/allocation';
import type { HoldingChange, HoldingsDiff, HoldingStatus } from '@/lib/institutions/compute-diff';

/** Rows revealed per "show more" step once the tail is expanded. */
const REST_PAGE_SIZE = 50;
/** Smallest bar width, so a rounding-error position is still visibly a bar. */
const MIN_BAR_PCT = 1.5;

interface QoqChange {
  status: HoldingStatus;
  change?: HoldingChange;
}

/**
 * What the fund did with this position since last quarter. Silent when there
 * is no prior filing to compare against -- `hasDiff` is false for the first
 * quarter we ever tracked for a fund, and a row with no badge is correct there
 * rather than one claiming "Unchanged" against nothing.
 *
 * The tooltip carries the value move alongside the share move. That is what
 * makes an uncorrected stock split legible: shares +300% beside value +2% is
 * obviously a split, not a conviction buy (see compute-diff.ts).
 */
function QoqBadge({ status, change, hasDiff }: QoqChange & { hasDiff: boolean }) {
  if (!hasDiff) return null;

  if (status === 'new') {
    return (
      <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        New Buy
      </span>
    );
  }

  if (status === 'unchanged' || !change) {
    return (
      <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        Unchanged
      </span>
    );
  }

  const up = status === 'increased';
  const Icon = up ? TrendingUp : TrendingDown;
  const pct = change.sharesChangePct;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 font-mono text-xs tabular-nums ${
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      }`}
      title={
        `${up ? 'Increased' : 'Reduced'} shares ${Math.abs(pct).toFixed(1)}% since last quarter ` +
        `(value ${change.valueChangePct >= 0 ? '+' : ''}${change.valueChangePct.toFixed(1)}%)`
      }
    >
      <Icon className="h-3 w-3" aria-hidden />
      {up ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

interface HoldingRowProps {
  entry: AllocationEntry;
  /** False for the first quarter tracked for a fund: no prior filing to
   *  compare against, so every row's badge stays silent. */
  hasDiff: boolean;
  /** The signed-in user holds this ticker too. Always false when logged out. */
  owned: boolean;
  /** Largest holding's pct, so bars share one scale across the whole list. */
  maxPct: number;
  change: QoqChange;
  /** Highlighted from the donut above. Marked by lighting this row up, never
   *  by dimming the others: with a list this long, a cursor drifting across it
   *  would otherwise strobe the whole page in and out. */
  highlighted: boolean;
  onHighlight: (key: string | null) => void;
}

function HoldingRow({ entry, hasDiff, owned, maxPct, change, highlighted, onHighlight }: HoldingRowProps) {
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
            {owned && (
              <span
                className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none text-primary"
                title="This is in your portfolio"
              >
                You own this
              </span>
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
            <QoqBadge {...change} hasDiff={hasDiff} />
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

  // One index over the diff's arrays instead of three hand-built maps. The
  // status never travels over the wire -- see buildStatusIndex's comment.
  const { statusFor, changeFor: qoqChangeFor } = useMemo(() => buildStatusIndex(diff ?? null), [diff]);
  const hasDiff = !!diff;

  // Empty set for logged-out visitors and for anyone with no holdings, so no
  // row is marked and there is nothing to hide.
  const ownedSymbols = useOwnedSymbols();
  const isOwned = (symbol: string | null) => !!symbol && ownedSymbols.has(symbol.toUpperCase());

  const changeFor = (key: string): QoqChange => ({
    status: statusFor(key),
    change: qoqChangeFor(key),
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
            hasDiff={hasDiff}
            owned={isOwned(entry.symbol)}
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
            hasDiff={hasDiff}
            owned={isOwned(entry.symbol)}
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

      {/* Collapsed by default: these are positions the fund no longer holds,
          which is context for the list above rather than part of it, and an
          always-open second list reads as a wall (DESIGN.md 6). */}
      {exited.length > 0 && (
        <div className="border-t border-border/50 bg-muted/10">
          <Accordion type="single" collapsible>
            <AccordionItem value="exited" className="border-none">
              <AccordionTrigger className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground/70 hover:no-underline">
                Exited positions this quarter
                <span className="ml-2 font-mono normal-case tracking-normal text-muted-foreground/60">
                  {exited.length}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <ul className="divide-y divide-border/20 border-t border-border/20">
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
                        {h.symbol && (
                          <span className="ml-2 text-xs text-muted-foreground/70">{h.nameOfIssuer}</span>
                        )}
                      </span>
                      {/* Prior quarter's weight, not its dollar value: "was 4.3%
                          of the portfolio" says how much the fund cared about
                          this name in a way a raw figure does not. */}
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
                        {h.portfolioPct != null ? `was ${h.portfolioPct.toFixed(2)}%` : `was ${fmtUsd(h.valueUsd)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
}
