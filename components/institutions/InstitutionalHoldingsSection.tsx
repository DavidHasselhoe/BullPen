'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { ProBadge } from '@/components/billing/ProBadge';
import { FundAvatar } from './FundAvatar';
import { Filing13FDisclaimer } from './Filing13FDisclaimer';
import type { InstitutionalFundSummary } from '@/app/api/institutions/route';

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

function formatFiledDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Discover entry point for the institutional 13F holdings tracker. Every
 * card here is free teaser data (fund name, manager, last-filed date,
 * position count) — same shape WeeklyPickHero uses for its always-visible
 * summary. The gate is entirely on the destination: clicking through to
 * /discover/institutions/[slug] is where a non-Pro viewer sees the paywall,
 * not here (mirrors WeeklyPickHero's "locked-ness is advisory here,
 * enforcement happens on the destination" pattern — there's no client-side
 * tier check anywhere else in this app to intercept the click with).
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
        {data.funds.map((fund) => (
          <Link
            key={fund.slug}
            href={`/discover/institutions/${fund.slug}`}
            className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-4 transition-colors duration-200 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <FundAvatar displayName={fund.displayName} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{fund.displayName}</p>
              <p className="truncate text-xs text-muted-foreground/85">
                {fund.managerName ?? ' '}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {fund.lastFiledDate
                  ? `Filed ${formatFiledDate(fund.lastFiledDate)} · ${fund.totalPositions ?? '—'} positions`
                  : 'Filing not yet ingested'}
              </p>
            </div>
            <ArrowUpRight
              className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground"
              aria-hidden
            />
          </Link>
        ))}
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
          <div key={i} className="h-[76px] rounded-xl border border-border/30 animate-shimmer" />
        ))}
      </div>
    </section>
  );
}
