'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, GraduationCap } from 'lucide-react';
import { ToolPage, ToolHeader, ToolSectionTitle } from '@/components/tools/ToolHeader';
import { ECONOMIC_ICONS } from '@/components/tools/calendar/EconomicEvents';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useClock } from '@/hooks/use-clock';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { ECONOMIC_KINDS, fmtReleaseTimeForViewer } from '@/lib/market-data/economic-kinds';
import type { EconomyPageData, Metric, MetricKey, ResultKind } from '@/lib/market-data/economic-results';
import { EconomyChart, type ChartSeries } from './EconomyChart';
import { Change } from './Change';
import { EconomyFooter } from './EconomyFooter';
import { fmtDay, fmtMetric, fmtPeriod, fmtRange } from './format';

interface View {
  chart: { type: 'line' | 'bar' | 'step'; series: MetricKey[]; take?: number; target?: number };
  /** Columns of the history table. Empty for the Fed, which lists rate changes instead. */
  table: MetricKey[];
}

/** 2% is the Fed's stated inflation target: a fact worth drawing, not a forecast. */
const VIEWS: Record<ResultKind, View> = {
  fomc: { chart: { type: 'step', series: ['rate_upper', 'rate_lower'] }, table: [] },
  cpi: { chart: { type: 'line', series: ['cpi_yoy', 'core_cpi_yoy'], target: 2 }, table: ['cpi_yoy', 'core_cpi_yoy', 'cpi_mom', 'core_cpi_mom'] },
  pce: { chart: { type: 'line', series: ['pce_yoy', 'core_pce_yoy'], target: 2 }, table: ['pce_yoy', 'core_pce_yoy', 'pce_mom', 'core_pce_mom'] },
  jobs: { chart: { type: 'bar', series: ['payrolls'], take: 24 }, table: ['payrolls', 'unemployment'] },
  gdp: { chart: { type: 'bar', series: ['gdp'], take: 20 }, table: ['gdp'] },
  claims: { chart: { type: 'line', series: ['claims_4wk', 'claims'] }, table: ['claims', 'claims_4wk'] },
};

const HISTORY_ROWS = 12;

