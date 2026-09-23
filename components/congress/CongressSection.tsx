'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { positionLine } from '@/lib/congress/member-list';
import { PoliticianAvatar } from './PoliticianAvatar';
import type { CongressMemberSummary } from '@/app/api/congress/route';

const MEMBERS_QUERY = {
  queryKey: ['congress-members'] as const,
  queryFn: async (): Promise<{ success: boolean; members: CongressMemberSummary[] }> => {
    const res = await fetch('/api/congress');
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    return res.json();
  },
  staleTime: 30 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  refetchOnWindowFocus: false,
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function SectionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 p-4">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted/60" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-40 animate-pulse rounded bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CongressSection() {
  const { data, isLoading, error } = useQuery(MEMBERS_QUERY);
  const members = data?.members ?? [];

  if (error) return null;
  if (!isLoading && members.length === 0) return null;

  return (
    <section aria-labelledby="congress-heading" className="mt-12 mb-10">
      <h2
        id="congress-heading"
        className="mb-1 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
      >
        Congress Trading
      </h2>

      <p className="mb-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        Stock trades disclosed by members of Congress under the STOCK Act. Members file within 45
        days of trading, so this is a record of what was reported, not a live feed. Amounts are the
        ranges Congress requires, not exact figures.
      </p>

      {isLoading ? (
        <SectionSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const lastTrade = formatDate(m.lastTradeDate);
            return (
              <div
                key={m.slug}
                className="group relative flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-card/70 active:translate-y-0 active:scale-[0.99] focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background"
              >
                <Link
                  href={`/discover/congress/${m.slug}`}
                  aria-label={m.displayName}
                  className="absolute inset-0 z-0 rounded-xl focus:outline-none"
                />
                <PoliticianAvatar displayName={m.displayName} slug={m.slug} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug text-foreground">{m.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground/85">{positionLine(m)}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted-foreground/70">
                    <span>
                      {m.tradeCount.toLocaleString()} trade{m.tradeCount === 1 ? '' : 's'}
                    </span>
                    {/* null means no snapshot has been taken, which is a
                        different claim from "holds nothing" — say neither
                        rather than showing a 0 that looks measured. */}
                    {m.positionCount != null && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{m.positionCount.toLocaleString()} positions</span>
                      </>
                    )}
                    {lastTrade && (
                      <>
                        <span aria-hidden>·</span>
                        <span>to {lastTrade}</span>
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
      )}
    </section>
  );
}
