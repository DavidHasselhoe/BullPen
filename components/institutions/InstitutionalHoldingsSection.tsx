'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Check, HelpCircle } from 'lucide-react';
import { ProBadge } from '@/components/billing/ProBadge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useFollowedFunds } from '@/hooks/use-institution-follow';
import { ALLOCATION_COLORS } from '@/lib/charts/allocation-colors';
import { concentrationRead } from '@/lib/institutions/allocation';
import { cn } from '@/lib/utils';
import { FundAvatar } from './FundAvatar';
import { FollowFundButton } from './FollowFundButton';
import { Filing13FDisclaimer } from './Filing13FDisclaimer';
import type { InstitutionalFundSummary, SectorWeight } from '@/app/api/institutions/route';
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

const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

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
 * Below this share of a portfolio with a known sector, the fund gets no top
 * sector at all rather than one read off the slice we happen to know about.
 * Measured: before sector data was backfilled, Lone Pine's "90% Communication
 * Services" came from 8% of its portfolio, which is a number that describes
 * our data, not the fund.
 */
const MIN_CLASSIFIED_PCT = 50;

function topSectorOf(fund: InstitutionalFundSummary): SectorWeight | null {
  const weights = fund.sectorWeights ?? [];
  const unclassified = weights.find((w) => w.sector === 'Unclassified')?.pct ?? 0;
  if (weights.length === 0 || 100 - unclassified < MIN_CLASSIFIED_PCT) return null;
  return weights.find((w) => w.sector !== 'Unclassified') ?? null;
}

/** Share of last quarter's positions that were opened or fully sold since.
 *  Relative, so a 6,000-position fund does not win on raw count alone. */
function changeRatioOf(fund: InstitutionalFundSummary): number | null {
  const q = fund.quarterChange;
  if (!q || q.previousPositions <= 0) return null;
  return (q.newPositions + q.exitedPositions) / q.previousPositions;
}

type SortKey = 'suggested' | 'value' | 'positions' | 'history' | 'change';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'suggested', label: 'Suggested' },
  { key: 'value', label: 'Largest portfolio' },
  { key: 'positions', label: 'Most holdings' },
  { key: 'history', label: 'Filing the longest' },
  { key: 'change', label: 'Most changed last quarter' },
];

const CONCENTRATION_ORDER: ConcentrationRead['level'][] = ['concentrated', 'focused', 'diversified', 'broad'];

const CONTROLS_STORAGE_KEY = 'discover:institution-controls';

interface SavedControls {
  sort: SortKey;
  sector: string;
  concentration: string;
  followingOnly: boolean;
}

/**
 * The controls as the reader last left them in this tab, so opening a fund and
 * pressing back returns to the same sorted, filtered list.
 *
 * Read in a useState initializer, which is only hydration-safe because nothing
 * these values affect renders until the fund list query resolves on the
 * client: the server and the hydrating client both render the skeleton. If the
 * list is ever prefetched on the server, this has to move.
 */
function readSavedControls(): Partial<SavedControls> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(CONTROLS_STORAGE_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!saved || typeof saved !== 'object') return {};
    return {
      sort: SORT_OPTIONS.some((o) => o.key === saved.sort) ? (saved.sort as SortKey) : undefined,
      sector: typeof saved.sector === 'string' ? saved.sector : undefined,
      concentration: typeof saved.concentration === 'string' ? saved.concentration : undefined,
      followingOnly: typeof saved.followingOnly === 'boolean' ? saved.followingOnly : undefined,
    };
  } catch {
    return {}; // Storage blocked or corrupt: start from the defaults.
  }
}

interface FundRow {
  fund: InstitutionalFundSummary;
  /** Position in the API's list, which is what the fund's detail page colors
   *  by. Sorting must never change it, or a card and its page disagree. */
  color: string;
  concentration: ConcentrationRead | null;
  topSector: SectorWeight | null;
  changeRatio: number | null;
}

/** Descending with missing values last, whichever direction the sort runs. */
function byDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function sortRows(rows: FundRow[], sort: SortKey): FundRow[] {
  if (sort === 'suggested') return rows;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sort) {
      case 'value':
        return byDesc(a.fund.totalValueUsd, b.fund.totalValueUsd);
      case 'positions':
        return byDesc(a.fund.totalPositions, b.fund.totalPositions);
      case 'history': {
        // Oldest first: an earlier date is a longer record.
        const ad = a.fund.firstFiledDate;
        const bd = b.fund.firstFiledDate;
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return ad.localeCompare(bd);
      }
      case 'change':
        return byDesc(a.changeRatio, b.changeRatio);
    }
  });
  return sorted;
}