export function EconomyKindClient({ data }: { data: EconomyPageData }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  useClock(); // re-render release times when the time zone or 12/24h clock changes
  const { kind, latest, history } = data;
  const view = VIEWS[kind];
  const Icon = ECONOMIC_ICONS[kind];
  const label = (key: MetricKey) => t(`metric_${key}`);
  const series: ChartSeries[] = view.chart.series.map((key) => ({ key, label: label(key) }));
  const rows = view.chart.take ? history.slice(-view.chart.take) : history;

  return (
    <ToolPage>
      <Link
        href="/tools/economy"
        className="group mb-5 inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" aria-hidden />
        {t('backToEconomy')}
      </Link>
      <ToolHeader back={false} icon={<Icon />} title={t(`name_${kind}`)} description={t(`about_${kind}`)} />

      <div className="space-y-10">
        {latest ? (
          kind === 'fomc' ? <FedLatest data={data} /> : (
            <section aria-labelledby="economy-latest">
              <ToolSectionTitle meta={fmtPeriod(kind, latest.period, locale)}>
                <span id="economy-latest">{t('latestHeading')}</span>
              </ToolSectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {latest.metrics.map((m, i) => <MetricTile key={m.key} metric={m} label={label(m.key)} headline={i === 0} />)}
              </div>
            </section>
          )
        ) : (
          <p className="rounded-xl border border-border/60 px-5 py-6 text-sm text-muted-foreground">{t('noDataYet')}</p>
        )}

        <NextRelease data={data} />

        {rows.length > 1 && (
          <section aria-labelledby="economy-chart">
            <ToolSectionTitle><span id="economy-chart">{t(`chartTitle_${kind}`)}</span></ToolSectionTitle>
            <EconomyChart
              kind={kind}
              rows={rows}
              series={series}
              type={view.chart.type}
              referenceLine={view.chart.target ? { y: view.chart.target, label: t('fedTarget') } : undefined}
              locale={locale}
              ariaLabel={t(`chartTitle_${kind}`)}
            />
          </section>
        )}

        {kind === 'fomc' && <Projections data={data} />}

        <History data={data} view={view} label={label} />

        <section aria-labelledby="economy-learn" className="border-t border-border/40 pt-6">
          <ToolSectionTitle><span id="economy-learn">{t('learnHeading')}</span></ToolSectionTitle>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href={ECONOMIC_KINDS[kind].lessonHref} className="inline-flex min-h-11 items-center gap-1.5 text-foreground underline-offset-4 hover:underline">
              <GraduationCap className="h-4 w-4 text-muted-foreground" aria-hidden />
              {t('lessonLink')}
            </Link>
            <a
              href={ECONOMIC_KINDS[kind].sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-foreground underline-offset-4 hover:underline"
            >
              {t('readRelease', { source: ECONOMIC_KINDS[kind].sourceName })}
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </a>
          </div>
          <Accordion type="single" collapsible className="mt-2">
            <AccordionItem value="method" className="border-b-0">
              <AccordionTrigger className="text-sm">{t('methodHeading')}</AccordionTrigger>
              <AccordionContent>
                <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{t(`method_${kind}`)}</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <EconomyFooter sources={[ECONOMIC_KINDS[kind].sourceName]} updatedAt={data.updatedAt} />
      </div>
    </ToolPage>
  );
}

function MetricTile({ metric, label, headline }: { metric: Metric; label: string; headline: boolean }) {
  const locale = useIntlLocale();
  return (
    <div className="rounded-xl border border-border/60 bg-card px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono tabular-nums text-foreground ${headline ? 'text-3xl font-semibold' : 'text-2xl font-medium'}`}>
        {fmtMetric(metric.key, metric.actual, locale)}
      </p>
      <div className="mt-1"><Change metric={metric} /></div>
    </div>
  );
}

function FedLatest({ data }: { data: EconomyPageData }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  const upper = data.latest?.metrics.find((m) => m.key === 'rate_upper');
  const lower = data.latest?.metrics.find((m) => m.key === 'rate_lower');
  if (!upper || !lower || !data.latest) return null;
  const changeBp = upper.previous == null ? null : Math.round((upper.actual - upper.previous) * 100);
  const last = data.lastRelease;

  return (
    <section aria-labelledby="economy-latest" className="rounded-xl border border-border/60 bg-card px-5 py-5">
      <p id="economy-latest" className="text-xs font-medium text-muted-foreground">{t('fedRangeLabel')}</p>
      <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-foreground">
        {fmtRange(lower.actual, upper.actual, locale, t('rangeTo'))}
      </p>
      <dl className="mt-3 space-y-1 text-sm">
        {last?.verdict && (
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted-foreground">{t('fedLastMeeting', { date: fmtDay(last.date, locale) })}</dt>
            <dd className="text-foreground">{t(`verdict_${last.verdict}`)}</dd>
          </div>
        )}
        {changeBp != null && (
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted-foreground">{t('fedLastChange', { date: fmtPeriod('fomc', data.latest.period, locale) })}</dt>
            <dd className="tabular-nums text-foreground">
              {t(changeBp > 0 ? 'fedChangeUp' : 'fedChangeDown', { points: (Math.abs(changeBp) / 100).toLocaleString(locale, { minimumFractionDigits: 2 }) })}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function NextRelease({ data }: { data: EconomyPageData }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  const next = data.nextRelease;
  if (!next) return null;
  return (
    <p className="-mt-6 text-sm text-muted-foreground">
      {t(data.kind === 'fomc' ? 'nextMeeting' : 'nextRelease', {
        date: fmtDay(next.date, locale),
        time: fmtReleaseTimeForViewer(next.release_at, t),
      })}
      {next.detail && <span> · {next.detail}</span>}
    </p>
  );
}

function Projections({ data }: { data: EconomyPageData }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  return (
    <section aria-labelledby="economy-odds" className="space-y-6">
      {data.projections.length > 0 && data.projectionsDate && (
        <div>
          <ToolSectionTitle><span>{t('projectionsHeading')}</span></ToolSectionTitle>
          <p className="mb-3 max-w-prose text-sm text-muted-foreground">
            {t('projectionsCaption', { date: fmtDay(data.projectionsDate, locale) })}
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.projections.map((p) => (
              <div key={p.year} className="rounded-xl border border-border/60 bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">{t('projectionsYearEnd', { year: p.year })}</dt>
                <dd className="mt-0.5 font-mono text-lg tabular-nums text-foreground">
                  {`${p.value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div>
        <ToolSectionTitle><span id="economy-odds">{t('oddsHeading')}</span></ToolSectionTitle>
        <p className="max-w-prose text-sm text-muted-foreground">{t('oddsBody')}</p>
        <div className="mt-2 flex flex-wrap gap-x-5 text-sm">
          {[
            ['https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html', 'CME FedWatch'],
            ['https://www.atlantafed.org/research-and-data/data/market-probability-tracker', t('atlantaFedTracker')],
          ].map(([href, name]) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-foreground underline-offset-4 hover:underline">
              {name}
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function History({ data, view, label }: { data: EconomyPageData; view: View; label: (k: MetricKey) => string }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  const { kind } = data;

  if (kind === 'fomc') {
    // Change points only: drop the synthetic window-start and today rows.
    const changes = data.history
      .map((r, i, all) => ({ ...r, prev: all[i - 1]?.values.rate_upper ?? null }))
      .filter((r) => r.prev != null && r.values.rate_upper !== r.prev)
      .reverse()
      .slice(0, HISTORY_ROWS);
    if (changes.length === 0) return null;
    return (
      <section aria-labelledby="economy-history">
        <ToolSectionTitle><span id="economy-history">{t('fedHistoryHeading')}</span></ToolSectionTitle>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">{t('colEffective')}</th>
              <th scope="col" className="py-2 pr-4 font-medium">{t('colNewRange')}</th>
              <th scope="col" className="py-2 text-right font-medium">{t('colChange')}</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((r) => {
              const bp = Math.round(((r.values.rate_upper ?? 0) - (r.prev ?? 0)) * 100);
              return (
                <tr key={r.period} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 pr-4 text-muted-foreground">{fmtPeriod('fomc', r.period, locale)}</td>
                  <td className="py-2.5 pr-4 font-mono tabular-nums">
                    {fmtRange(r.values.rate_lower ?? 0, r.values.rate_upper ?? 0, locale, t('rangeTo'))}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums">
                    {`${bp > 0 ? '+' : '−'}${(Math.abs(bp) / 100).toLocaleString(locale, { minimumFractionDigits: 2 })}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }

  const rows = [...data.history].reverse().slice(0, HISTORY_ROWS);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="economy-history">
      <ToolSectionTitle><span id="economy-history">{t('historyHeading')}</span></ToolSectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">{t('colPeriod')}</th>
              {view.table.map((key) => (
                <th key={key} scope="col" className="py-2 pl-4 text-right font-medium">{label(key)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} className="border-b border-border/40 last:border-0">
                <td className="py-2.5 pr-4 text-muted-foreground">{fmtPeriod(kind, r.period, locale)}</td>
                {view.table.map((key) => (
                  <td key={key} className="py-2.5 pl-4 text-right font-mono tabular-nums">
                    {r.values[key] == null ? '–' : fmtMetric(key, r.values[key]!, locale)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
