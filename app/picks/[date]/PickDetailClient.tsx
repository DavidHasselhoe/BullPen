'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle, AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Loader2, Lock, Minus,
} from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useBackground } from '@/hooks/use-background';
import { humanizeError } from '@/lib/errors/humanize';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { intlLocale } from '@/lib/i18n/intl-locale';
import { cn } from '@/lib/utils';
import type { LockReason, PickDetail } from '@/lib/picks/types';
import { quarterLabel, quarterOf } from '@/lib/picks/quarters';
import { ConvictionMeter } from '@/components/picks/ConvictionMeter';
import { PickPriceChart } from '@/components/picks/PickPriceChart';
import { VoteChip } from '@/components/picks/VoteChip';
import {
  CATALYST_KEY, DIRECTION_TEXT, HORIZON_KEY, directionOf, fmtDate, fmtDateLong, fmtPct, fmtPrice, heldFor,
} from '@/components/picks/pick-format';

type DetailResponse = { success: boolean; pick?: PickDetail; error?: string };

const SEVERITY_KEY: Record<string, string> = {
  low: 'pickRiskLow', medium: 'pickRiskMedium', high: 'pickRiskHigh',
};

const SECTION_HEADING = 'text-base font-semibold text-foreground';

export default function PickDetailClient({ date }: { date: string }) {
  const { t } = useTranslation('discover');
  const { hasAnimatedBackground } = useBackground();

  const { data, isLoading, error } = useQuery<DetailResponse>({
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
      <main className="container mx-auto min-w-0 max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/picks"
          className="mb-6 inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t('pickAllPicks')}
        </Link>

        {isLoading && <DetailSkeleton />}

        {!isLoading && (error || data?.error === 'not_found' || !pick) && (
          <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/40 p-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                {data?.error === 'not_found' ? t('pickNotFoundTitle') : t('pickLoadErrorTitle')}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {data?.error === 'not_found' ? t('pickNotFoundBody') : humanizeError(error)}
              </p>
              <Link
                href="/picks"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {t('pickGoToTrackRecord')} <ArrowUpRight className="h-3 w-3" aria-hidden />
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
  const { t, i18n } = useTranslation('discover');
  const locale = intlLocale(i18n.language);
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
            {/* clamp-ok: company name and sector, a label, with the full value in title */}
            <p className="truncate text-sm text-muted-foreground" title={pick.companyName ?? undefined}>
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
          <Chip>{pick.catalystType in CATALYST_KEY ? t(CATALYST_KEY[pick.catalystType as keyof typeof CATALYST_KEY]) : pick.catalystType}</Chip>
          <Chip>{pick.horizon in HORIZON_KEY ? t(HORIZON_KEY[pick.horizon as keyof typeof HORIZON_KEY]) : pick.horizon}</Chip>
          <ConvictionMeter value={pick.conviction} />
          {pick.vote && <VoteChip vote={pick.vote} />}
        </div>
      </header>

      {/* ── Scoreboard ───────────────────────────────────────────────────────── */}
      <section aria-label={t('pickScoreboardLabel')} className="mb-8">
        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border/50 bg-card/40 px-5 py-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t('pickEntry')}</dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-foreground/90">
              {pick.entryPrice == null ? (
                <span className="text-muted-foreground">{t('pickPendingOpen')}</span>
              ) : (
                `$${fmtPrice(pick.entryPrice)}`
              )}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('pickEntryAtOpen', { date: fmtDate(pick.pickDate, locale) })}
            </p>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t('pickNow')}</dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-foreground/90">
              {pick.currentPrice == null ? '—' : `$${fmtPrice(pick.currentPrice)}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t('pickSincePick')}</dt>
            <dd
              className={cn(
                'mt-1 flex items-center gap-1 font-mono text-base font-bold tabular-nums',
                DIRECTION_TEXT[dir],
              )}
            >
              {pick.returnPct != null && <DirIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
              {fmtPct(pick.returnPct)}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('pickOver', { duration: heldFor(pick.pickDate, t) })}
            </p>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t('pickVsSp500')}</dt>
            <dd className={cn('mt-1 font-mono text-sm font-semibold tabular-nums', DIRECTION_TEXT[directionOf(vsBenchmark)])}>
              {fmtPct(vsBenchmark)}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('pickIndex', { pct: fmtPct(pick.benchmarkReturnPct) })}
            </p>
          </div>
        </dl>

        {pick.status === 'closed' && (
          <p className="mt-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
            {t('pickClosed', {
              reason: pick.closeReason ?? t('pickClosedDefaultReason'),
              price: fmtPrice(pick.closePrice),
            })}
          </p>
        )}
      </section>

      {/* ── Price, with the call marked ──────────────────────────────────────── */}
      <section aria-label={t('pickPriceSectionLabel')} className="mb-8">
        <PickPriceChart
          candles={candles}
          entryPrice={pick.entryPrice}
          pickDate={pick.pickDate}
          currentPrice={pick.currentPrice}
        />
      </section>

      {/* ── The thesis (Pro, or one free pick a month) ───────────────────────── */}
      {pick.locked ? <LockedThesis pickDate={pick.pickDate} reason={pick.lockReason} /> : <UnlockedThesis pick={pick} />}

      <p className="mt-10 border-t border-border/40 pt-4 text-[11px] leading-relaxed text-muted-foreground">
        {t('pickFooter', { date: fmtDateLong(pick.pickDate, locale) })}{' '}
        <Link href="/picks" className="text-primary hover:underline">
          {t('pickFooterLink')}
        </Link>
        .
      </p>
    </article>
  );
}

// ─── Thesis ──────────────────────────────────────────────────────────────────

function UnlockedThesis({ pick }: { pick: PickDetail }) {
  const { t, i18n } = useTranslation('discover');
  const locale = intlLocale(i18n.language);
  const thesis = pick.thesis;
  const risks = pick.risks ?? [];

  return (
    <>
      {thesis && thesis.sections.length > 0 && (
        <section aria-labelledby="thesis-heading" className="mb-8">
          <h2 id="thesis-heading" className={cn(SECTION_HEADING, 'mb-4')}>
            {t('pickCaseHeading')}
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
          <h2 id="evidence-heading" className={cn(SECTION_HEADING, 'mb-1')}>
            {t('pickEvidenceHeading')}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {t('pickEvidenceAsOf', { date: fmtDateLong(pick.pickDate, locale) })}
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
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
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
          <h2 id="risks-heading" className={cn(SECTION_HEADING, 'mb-3')}>
            {t('pickRisksHeading')}
          </h2>
          <div className="space-y-3">
            {risks.map((r, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-card/40 px-4 py-3.5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                  <div className="min-w-0">
                    {/* The space keeps the accessible name from reading "reversalHigh risk". */}
                    <h3 className="text-sm font-semibold text-foreground">
                      {r.title}{' '}
                      <span className="ml-1 font-normal text-[11px] text-muted-foreground">
                        {SEVERITY_KEY[r.severity] ? t(SEVERITY_KEY[r.severity]) : r.severity}
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
          <h2 id="invalidation-heading" className={cn(SECTION_HEADING, 'mb-2')}>
            {t('pickWatchHeading')}
          </h2>
          <p className="max-w-prose rounded-xl border border-border/50 bg-card/40 px-4 py-3.5 text-sm leading-relaxed text-foreground/85">
            {thesis.invalidation}
          </p>
        </section>
      )}

      {thesis?.quarterCheckpoint && (
        <section aria-labelledby="checkpoint-heading" className="mb-8">
          <h2 id="checkpoint-heading" className={cn(SECTION_HEADING, 'mb-2')}>
            {t('pickCheckpointHeading', { quarter: quarterLabel(quarterOf(pick.pickDate)) })}
          </h2>
          <p className="max-w-prose rounded-xl border border-border/50 bg-card/40 px-4 py-3.5 text-sm leading-relaxed text-foreground/85">
            {thesis.quarterCheckpoint}
          </p>
        </section>
      )}
    </>
  );
}

function LockedThesis({ pickDate, reason }: { pickDate: string; reason?: LockReason }) {
  const { t } = useTranslation('discover');
  const queryClient = useQueryClient();

  // The only thing that spends a free account's monthly thesis.
  const read = useMutation({
    mutationFn: async (): Promise<DetailResponse> => {
      const res = await fetch(`/api/picks/${pickDate}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['pick-detail', pickDate], result);
      void queryClient.invalidateQueries({ queryKey: ['weekly-pick-current'] });
    },
  });

  const copy =
    reason === 'anonymous'
      ? { title: t('pickLockAnonTitle'), body: t('pickLockAnonBody'), cta: t('pickLockAnonCta'), href: '/register' }
      : reason === 'free_available'
        ? { title: t('pickLockFreeTitle'), body: t('pickLockFreeBody'), cta: t('pickLockFreeCta'), href: null }
        : reason === 'free_quota_used'
          ? { title: t('pickLockUsedTitle'), body: t('pickLockUsedBody'), cta: t('pickLockProCta'), href: '/upgrade' }
          : { title: t('pickLockProTitle'), body: t('pickLockProBody'), cta: t('pickLockProCta'), href: '/upgrade' };

  const ctaClass =
    'mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  return (
    <section aria-labelledby="locked-heading" className="mb-8">
      <h2 id="locked-heading" className={cn(SECTION_HEADING, 'mb-3')}>
        {t('pickCaseHeading')}
      </h2>
      <div className="rounded-xl border border-border/50 bg-card/40 px-5 py-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Lock className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
            <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">{t('pickLockAlwaysFree')}</p>
            {copy.href ? (
              <Link href={copy.href} className={ctaClass}>
                {copy.cta}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : (
              <button type="button" onClick={() => read.mutate()} disabled={read.isPending} className={ctaClass}>
                {read.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {copy.cta}
              </button>
            )}
            {read.isError && (
              <p role="alert" className="mt-2 text-xs text-red-500 dark:text-red-400">{t('pickLockFreeError')}</p>
            )}
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
