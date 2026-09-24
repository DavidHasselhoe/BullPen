'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { ControlSelect } from '@/components/ui/ControlSelect';
import { PARTY_LABEL, positionLine } from '@/lib/congress/member-list';
import { DisclosureNote } from './DisclosureNote';
import { PoliticianAvatar } from './PoliticianAvatar';
import type { CongressMemberSummary } from '@/app/api/congress/route';

const ALL = 'all';

/**
 * Filter options are derived from the members actually present, never
 * hardcoded. A fixed list of 50 states would offer 48 dead options that
 * return nothing, and the roster changes with every backfill.
 */
function optionsFrom(
  members: CongressMemberSummary[],
  pick: (m: CongressMemberSummary) => string | null,
  label: (value: string) => string,
  allLabel: string,
): { value: string; label: string }[] {
  const seen = [...new Set(members.map(pick).filter((v): v is string => !!v))].sort();
  return [{ value: ALL, label: allLabel }, ...seen.map((v) => ({ value: v, label: label(v) }))];
}

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
  const members = useMemo(() => data?.members ?? [], [data]);

  const [party, setParty] = useState(ALL);
  const [chamber, setChamber] = useState(ALL);
  const [state, setState] = useState(ALL);

  const partyOptions = useMemo(
    () => optionsFrom(members, (m) => m.party, (v) => PARTY_LABEL[v] ?? v, 'All parties'),
    [members],
  );
  const chamberOptions = useMemo(
    () => optionsFrom(members, (m) => m.chamber, (v) => v, 'All chambers'),
    [members],
  );
  const stateOptions = useMemo(
    () => optionsFrom(members, (m) => m.state, (v) => v, 'All states'),
    [members],
  );

  const visible = useMemo(
    () =>
      members.filter(
        (m) =>
          (party === ALL || m.party === party) &&
          (chamber === ALL || m.chamber === chamber) &&
          (state === ALL || m.state === state),
      ),
    [members, party, chamber, state],
  );

  const filtersActive = party !== ALL || chamber !== ALL || state !== ALL;
  const clearFilters = () => {
    setParty(ALL);
    setChamber(ALL);
    setState(ALL);
  };

  if (error) return null;
  if (!isLoading && members.length === 0) return null;

  return (
    <section aria-labelledby="washington-heading" className="mt-12 mb-10">
      <h2
        id="washington-heading"
        className="mb-1 text-sm font-semibold uppercase tracking-widest text-muted-foreground"
      >
        Washington Trading
      </h2>

      <div className="mb-3">
        <DisclosureNote />
      </div>

      {!isLoading && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Only offered when there is something to choose between. With one
              chamber in the roster a chamber filter is decoration. */}
          {partyOptions.length > 2 && (
            <ControlSelect
              id="congress-party"
              label="Party"
              value={party}
              onChange={setParty}
              options={partyOptions}
              width="sm:w-[170px]"
            />
          )}
          {chamberOptions.length > 2 && (
            <ControlSelect
              id="congress-chamber"
              label="Chamber"
              value={chamber}
              onChange={setChamber}
              options={chamberOptions}
              width="sm:w-[170px]"
            />
          )}
          {stateOptions.length > 2 && (
            <ControlSelect
              id="congress-state"
              label="State"
              value={state}
              onChange={setState}
              options={stateOptions}
              width="sm:w-[140px]"
            />
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-8 items-center rounded-md px-2 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear filters
            </button>
          )}
          <p className="ml-auto text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {visible.length === members.length
              ? `${members.length} members`
              : `${visible.length} of ${members.length} members`}
          </p>
        </div>
      )}

      {isLoading ? (
        <SectionSkeleton />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
          <p className="text-sm text-foreground">No members match these filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => {
            const lastTrade = formatDate(m.lastTradeDate);
            return (
              <div
                key={m.slug}
                className="group relative flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-card/70 active:translate-y-0 active:scale-[0.99] focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background"
              >
                <Link
                  href={`/discover/politicians/${m.slug}`}
                  aria-label={m.displayName}
                  className="absolute inset-0 z-0 rounded-xl focus:outline-none"
                />
                <PoliticianAvatar displayName={m.displayName} slug={m.slug} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug text-foreground">{m.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{positionLine(m)}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted-foreground">
                    {/* Locale pinned, as everywhere else in this file. Bare
                        toLocaleString() follows the viewer's browser, which
                        rendered Khanna's 1,577 positions as "1 577". */}
                    <span>
                      {m.tradeCount.toLocaleString('en-US')} trade{m.tradeCount === 1 ? '' : 's'}
                    </span>
                    {/* null means no snapshot has been taken, which is a
                        different claim from "holds nothing" — say neither
                        rather than showing a 0 that looks measured. */}
                    {m.positionCount != null && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{m.positionCount.toLocaleString('en-US')} positions</span>
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
                  className="h-4 w-4 shrink-0 self-start text-muted-foreground transition-colors group-hover:text-foreground"
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