/** A figure inside a sentence: Geist Mono, per DESIGN.md's Tabular Numerals Rule. */
function Figure({ children }: { children: ReactNode }) {
  return <span className="font-mono tabular-nums text-foreground/90">{children}</span>;
}

/** The one extra line a card carries: whatever the list is sorted by, so the
 *  order on screen explains itself. With no sort, the top sector. */
function metricLine(row: FundRow, sort: SortKey): ReactNode {
  const { fund } = row;
  switch (sort) {
    case 'value':
      return fund.totalValueUsd != null ? (
        <>
          <Figure>{compactUsd.format(fund.totalValueUsd)}</Figure> in reported holdings
        </>
      ) : null;
    case 'positions':
      return fund.totalPositions != null ? (
        <>
          <Figure>{fund.totalPositions.toLocaleString('en-US')}</Figure> positions
        </>
      ) : null;
    case 'history':
      return fund.firstFiledDate ? (
        <>
          Filing 13Fs since <Figure>{fund.firstFiledDate.slice(0, 4)}</Figure>
        </>
      ) : null;
    case 'change':
      return fund.quarterChange ? (
        <>
          <Figure>{fund.quarterChange.newPositions.toLocaleString('en-US')}</Figure> new,{' '}
          <Figure>{fund.quarterChange.exitedPositions.toLocaleString('en-US')}</Figure> sold out
        </>
      ) : (
        'No earlier quarter to compare'
      );
    case 'suggested':
      return row.topSector ? (
        <>
          Top sector: {row.topSector.sector} <Figure>{Math.round(row.topSector.pct)}%</Figure>
        </>
      ) : null;
  }
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

/** A labelled Select in the same shape QuarterPicker uses on the fund page. */
function ControlSelect({
  id,
  label,
  value,
  onChange,
  options,
  width,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  width: string;
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </label>
      <Select value={selected.value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className={width}>
          <SelectValue>{selected.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
 *
 * Sorting and filtering happen here, on the list already fetched: sixteen
 * funds do not need a round trip per control change.
 */
export function InstitutionalHoldingsSection() {
  const { data, isLoading, error } = useQuery(FUNDS_QUERY);
  const { isAuthenticated } = useAuth();
  const { data: followedSlugs } = useFollowedFunds();

  const [saved] = useState(readSavedControls);
  const [sort, setSort] = useState<SortKey>(saved.sort ?? 'suggested');
  const [sector, setSector] = useState(saved.sector ?? 'all');
  const [concentration, setConcentration] = useState(saved.concentration ?? 'all');
  const [followingOnly, setFollowingOnly] = useState(saved.followingOnly ?? false);

  useEffect(() => {
    try {
      sessionStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify({ sort, sector, concentration, followingOnly }));
    } catch {
      // Non-essential; the controls still work without persistence.
    }
  }, [sort, sector, concentration, followingOnly]);

  const rows: FundRow[] = useMemo(
    () =>
      (data?.funds ?? []).map((fund, i) => ({
        fund,
        color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
        concentration: concentrationRead(fund.totalPositions, fund.topHoldingPct, fund.top5Pct),
        topSector: topSectorOf(fund),
        changeRatio: changeRatioOf(fund),
      })),
    [data]
  );

  // Only options that would match at least one fund, with a count, so no
  // choice in either menu leads to an empty grid.
  const sectorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) if (r.topSector) counts.set(r.topSector.sector, (counts.get(r.topSector.sector) ?? 0) + 1);
    return [
      { value: 'all', label: 'All sectors' },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, n]) => ({ value: name, label: `${name} (${n})` })),
    ];
  }, [rows]);

  const concentrationOptions = useMemo(() => {
    const byLevel = new Map<string, { label: string; n: number }>();
    for (const r of rows) {
      if (!r.concentration) continue;
      const entry = byLevel.get(r.concentration.level) ?? { label: r.concentration.label, n: 0 };
      entry.n++;
      byLevel.set(r.concentration.level, entry);
    }
    return [
      { value: 'all', label: 'Any' },
      ...CONCENTRATION_ORDER.filter((level) => byLevel.has(level)).map((level) => ({
        value: level,
        label: `${byLevel.get(level)!.label} (${byLevel.get(level)!.n})`,
      })),
    ];
  }, [rows]);

  // A saved choice that no longer matches any fund (a sector that dropped out
  // after new filings) counts as "all". Otherwise the grid would sit empty
  // behind a menu that reads "All sectors", with nothing saying why.
  const activeSector = sectorOptions.some((o) => o.value === sector) ? sector : 'all';
  const activeConcentration = concentrationOptions.some((o) => o.value === concentration) ? concentration : 'all';

  const followed = useMemo(() => new Set(followedSlugs ?? []), [followedSlugs]);
  const showFollowing = followingOnly && isAuthenticated;

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (activeSector === 'all' || r.topSector?.sector === activeSector) &&
        (activeConcentration === 'all' || r.concentration?.level === activeConcentration) &&
        (!showFollowing || followed.has(r.fund.slug))
    );
    return sortRows(filtered, sort);
  }, [rows, activeSector, activeConcentration, showFollowing, followed, sort]);

  if (isLoading) return <SectionSkeleton />;
  if (error || !data?.funds?.length) return null;

  const filtersActive = activeSector !== 'all' || activeConcentration !== 'all' || showFollowing;
  // Only once the follow list has actually loaded: while it is in flight the
  // set is empty, and "not following any funds" would flash for someone who is.
  const followsEmpty = showFollowing && followedSlugs !== undefined && followed.size === 0;
  const clearFilters = () => {
    setSector('all');
    setConcentration('all');
    setFollowingOnly(false);
  };

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

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ControlSelect
          id="fund-sort"
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={SORT_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          width="w-[210px]"
        />
        {sectorOptions.length > 1 && (
          <ControlSelect
            id="fund-sector"
            label="Top sector"
            value={activeSector}
            onChange={setSector}
            options={sectorOptions}
            width="w-[210px]"
          />
        )}
        <ControlSelect
          id="fund-concentration"
          label="Concentration"
          value={activeConcentration}
          onChange={setConcentration}
          options={concentrationOptions}
          width="w-[170px]"
        />
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => setFollowingOnly((v) => !v)}
            aria-pressed={followingOnly}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              followingOnly
                ? 'border-border bg-muted/60 text-foreground'
                : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            {followingOnly && <Check className="h-3.5 w-3.5" aria-hidden />}
            Following
          </button>
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
        <p className="ml-auto text-xs tabular-nums text-muted-foreground/80" aria-live="polite">
          {visible.length === rows.length ? `${rows.length} funds` : `${visible.length} of ${rows.length} funds`}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
          <p className="text-sm text-foreground">
            {followsEmpty ? 'You are not following any funds yet.' : 'No funds match these filters.'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {followsEmpty
              ? 'Follow a fund to get notified when it files its next 13F.'
              : 'Try a different sector or concentration.'}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 inline-flex h-8 items-center rounded-md border border-border/60 px-3 text-sm text-foreground transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((row) => {
            const { fund, color, concentration: read } = row;
            const quarter = formatQuarter(fund.lastPeriodOfReport);
            const filed = formatFiledDate(fund.lastFiledDate);
            const stale = isStaleQuarter(fund.lastPeriodOfReport);
            const metric = metricLine(row, sort);

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
                    {read ? (
                      <ConcentrationDots read={read} color={color} />
                    ) : (
                      'Filing not yet ingested'
                    )}
                    {quarter && read && (
                      <>
                        <span aria-hidden>·</span>
                        <span className={`font-mono tabular-nums ${stale ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                          {quarter}
                        </span>
                        {stale && <span className="text-amber-600 dark:text-amber-400">Outdated</span>}
                      </>
                    )}
                  </p>
                  {metric && <p className="mt-1 text-xs tabular-nums text-muted-foreground/85">{metric}</p>}
                </div>
                {/* A column rather than absolute positioning: the arrow stays
                    pinned to the top corner and the follow button to the bottom
                    one, without either overlapping the concentration row when a
                    fund name wraps to two lines. */}
                <div className="flex shrink-0 flex-col items-end justify-between self-stretch gap-2">
                  <ArrowUpRight
                    className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground"
                    aria-hidden
                  />
                  <FollowFundButton slug={fund.slug} displayName={fund.displayName} compact />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SectionSkeleton() {
  return (
    <section className="mt-12 mb-10" aria-hidden>
      <div className="mb-1 h-3.5 w-52 rounded animate-shimmer" />
      <div className="mb-3 h-3 w-80 max-w-full rounded animate-shimmer" />
      <div className="mb-3 h-8 w-[420px] max-w-full rounded animate-shimmer" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[88px] rounded-xl border border-border/30 animate-shimmer" />
        ))}
      </div>
    </section>
  );
}
