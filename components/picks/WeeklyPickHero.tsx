'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpRight, Lock, Minus } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';
import { useLivePrice } from '@/components/discover/v2/LivePriceContext';
import { CATALYST_LABELS, HORIZON_LABELS, type PickDetail } from '@/lib/picks/types';
import { DIRECTION_TEXT, directionOf, fmtPct, fmtPrice, pickedAgo } from './pick-format';
import { ConvictionMeter } from './ConvictionMeter';

/**
 * Shared query for the current pick. DiscoverClient uses it to fold the pick's
 * symbol into the page's single SSE subscription; the hero uses it to render.
 * Same key means one request, not two.
 */
export const CURRENT_PICK_QUERY = {
  queryKey: ['weekly-pick-current'] as const,
  queryFn: async (): Promise<{ success: boolean; pick: PickDetail | null }> => {
    const res = await fetch('/api/picks/current');
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    return res.json();
  },
  staleTime: 10 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
};

/**
 * The Discover entry point for Bull's Weekly Pick.
 *
 * Free users see the whole card — ticker, argument, entry price, and live
 * return. Only the multi-section thesis behind "Read the full thesis" is Pro.
 * That split is deliberate: the track record has to be checkable by anyone for
 * the claim it supports to mean anything.
 */
export function WeeklyPickHero() {
  const { data, isLoading, error } = useQuery(CURRENT_PICK_QUERY);
  // Rides the Discover page's single SSE subscription when it's available
  // (DiscoverClient folds the pick's symbol into the stream); falls back to the
  // server-computed quote on surfaces that have no live-price provider.
  const live = useLivePrice(data?.pick?.symbol ?? '');

  if (isLoading) return <HeroSkeleton />;

  // Nothing to show before the first pick ships, and a failed fetch shouldn't
  // push an error box to the top of Discover — the rails below still work.
  if (error || !data?.pick) return null;

  const base = data.pick;
  const livePrice = live?.price != null && Number.isFinite(live.price) ? live.price : null;
  const currentPrice = livePrice ?? base.currentPrice;
  const pick: PickDetail = {
    ...base,
    currentPrice,
    returnPct:
      base.entryPrice != null && base.entryPrice > 0 && currentPrice != null
        ? (currentPrice / base.entryPrice - 1) * 100
        : base.returnPct,
  };

  const direction = directionOf(pick.returnPct);
  const DirIcon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  const pending = pick.entryPrice == null;

  return (
    <section aria-labelledby="weekly-pick-heading" className="mb-10">
      <div className="flex items-end justify-between mb-3 gap-3">
        <h2
          id="weekly-pick-heading"
          className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
        >
          Bull&apos;s Weekly Pick
        </h2>
        <Link
          href="/picks"
          className="text-[11px] uppercase tracking-widest text-muted-foreground/85 hover:text-foreground transition-colors flex items-center gap-1 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Track record <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div
        className={cn(
          'rounded-xl border border-border/50 bg-card/40 p-5 sm:p-6',
          'transition-colors duration-200 hover:border-border',
        )}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          {/* ── Left: the argument ─────────────────────────────────────────── */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-3">
              <CompanyLogo
                name={pick.companyName ?? pick.symbol}
                ticker={pick.symbol}
                logoUrl={pick.logoUrl}
                size={36}
                className="shrink-0"
              />
              <div className="min-w-0">
                <Link
                  href={slugToAssetPath(pick.symbol)}
                  className="font-mono text-base font-bold text-foreground hover:text-primary transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {pick.symbol}
                </Link>
                <p className="text-xs text-muted-foreground/85 truncate" title={pick.companyName ?? undefined}>
                  {pick.companyName ?? '—'}
                </p>
              </div>
            </div>

            <h3 className="text-lg sm:text-xl font-semibold text-foreground leading-snug tracking-tight text-balance">
              {pick.headline}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-prose">
              {pick.oneLiner}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Chip>{CATALYST_LABELS[pick.catalystType]}</Chip>
              <Chip>{HORIZON_LABELS[pick.horizon]}</Chip>
              <ConvictionMeter value={pick.conviction} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href={`/picks/${pick.pickDate}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {pick.locked && <Lock className="h-3 w-3" aria-hidden />}
                Read the full thesis
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
              {pick.locked && (
                <span className="text-[11px] text-muted-foreground/80">
                  {pick.lockReason === 'anonymous'
                    ? 'Sign up free for one thesis a month'
                    : pick.lockReason === 'free_quota_used'
                      ? "This month's free thesis is used"
                      : 'Full thesis is a Pro feature'}
                </span>
              )}
            </div>
          </div>

          {/* ── Right: the receipt ─────────────────────────────────────────── */}
          <div className="shrink-0 lg:w-56 lg:border-l lg:border-border/40 lg:pl-6">
            <dl className="grid grid-cols-3 gap-4 lg:grid-cols-1 lg:gap-3">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">
                  Picked
                </dt>
                <dd className="mt-1 font-mono text-sm tabular-nums text-foreground/90">
                  {pickedAgo(pick.pickDate)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">
                  Entry
                </dt>
                <dd className="mt-1 font-mono text-sm tabular-nums text-foreground/90">
                  {pending ? (
                    <span className="text-muted-foreground/80">Pending</span>
                  ) : (
                    <>${fmtPrice(pick.entryPrice)}</>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">
                  Since pick
                </dt>
                <dd
                  className={cn(
                    'mt-1 flex items-center gap-1 font-mono text-lg font-bold tabular-nums',
                    DIRECTION_TEXT[direction],
                  )}
                >
                  {pick.returnPct != null && (
                    <DirIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  )}
                  {pick.returnPct != null ? fmtPct(pick.returnPct) : '—'}
                </dd>
              </div>
            </dl>

            {pending && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
                Entry price is set from the first market open after we publish.
              </p>
            )}
            {!pending && pick.benchmarkReturnPct != null && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
                S&amp;P 500 over the same stretch:{' '}
                <span className="font-mono tabular-nums text-muted-foreground/80">
                  {fmtPct(pick.benchmarkReturnPct)}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/40 bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function HeroSkeleton() {
  return (
    <section className="mb-10" aria-hidden>
      <div className="flex items-end justify-between mb-3">
        <div className="h-3.5 w-40 rounded animate-shimmer" />
        <div className="h-3 w-24 rounded animate-shimmer" />
      </div>
      <div className="rounded-xl border border-border/30 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-md animate-shimmer shrink-0" />
              <div className="space-y-1.5">
                <div className="h-4 w-16 rounded animate-shimmer" />
                <div className="h-3 w-32 rounded animate-shimmer" />
              </div>
            </div>
            <div className="h-6 w-3/4 rounded animate-shimmer" />
            <div className="h-4 w-full rounded animate-shimmer" />
            <div className="h-4 w-2/3 rounded animate-shimmer" />
          </div>
          <div className="shrink-0 lg:w-56 grid grid-cols-3 gap-4 lg:grid-cols-1 lg:gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 w-14 rounded animate-shimmer" />
                <div className="h-5 w-20 rounded animate-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
