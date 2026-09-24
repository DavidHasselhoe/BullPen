'use client';

import type { ElementType } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Briefcase, ShoppingCart, Factory, ClipboardList, Users, Landmark, BarChart3, Wallet, ArrowUpRight, GraduationCap, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ECONOMIC_KINDS,
  fmtReleaseTime,
  fmtReleaseTimeShort,
  fmtReleaseTimeWithZone,
  viewerIsOutsideET,
  type EconomicEvent,
  type EconomicKind,
} from '@/lib/market-data/economic-kinds';

export const ECONOMIC_ICONS: Record<EconomicKind, ElementType> = {
  jobs: Briefcase,
  cpi: ShoppingCart,
  ppi: Factory,
  jolts: ClipboardList,
  claims: Users,
  fomc: Landmark,
  gdp: BarChart3,
  pce: Wallet,
};

/**
 * Neutral on purpose: a release is not good or bad news until it lands, and
 * emerald/red are reserved for gain/loss (DESIGN.md One Signal Rule).
 */
const CHIP = 'border border-border/70 bg-foreground/[0.04] text-foreground';

/** Grid-cell chip. Month cells get icon + short label, week cells add the viewer's local time. */
export function EconomicChip({ event, compact }: { event: EconomicEvent; compact?: boolean }) {
  const { t } = useTranslation('tools');
  const Icon = ECONOMIC_ICONS[event.kind];
  return (
    // Wraps instead of truncating: a week column is ~110px, and "JOLTS 4 PM" cut to "J…" says nothing.
    <span className={cn('flex min-w-0 flex-wrap items-center gap-x-1 rounded-md px-1.5 py-0.5 text-xs font-medium leading-tight', CHIP)}>
      <span className="flex items-center gap-1 whitespace-nowrap">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        <span className={cn(compact && 'hidden sm:inline')}>{t(`economicShort_${event.kind}`)}</span>
      </span>
      {!compact && (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">{fmtReleaseTimeShort(event.release_at)}</span>
      )}
    </span>
  );
}

/** Full row for the day dialog and the list view: what it is, when, why it matters, where to read or watch it. */
export function EconomicDetailRow({ event }: { event: EconomicEvent }) {
  const { t } = useTranslation('tools');
  const meta = ECONOMIC_KINDS[event.kind];
  const Icon = ECONOMIC_ICONS[event.kind];
  const outsideET = viewerIsOutsideET(event.release_at);

  return (
    <div className="flex gap-3 py-3">
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', CHIP)}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-semibold text-foreground">
            {t(`economicName_${event.kind}`, meta.name)}
            {event.detail && <span className="font-normal text-muted-foreground"> · {event.detail}</span>}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {fmtReleaseTimeWithZone(event.release_at)}
            {outsideET && <span> ({t('economicEtTime', { time: fmtReleaseTime(event.release_at, 'America/New_York') })})</span>}
          </p>
        </div>
        {event.has_projections && (
          <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            {t('economicProjections')}
          </span>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">{t(`economicWhy_${event.kind}`)}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs font-medium">
          <a
            href={meta.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-foreground/85 hover:text-primary focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('economicReadRelease', { source: meta.sourceName })}
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </a>
          {meta.watchUrl && (
            <a
              href={meta.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground/85 hover:text-primary focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PlayCircle className="h-3 w-3" aria-hidden />
              {t('economicWatchLive')}
            </a>
          )}
          <Link
            href={meta.lessonHref}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GraduationCap className="h-3 w-3" aria-hidden />
            {t('economicLearn')}
          </Link>
        </div>
      </div>
    </div>
  );
}
