'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChartLine } from 'lucide-react';
import { ToolPage, ToolHeader, ToolSectionTitle } from '@/components/tools/ToolHeader';
import { ECONOMIC_ICONS } from '@/components/tools/calendar/EconomicEvents';
import { ClampedText } from '@/components/ui/ClampedText';
import { Skeleton } from '@/components/ui/skeleton';
import { useClock } from '@/hooks/use-clock';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { ECONOMIC_KINDS, economyHref, fmtReleaseTimeShort, viewerIsOutsideET, type EconomicEvent } from '@/lib/market-data/economic-kinds';
import type { EconomyPageData, MetricKey, ResultKind } from '@/lib/market-data/economic-results';
import type { Extreme } from '@/lib/market-data/economy-hub';
import type { EconomySummary, EconomySummaryResponse } from '@/lib/ai/economy-summary-shared';
import { cn } from '@/lib/utils';
import { Change } from './Change';
import { EconomyFooter } from './EconomyFooter';
import { Sparkline } from './Sparkline';
import { fmtDay, fmtMetric, fmtPeriod } from './format';

export type HubKind = EconomyPageData & { extreme: Extreme | null; yearAverage: number | null };

type Force = 'rates' | 'inflation' | 'jobs' | 'growth';

/** The Academy's "big four" forces, minus oil (no licensed series), plus growth. */
const FORCES: Array<{ force: Force; kinds: ResultKind[] }> = [
  { force: 'rates', kinds: ['fomc'] },
  { force: 'inflation', kinds: ['cpi', 'pce'] },
  { force: 'jobs', kinds: ['jobs', 'claims'] },
  { force: 'growth', kinds: ['gdp'] },
];

const SPARK: Record<ResultKind, { type: 'line' | 'bar' | 'step'; key: MetricKey; reference?: number }> = {
  fomc: { type: 'step', key: 'rate_upper' },
  cpi: { type: 'line', key: 'cpi_yoy', reference: 2 },
  pce: { type: 'line', key: 'pce_yoy', reference: 2 },
  jobs: { type: 'bar', key: 'payrolls' },
  gdp: { type: 'bar', key: 'gdp' },
  claims: { type: 'line', key: 'claims' },
};

/**
 * The current minute, client-side only. The page HTML is cached for 15
 * minutes, so "is this release out yet?" is the reader's clock's call. The
 * server snapshot is 0: nothing counts as out until the client has rendered.
 */
function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
}
const useNowMinute = () => useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / 60_000) * 60_000, () => 0);

/** Length of one period, in months, for the span under each sparkline. The Fed's line runs to today. */
const PERIOD_MONTHS: Record<ResultKind, number> = { fomc: 0, cpi: 1, pce: 1, jobs: 1, gdp: 3, claims: 0.25 };

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Where the US economy stands: a shared AI summary on top, this week's
 * releases, then the six releases grouped by the force they speak to, each
 * with its recent history and one measured line of context.
 */
export function EconomyHubClient({ kinds, week, today, factsHash }: { kinds: HubKind[]; week: EconomicEvent[]; today: string; factsHash: string }) {
  const { t, i18n } = useTranslation('economy');
  useClock(); // re-render release times when the time zone or 12/24h clock changes
  const byKind = Object.fromEntries(kinds.map((k) => [k.kind, k])) as Record<ResultKind, HubKind>;
  const updatedAt = kinds.map((p) => p.updatedAt).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const lang = i18n.language;

  const { data, isLoading } = useQuery({
    queryKey: ['economy-summary', lang, factsHash],
    queryFn: async (): Promise<EconomySummaryResponse> => {
      // A summary that can't load just isn't shown: the numbers below stand on their own.
      const res = await fetch(`/api/economy/summary?lang=${encodeURIComponent(lang)}&hash=${factsHash}`).catch(() => null);
      return res?.ok ? res.json() : { status: 'unavailable' };
    },
    staleTime: 10 * 60_000,
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 4000 : false),
  });
  const ready = data?.status === 'ready' ? data : data?.status === 'pending' ? data.previous : null;
  const writing = isLoading || (data?.status === 'pending' && !data.previous);

  return (
    <ToolPage>
      <ToolHeader icon={<ChartLine />} title={t('hubTitle')} description={t('hubSubtitle')} />

      <div className="space-y-10">
        <Summary summary={ready?.summary ?? null} generatedAt={ready?.generatedAt ?? null} writing={writing} updating={data?.status === 'pending' && !!data.previous} />

        <ThisWeek week={week} today={today} />

        <div>
          {FORCES.map(({ force, kinds: ks }) => (
            <section key={force} aria-labelledby={`force-${force}`} className="grid gap-x-10 gap-y-3 border-t border-border/60 py-6 md:grid-cols-[13rem_minmax(0,1fr)]">
              <div>
                <h2 id={`force-${force}`} className="text-base font-semibold text-foreground">{t(`force_${force}`)}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t(`forceAbout_${force}`)}</p>
              </div>
              <div className="min-w-0">
                {ready?.summary ? (
                  <ClampedText lines={4} className="mb-2" textClassName="max-w-prose text-sm leading-relaxed text-foreground text-pretty">
                    {ready.summary[force]}
                  </ClampedText>
                ) : writing ? (
                  <div className="mb-3 space-y-2" aria-hidden><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-3/5" /></div>
                ) : null}
                <ul className="-mx-3 space-y-1">
                  {ks.map((k) => byKind[k] && <Indicator key={k} data={byKind[k]} today={today} />)}
                </ul>
              </div>
            </section>
          ))}
        </div>

        <EconomyFooter sources={kinds.map((p) => ECONOMIC_KINDS[p.kind].sourceName)} updatedAt={updatedAt} />
      </div>
    </ToolPage>
  );
}

