'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, HelpCircle } from 'lucide-react';
import { ProBadge } from '@/components/billing/ProBadge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ALLOCATION_COLORS } from '@/lib/charts/allocation-colors';
import { concentrationRead } from '@/lib/institutions/allocation';
import { FundAvatar } from './FundAvatar';
import { Filing13FDisclaimer } from './Filing13FDisclaimer';
import type { InstitutionalFundSummary } from '@/app/api/institutions/route';
import type { ConcentrationRead } from '@/lib/institutions/allocation';

const FUNDS_QUERY = {
  queryKey: ['institutions-fund-list'] as const,
  queryFn: async (): Promise<{ success: boolean; funds: InstitutionalFundSummary[] }> => {
    const res = await fetch('/api/institutions');
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    return res.json();
  },
  staleTime: 10 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
};

/** "2026-06-30" to "Q2 2026" — the quarter a filing covers is what a reader
 *  actually wants here; the exact filed date is detail, kept in a tooltip. */
function formatQuarter(iso: string | null): string | null {
  if (!iso) return null;
  const [year, month] = iso.split('-').map(Number);
  if (!year || !month) return null;
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

function formatFiledDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Three quarters past the period end, a "latest" filing is no longer a
 *  current picture of the fund — several tracked funds' newest 13F on record
 *  is years old, and a card that shows the quarter in the same tone as a
 *  fresh one reads as current holdings when it isn't. */
const STALE_AFTER_DAYS = 270;

function isStaleQuarter(periodIso: string | null): boolean {
  if (!periodIso) return false;
  const ageMs = Date.now() - new Date(`${periodIso}T00:00:00Z`).getTime();
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Four dots reading how concentrated the fund is, so "7166 positions" lands as
 * a shape instead of a number a beginner has to calibrate against nothing. The
 * word label carries the same meaning, so this never depends on color or on
 * counting dots, and both come off the same concentrationRead() tier -- the
 * dot count is never set independently of the word.
 *
 * "Concentrated" and "Very broad" are our vocabulary, not something a beginner
 * arrives already knowing, so the whole thing is a popover trigger explaining
 * the tier in one sentence. A Popover rather than a Tooltip because this has
 * to open on a tap: Radix tooltips are hover/focus only, and this sits on a
 * card grid people mostly meet on a phone.
 */
function ConcentrationDots({ read, color }: { read: ConcentrationRead; color: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // The card is one big link behind this row, so a click here must not
          // also navigate to the fund.
          onClick={(e) => e.stopPropagation()}
          aria-label={`What "${read.label}" means`}
          className="group/conc relative z-10 -mx-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-[3px]" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={
                  i < read.filled
                    ? { backgroundColor: color }
                    : { backgroundColor: 'var(--muted-foreground)', opacity: 0.25 }
                }
              />
            ))}
          </span>
          {read.label}
          <HelpCircle
            className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover/conc:opacity-90"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      {/* Opens downward: anchored to the top it covered the card's own name,
          which is the one thing you need to still see. Radix flips it back up
          on the bottom row. */}
      <PopoverContent side="bottom" align="start" sideOffset={6} className="w-64 p-3">
        <p className="text-xs font-semibold text-foreground">{read.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{read.blurb}</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Discover entry point for the institutional 13F holdings tracker. Every
 * card here is free teaser data (fund name, manager, quarter, concentration
 * shape) — same shape WeeklyPickHero uses for its always-visible summary. The
 * gate is entirely on the destination: clicking through to
 * /discover/institutions/[slug] is where a non-Pro viewer sees the paywall,
 * not here (mirrors WeeklyPickHero's "locked-ness is advisory here,
 * enforcement happens on the destination" pattern — there's no client-side
 * tier check anywhere else in this app to intercept the click with).
 *
 * Each card gets a color from the shared allocation palette, assigned by
 * position in the (stable, sort_order'd) list, and carried through to the
 * fund's detail page so arriving there reads as the same fund. It is spent on
 * the concentration dots and the initials only: tinting every card and haloing
 * every avatar made the grid read as decoration rather than as a dozen funds,
 * and the color means nothing beyond "not the one next to it".
 */
export function InstitutionalHoldingsSection() {
  const { data, isLoading, error } = useQuery(FUNDS_QUERY);

  if (isLoading) return <SectionSkeleton />;
  if (error || !data?.funds?.length) return null;

  return (
    <section aria-labelledby="institutional-holdings-heading" className="mt-12 mb-10">
      <div className="flex items-end justify-between mb-1 gap-3">
        <div className="flex items-center gap-2">
          <h2
            id="institutional-holdings-heading"
            className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
          >
            Institutional Holdings
          </h2>
          <ProBadge />
        </div>
      </div>
      <div className="mb-3">
        <Filing13FDisclaimer compact />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.funds.map((fund, i) => {
          const color = ALLOCATION_COLORS[i % ALLOCATION_COLORS.length];
          const concentration = concentrationRead(
            fund.totalPositions,
            fund.topHoldingPct,
            fund.top5Pct
          );
          const quarter = formatQuarter(fund.lastPeriodOfReport);
          const filed = formatFiledDate(fund.lastFiledDate);
          const stale = isStaleQuarter(fund.lastPeriodOfReport);

          // The whole card is the link, but the concentration label inside it
          // is its own button, and a <button> may not live inside an <a>. So
          // the link is a transparent overlay across the card and the label
          // sits above it, rather than the card being one big <a>.
          return (
            <div
              key={fund.slug}
              className="group relative flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-card/70 active:translate-y-0 active:scale-[0.99] focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background"
            >
              <Link
                href={`/discover/institutions/${fund.slug}`}
                aria-label={fund.displayName}
                className="absolute inset-0 z-0 rounded-xl focus:outline-none"
              />
              <FundAvatar
                displayName={fund.displayName}
                size={40}
                accentColor={color}
                logoUrl={fund.logoUrl}
              />
              <div className="min-w-0 flex-1">
                {/* Wraps to a second line rather than truncating. There is
                    vertical room, and "ARK Investment Management …" read like
                    a rendering bug rather than a shortened name. */}
                <p className="font-medium leading-snug text-foreground">{fund.displayName}</p>
                <p className="truncate text-xs text-muted-foreground/85">{fund.managerName ?? ' '}</p>
                <p
                  className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground/70"
                  title={filed ? `${fund.totalPositions ?? '?'} positions · filed ${filed}` : undefined}
                >
                  {concentration ? (
                    <ConcentrationDots read={concentration} color={color} />
                  ) : (
                    'Filing not yet ingested'
                  )}
                  {quarter && concentration && (
                    <>
                      <span aria-hidden>·</span>
                      <span className={`font-mono tabular-nums ${stale ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                        {quarter}
                      </span>
                      {stale && <span className="text-amber-600 dark:text-amber-400">Outdated</span>}
                    </>
                  )}
                </p>
              </div>
              <ArrowUpRight
                className="h-4 w-4 shrink-0 self-start text-muted-foreground/50 transition-colors group-hover:text-foreground"
                aria-hidden
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SectionSkeleton() {
  return (
    <section className="mt-12 mb-10" aria-hidden>
      <div className="mb-1 h-3.5 w-52 rounded animate-shimmer" />
      <div className="mb-3 h-3 w-80 max-w-full rounded animate-shimmer" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[88px] rounded-xl border border-border/30 animate-shimmer" />
        ))}
      </div>
    </section>
  );
}
