'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ChartLine, ChevronRight } from 'lucide-react';
import { ToolPage, ToolHeader } from '@/components/tools/ToolHeader';
import { ECONOMIC_ICONS } from '@/components/tools/calendar/EconomicEvents';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { ECONOMIC_KINDS, economyHref } from '@/lib/market-data/economic-kinds';
import type { EconomyPageData } from '@/lib/market-data/economic-results';
import { Change } from './Change';
import { EconomyFooter } from './EconomyFooter';
import { fmtDay, fmtMetric, fmtPeriod, fmtRange } from './format';

/** One card per release: its latest headline number against the one before. */
export function EconomyHubClient({ pages }: { pages: EconomyPageData[] }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  const updatedAt = pages.map((p) => p.updatedAt).filter((d): d is string => !!d).sort().at(-1) ?? null;

  return (
    <ToolPage>
      <ToolHeader icon={<ChartLine />} title={t('hubTitle')} description={t('hubSubtitle')} />

      <div className="space-y-10">
        <ul className="grid gap-3 sm:grid-cols-2">
          {pages.map((p) => {
            const Icon = ECONOMIC_ICONS[p.kind];
            const headline = p.latest?.metrics[0];
            const lower = p.latest?.metrics.find((m) => m.key === 'rate_lower');
            return (
              <li key={p.kind}>
                <Link
                  href={economyHref(p.kind)!}
                  className="group flex h-full flex-col rounded-xl border border-border/60 bg-card px-5 py-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {t(`name_${p.kind}`)}
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </div>
                  {headline && p.latest ? (
                    <>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {p.kind === 'fomc' ? t('fedRangeLabel') : `${t(`metric_${headline.key}`)} · ${fmtPeriod(p.kind, p.latest.period, locale)}`}
                      </p>
                      <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-foreground">
                        {p.kind === 'fomc' && lower
                          ? fmtRange(lower.actual, headline.actual, locale, t('rangeTo'))
                          : fmtMetric(headline.key, headline.actual, locale)}
                      </p>
                      {p.kind !== 'fomc' && <div className="mt-0.5"><Change metric={headline} /></div>}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">{t('noDataYet')}</p>
                  )}
                  {p.nextRelease && (
                    <p className="mt-auto pt-3 text-xs text-muted-foreground">
                      {t(p.kind === 'fomc' ? 'nextMeetingShort' : 'nextReleaseShort', { date: fmtDay(p.nextRelease.date, locale) })}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="text-sm text-muted-foreground">
          {t('hubCalendarNote')}{' '}
          <Link href="/tools/calendar" className="text-foreground underline underline-offset-4">{t('hubCalendarLink')}</Link>
        </p>

        <EconomyFooter sources={pages.map((p) => ECONOMIC_KINDS[p.kind].sourceName)} updatedAt={updatedAt} />
      </div>
    </ToolPage>
  );
}