function Summary({ summary, generatedAt, writing, updating }: { summary: EconomySummary | null; generatedAt: string | null; writing: boolean; updating: boolean }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  if (!summary && !writing) return null;
  return (
    <section aria-labelledby="economy-summary" aria-busy={writing} className="rounded-xl border border-border/60 bg-card px-5 py-5 sm:px-6">
      <ToolSectionTitle><span id="economy-summary">{t('summaryHeading')}</span></ToolSectionTitle>
      {summary ? (
        <>
          <ClampedText lines={4} textClassName="text-lg font-medium leading-snug text-foreground text-pretty sm:text-xl">
            {summary.headline}
          </ClampedText>
          {summary.watch && (
            <ClampedText lines={4} className="mt-3" textClassName="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{t('summaryWatch')}</span> {summary.watch}
            </ClampedText>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            {updating ? t('summaryUpdating') : t('summaryByline', { date: generatedAt ? fmtDay(generatedAt.slice(0, 10), locale) : '' })}
          </p>
        </>
      ) : (
        <div className="space-y-2.5" role="status">
          <span className="sr-only">{t('summaryWriting')}</span>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-4 h-3.5 w-1/2" />
        </div>
      )}
    </section>
  );
}

function dayLabel(date: string, today: string, locale: string, t: (k: string) => string): string {
  if (date === today) return t('weekToday');
  if (date === addDays(today, 1)) return t('weekTomorrow');
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}

function ThisWeek({ week, today }: { week: EconomicEvent[]; today: string }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  const now = useNowMinute();
  // Times are on the reader's clock; say so when that isn't New York's.
  const localNote = week.length > 0 && viewerIsOutsideET(week[0].release_at) ? t('weekTimesLocal') : undefined;
  return (
    <section aria-labelledby="economy-week">
      <ToolSectionTitle meta={localNote}><span id="economy-week">{t('weekHeading')}</span></ToolSectionTitle>
      {week.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('weekEmpty')}</p>
      ) : (
        <ol className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(10.5rem,1fr))] lg:[grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))]">
          {week.map((e) => {
            const Icon = ECONOMIC_ICONS[e.kind];
            const href = economyHref(e.kind);
            const head = e.results?.[0];
            const isToday = e.date === today;
            // Past its time but not filled yet: the cron fills results within ~15 minutes.
            const outNow = !head && now > 0 && now >= Date.parse(e.release_at);
            return (
              <li
                key={e.id}
                className={cn(
                  'relative rounded-lg border px-3.5 py-3 transition-colors',
                  isToday ? 'border-foreground/25 bg-card' : 'border-border/60',
                  href && 'hover:border-border focus-within:ring-2 focus-within:ring-ring',
                )}
              >
                <p className={cn('text-xs', isToday ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {dayLabel(e.date, today, locale, t)}
                  {!head && !outNow && <span className="font-normal text-muted-foreground">, {fmtReleaseTimeShort(e.release_at)}</span>}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {href ? (
                    <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">{t(`tools:economicName_${e.kind}`)}</Link>
                  ) : (
                    t(`tools:economicName_${e.kind}`)
                  )}
                </p>
                {outNow && <p className="mt-1 text-xs text-muted-foreground">{t('weekOutNow')}</p>}
                {head && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.kind === 'fomc' && e.verdict ? t(`verdict_${e.verdict}`) : (
                      <>{t(`metric_${head.key}`)} <span className="font-mono tabular-nums text-foreground">{fmtMetric(head.key, head.actual, locale)}</span></>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        {t('hubCalendarNote')}{' '}
        <Link href="/tools/calendar?pick=economic" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-foreground underline underline-offset-4 hover:decoration-2">{t('hubCalendarLink')}</Link>
      </p>
    </section>
  );
}

function Indicator({ data, today }: { data: HubKind; today: string }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  const { kind, latest } = data;
  const head = latest?.metrics[0];
  const spark = SPARK[kind];
  const points = data.history
    .filter((r) => r.values[spark.key] != null)
    .map((r) => ({ t: Date.parse(r.period), v: r.values[spark.key]! }));
  // Months the line covers: first to last point, plus the last period itself (a month, a quarter, a week).
  const months = points.length > 1 ? (points.at(-1)!.t - points[0].t) / (30.44 * 86_400_000) + PERIOD_MONTHS[kind] : 0;
  const span = months >= 18 ? t('sparkYears', { count: Math.round(months / 12) }) : months >= 1 ? t('sparkMonths', { count: Math.round(months) }) : null;
  const last = data.lastRelease;
  // Out but not filled yet: the numbers below are still the release before.
  const awaiting = !!last && last.date === today && !last.results_at;
  const isNew = kind !== 'claims' && !!last?.results_at && last.date >= addDays(today, -3) && last.date <= today;
  const next = data.nextRelease;

  /** What the number means (foreground), then when the next one comes (muted). */
  const context: string[] = [];
  if (kind === 'fomc') {
    if (data.lastRelease?.verdict) context.push(`${t('fedLastMeeting', { date: fmtDay(data.lastRelease.date, locale) })} ${t(`verdict_${data.lastRelease.verdict}`)}`);
  } else if (head) {
    if ((kind === 'cpi' || kind === 'pce') && head.key.endsWith('_yoy')) {
      const gap = Math.round((head.actual - 2) * 10) / 10;
      context.push(gap === 0 ? t('vsGoalAt') : t(gap > 0 ? 'vsGoalAbove' : 'vsGoalBelow', { points: Math.abs(gap).toLocaleString(locale, { minimumFractionDigits: 1 }) }));
    }
    const ex = data.extreme;
    if (ex) {
      context.push('since' in ex
        ? t(ex.dir === 'high' ? 'extremeHighSince' : 'extremeLowSince', { period: fmtPeriod(kind, ex.since, locale, true) })
        : t(ex.dir === 'high' ? 'extremeHighYears' : 'extremeLowYears', { years: ex.years }));
    }
    if (data.yearAverage != null) context.push(t('yearAverage', { value: fmtMetric(head.key, data.yearAverage, locale) }));
  }
  let when: string | null = null;
  if (awaiting) when = t('awaitingNumbers');
  else if (next) {
    when = (next.date === today
      ? t(kind === 'fomc' ? 'nextMeetingToday' : 'nextReleaseToday', { time: fmtReleaseTimeShort(next.release_at) })
      : t(kind === 'fomc' ? 'nextMeetingShort' : 'nextReleaseShort', { date: fmtDay(next.date, locale) }));
  }

  const upper = latest?.metrics.find((m) => m.key === 'rate_upper');
  const lower = latest?.metrics.find((m) => m.key === 'rate_lower');

  return (
    <li className="group relative rounded-lg px-3 py-3 transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
      <div className="grid grid-cols-[minmax(0,1fr)_4rem_auto] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_auto] sm:gap-x-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={economyHref(kind)!} className="text-sm font-medium text-foreground after:absolute after:inset-0 focus-visible:outline-none group-hover:underline group-hover:underline-offset-4">
              {t(`name_${kind}`)}
            </Link>
            {isNew && (
              <span className="rounded-full border border-foreground/20 px-1.5 text-xs font-medium leading-4 text-foreground">{t('justReleased')}</span>
            )}
          </p>
          {latest && head && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {kind === 'fomc' ? t('fedRangeShort') : `${t(`metric_${head.key}`)}, ${fmtPeriod(kind, latest.period, locale, true)}`}
            </p>
          )}
        </div>
        {/* Each line covers a different stretch (the Fed five years, claims half a year), so it says which. */}
        <div className="flex flex-col items-center gap-0.5">
          <Sparkline points={points} type={spark.type} reference={spark.reference} className="h-5 w-16 sm:h-9 sm:w-[7.5rem]" />
          {span && <span className="text-xs leading-none text-muted-foreground">{span}</span>}
        </div>
        <div className="text-right">
          {kind === 'fomc' && upper && lower ? (
            <p className="whitespace-nowrap text-xl font-semibold text-foreground">
              <span className="font-mono tabular-nums">{fmtMetric('rate_lower', lower.actual, locale)}</span>
              {' '}<span className="text-sm font-normal text-muted-foreground">{t('rangeTo')}</span>{' '}
              <span className="font-mono tabular-nums">{fmtMetric('rate_upper', upper.actual, locale)}</span>
            </p>
          ) : head ? (
            <>
              <p className="font-mono text-xl font-semibold tabular-nums text-foreground">{fmtMetric(head.key, head.actual, locale)}</p>
              <Change metric={head} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noDataYet')}</p>
          )}
        </div>
      </div>
      {(context.length > 0 || when) && (
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {context.map((c) => <span key={c} className="text-foreground/80">{c}</span>)}
          {when && <span className="text-muted-foreground">{when}</span>}
        </p>
      )}
    </li>
  );
}
