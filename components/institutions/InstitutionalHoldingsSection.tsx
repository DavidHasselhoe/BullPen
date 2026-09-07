'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { ProBadge } from '@/components/billing/ProBadge';
import { ALLOCATION_COLORS } from '@/lib/charts/allocation-colors';
import { concentrationFromPositionCount } from '@/lib/institutions/allocation';
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
 * counting dots.
 */
function ConcentrationDots({ read, color }: { read: ConcentrationRead; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
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
    </span>
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
 * position in the (stable, sort_order'd) list. It carries no meaning beyond
 * "this is a different fund than the one next to it" — which is the whole
 * point, since a grid of identical gray cards gives the eye nothing to
 * navigate by. Rendered as a background tint plus a glow behind the initials,
 * never a left-border stripe (DESIGN.md §6 rules those out).
 */
export function InstitutionalHoldingsSection() {
  const { data, isLoading, error } = useQuery(FUNDS_QUERY);

  if (isLoading) return <SectionSkeleton />;
  if (error || !data?.funds?.length) return null;

  return (
    <section aria-labelledby="institutional-holdings-heading" className="mb-10">
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
          const concentration = concentrationFromPositionCount(fund.totalPositions);
          const quarter = formatQuarter(fund.lastPeriodOfReport);
          const filed = formatFiledDate(fund.lastFiledDate);
          const stale = isStaleQuarter(fund.lastPeriodOfReport);

          return (
            <Link
              key={fund.slug}
              href={`/discover/institutions/${fund.slug}`}
              className="group flex items-center gap-3 rounded-xl border border-border/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:shadow-black/20 active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ backgroundColor: `${color}0f` }}
            >
              <FundAvatar
                displayName={fund.displayName}
                size={40}
                accentColor={color}
                logoUrl={fund.logoUrl}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{fund.displayName}</p>
                <p className="truncate text-xs text-muted-foreground/85">{fund.managerName ?? ' '}</p>
                <p
                  className="mt-1.5 flex items-center gap-2 truncate text-xs text-muted-foreground/70"
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
                      <span className={`font-mono tabular-nums ${stale ? 'text-amber-400/90' : ''}`}>
                        {quarter}
                      </span>
                      {stale && <span className="text-amber-400/90">Outdated</span>}
                    </>
                  )}
                </p>
              </div>
              <ArrowUpRight
                className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground"
                aria-hidden
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function SectionSkeleton() {
  return (
    <section className="mb-10" aria-hidden>
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
