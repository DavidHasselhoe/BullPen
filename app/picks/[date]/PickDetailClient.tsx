'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle, AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Lock, Minus,
} from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useBackground } from '@/hooks/use-background';
import { humanizeError } from '@/lib/errors/humanize';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';
import { CATALYST_LABELS, HORIZON_LABELS, type PickDetail } from '@/lib/picks/types';
import { ConvictionMeter } from '@/components/picks/ConvictionMeter';
import { PickPriceChart } from '@/components/picks/PickPriceChart';
import {
  DIRECTION_TEXT, directionOf, fmtDateLong, fmtPct, fmtPrice, heldFor,
} from '@/components/picks/pick-format';

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High',
};

export default function PickDetailClient({ date }: { date: string }) {
  const { hasAnimatedBackground } = useBackground();

  const { data, isLoading, error } = useQuery<{ success: boolean; pick?: PickDetail; error?: string }>({
    queryKey: ['pick-detail', date],
    queryFn: async () => {
      const res = await fetch(`/api/picks/${date}`);
      if (res.status === 404) return { success: false, error: 'not_found' };
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const pick = data?.pick;

  // Price history for the chart — a year of context so the pick date sits
  // inside the story rather than at the start of it.
  const { data: candleData } = useQuery<{ success: boolean; candles: { t: number[]; c: number[] } | null }>({
    queryKey: ['pick-candles', pick?.symbol],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${encodeURIComponent(pick!.symbol)}/candles?range=1Y`);
      if (!res.ok) return { success: false, candles: null };
      return res.json();
    },
    enabled: !!pick?.symbol,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto min-w-0 max-w-4xl px-4 py-8 sm:px-6 lg:px-8 page-enter">
        <Link
          href="/picks"
          className="mb-6 inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All picks
        </Link>

        {isLoading && <DetailSkeleton />}

        {!isLoading && (error || data?.error === 'not_found' || !pick) && (
          <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/40 p-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                {data?.error === 'not_found' ? 'No pick for that date' : "Couldn't load this pick"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {data?.error === 'not_found'
                  ? 'Picks are published on Mondays — try the track record for the full list.'
                  : humanizeError(error)}
              </p>
              <Link
                href="/picks"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Go to the track record <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </div>
        )}

        {!isLoading && pick && <PickBody pick={pick} candles={candleData?.candles ?? null} />}
      </main>
    </div>
  );
}

function PickBody({
  pick, candles,
}: { pick: PickDetail; candles: { t: number[]; c: number[] } | null }) {
  const dir = directionOf(pick.returnPct);
  const DirIcon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;
  const vsBenchmark =
    pick.returnPct != null && pick.benchmarkReturnPct != null
      ? pick.returnPct - pick.benchmarkReturnPct
      : null;

  return (
    <article>
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="mb-6">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary/75">
          Bull&apos;s Weekly Pick · {fmtDateLong(pick.pickDate)}
        </p>

        <div className="mb-4 flex items-center gap-3">
          <CompanyLogo
            name={pick.companyName ?? pick.symbol}
            ticker={pick.symbol}
            logoUrl={pick.logoUrl}
            size={44}
            className="shrink-0"
          />
          <div className="min-w-0">
            <Link
              href={slugToAssetPath(pick.symbol)}
              className="rounded font-mono text-lg font-bold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {pick.symbol}
            </Link>
            <p className="truncate text-sm text-muted-foreground">
              {pick.companyName ?? '—'}
              {pick.sector ? ` · ${pick.sector}` : ''}
            </p>
          </div>
        </div>

        <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground text-balance sm:text-3xl">
          {pick.headline}
        </h1>
        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
          {pick.oneLiner}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip>{CATALYST_LABELS[pick.catalystType]}</Chip>
          <Chip>{HORIZON_LABELS[pick.horizon]}</Chip>
          <ConvictionMeter value={pick.conviction} />
        </div>
      </header>

      {/* ── Scoreboard ───────────────────────────────────────────────────────── */}
      <section aria-label="Performance since the pick" className="mb-8">
        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border/50 bg-card/40 px-5 py-4 sm:grid-cols-4">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">Entry</dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-foreground/90">
              {pick.entryPrice == null ? (
                <span className="text-muted-foreground/80">Pending open</span>
              ) : (
                `$${fmtPrice(pick.entryPrice)}`
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">Now</dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-foreground/90">
              {pick.currentPrice == null ? '—' : `$${fmtPrice(pick.currentPrice)}`}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">
              Since pick
            </dt>
            <dd
              className={cn(
                'mt-1 flex items-center gap-1 font-mono text-base font-bold tabular-nums',
                DIRECTION_TEXT[dir],
              )}
            >
              {pick.returnPct != null && <DirIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
              {fmtPct(pick.returnPct)}
            </dd>
            <p className="mt-0.5 text-[11px] text-muted-foreground/80">over {heldFor(pick.pickDate)}</p>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">
              vs S&amp;P 500
            </dt>
            <dd className={cn('mt-1 font-mono text-sm font-semibold tabular-nums', DIRECTION_TEXT[directionOf(vsBenchmark)])}>
              {fmtPct(vsBenchmark)}
            </dd>
            <p className="mt-0.5 text-[11px] text-muted-foreground/80">
              index {fmtPct(pick.benchmarkReturnPct)}
            </p>
          </div>
        </dl>

        {pick.status === 'closed' && (
          <p className="mt-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-2.5 text-[12px] text-muted-foreground">
            This position is closed — {pick.closeReason ?? 'the security stopped trading'}. It&apos;s
            frozen at ${fmtPrice(pick.closePrice)} and stays in the track record at that price.
          </p>
        )}
      </section>

      {/* ── Price, with the call marked ──────────────────────────────────────── */}
      <section aria-label="Price since the pick" className="mb-8">
        <PickPriceChart
          candles={candles}
          entryPrice={pick.entryPrice}
          pickDate={pick.pickDate}
          currentPrice={pick.currentPrice}
        />
      </section>

      {/* ── The thesis (Pro) ─────────────────────────────────────────────────── */}
      {pick.locked ? <LockedThesis /> : <UnlockedThesis pick={pick} />}

      <p className="mt-10 border-t border-border/40 pt-4 text-[11px] leading-relaxed text-muted-foreground/85">
        Generated by Claude from market data, our own health scores and peer benchmarks, and
        public news on {fmtDateLong(pick.pickDate)}. This is research, not investment advice,
        and it takes no account of your circumstances. Nothing here has been updated since
        publication — that&apos;s deliberate, so you can see what the argument actually was.{' '}
        <Link href="/picks" className="text-primary hover:underline">
          How the record is measured
        </Link>
        .
      </p>
    </article>
  );
}

// ─── Thesis ──────────────────────────────────────────────────────────────────

function UnlockedThesis({ pick }: { pick: PickDetail }) {
  const thesis = pick.thesis;
  const risks = pick.risks ?? [];

  return (
    <>
      {thesis && thesis.sections.length > 0 && (
        <section aria-labelledby="thesis-heading" className="mb-8">
          <h2
            id="thesis-heading"
            className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
          >
            The case
          </h2>
          <div className="space-y-6">
            {thesis.sections.map((s, i) => (
              <div key={i}>
                <h3 className="text-[15px] font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 max-w-prose text-[15px] leading-7 text-foreground/80">{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {thesis && thesis.evidence.length > 0 && (
        <section aria-labelledby="evidence-heading" className="mb-8">
          <h2
            id="evidence-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
          >
            The numbers behind it
          </h2>
          <p className="mb-3 text-[12px] text-muted-foreground/85">
            As they stood on {fmtDateLong(pick.pickDate)} — not updated since.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/40">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <tbody>
                {thesis.evidence.map((row, i) => (
                  <tr key={i} className="border-b border-border/30 last:border-b-0">
                    <th scope="row" className="px-4 py-2.5 text-left text-[13px] font-medium text-muted-foreground">
                      {row.label}
                    </th>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">
                      {row.value}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12px] text-muted-foreground/85">
                      {row.context ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {risks.length > 0 && (
        <section aria-labelledby="risks-heading" className="mb-8">
          <h2
            id="risks-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
          >
            What would make this wrong
          </h2>
          <div className="space-y-3">
            {risks.map((r, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-card/40 px-4 py-3.5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-foreground">
                      {r.title}
                      <span className="ml-2 font-normal text-[11px] text-muted-foreground/85">
                        {SEVERITY_LABEL[r.severity] ?? r.severity} risk
                      </span>
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{r.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {thesis?.invalidation && (
        <section aria-labelledby="invalidation-heading" className="mb-8">
          <h2
            id="invalidation-heading"
            className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
          >
            The one thing to watch
          </h2>
          <p className="max-w-prose rounded-xl border border-border/50 bg-card/40 px-4 py-3.5 text-[14px] leading-relaxed text-foreground/85">
            {thesis.invalidation}
          </p>
        </section>
      )}
    </>
  );
}

function LockedThesis() {
  return (
    <section aria-labelledby="locked-heading" className="mb-8">
      <h2
        id="locked-heading"
        className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
      >
        The case
      </h2>
      <div className="rounded-xl border border-border/50 bg-card/40 px-5 py-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Lock className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              The full thesis is a Pro feature
            </h3>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
              Pro unlocks the reasoning behind every pick: the argument section by section,
              the peer-relative numbers it was built on, the specific risks, and the one
              thing that would prove it wrong.
            </p>
            <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-muted-foreground/85">
              The pick itself, its entry price, and the entire track record stay free — you
              never have to pay to check whether we&apos;ve been right.
            </p>
            <Link
              href="/upgrade"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              See what Pro includes
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Chrome ──────────────────────────────────────────────────────────────────

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/40 bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="h-3 w-56 rounded animate-shimmer" />
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-md animate-shimmer" />
        <div className="space-y-1.5">
          <div className="h-5 w-20 rounded animate-shimmer" />
          <div className="h-3.5 w-40 rounded animate-shimmer" />
        </div>
      </div>
      <div className="h-8 w-4/5 rounded animate-shimmer" />
      <div className="h-4 w-full rounded animate-shimmer" />
      <div className="h-[92px] rounded-xl border border-border/30 animate-shimmer" />
      <div className="h-[220px] rounded-xl border border-border/30 animate-shimmer" />
    </div>
  );
}
