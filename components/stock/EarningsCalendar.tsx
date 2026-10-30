'use client';

/**
 * EarningsCalendar — beat/miss made visible.
 *
 * Fetches ~15 months of history under its own queryKey (distinct from the
 * upcoming-only snapshot seed) so "Recent Reports" has data to show. Next
 * report leads with a countdown; past quarters render a DeltaBar (actual vs
 * estimate) instead of two bare numbers.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { useEarningsHistory } from '@/hooks/use-earnings-history';
import { DeltaBar } from '@/components/viz/DeltaBar';
import { EarningsEmailSignup } from '@/components/stock/EarningsEmailSignup';
import type { EarningsCalendar as EarningsItem } from '@/lib/finnhub/finnhub-client';
import { fiscalLabel } from '@/lib/finance/fiscal-label';
import { todayET } from '@/lib/dates/calendar-format';

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(dateStr + 'T12:00:00Z'));
}

function formatHour(hour: string, t: TFunction): string {
  const h = hour.toLowerCase();
  if (h === 'pre market' || h === 'bmo' || h === 'before-market-open') return t('earningsPreMarket');
  if (h === 'after hours' || h === 'amc' || h === 'after-market-close') return t('earningsAfterHours');
  return '';
}

/**
 * Calendar days from `today` to a report date, both New York dates. Measuring
 * from now to noon UTC and rounding up said "In 1 day" on the report morning
 * itself until 8:00 ET (CCJ on 2026-10-30).
 */
function daysUntil(dateStr: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(dateStr) - Date.parse(today)) / 86_400_000));
}

/** `companyName` turns on the signed-out "results by email" signup (stock pages only). */
export function EarningsCalendar({ ticker, companyName }: { ticker: string; companyName?: string }) {
  const { t } = useTranslation('stock');
  const { isSimplified } = useExperienceLevel();
  // Report dates are New York dates; a UTC "today" turns over at 8 p.m. ET.
  const today = todayET();

  const { data, isLoading } = useEarningsHistory(ticker);

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-base font-semibold">
            <CalendarIcon className="h-4 w-4" /> {t('earningsCardTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-base font-semibold">
            <CalendarIcon className="h-4 w-4" /> {t('earningsCardTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('earningsNoData')}</p>
        </CardContent>
      </Card>
    );
  }

  const upcoming = data.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  // Finnhub can return several rows for the same fiscal quarter (later rows are
  // revisions/placeholders). Keep one per quarter: the earliest row that has an
  // actual EPS — that's the real report date.
  const pastAll = data.filter((e) => e.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Map<string, EarningsItem>();
  for (const e of pastAll) {
    const key = e.quarter && e.year ? `${e.year}-Q${e.quarter}` : e.date;
    const existing = seen.get(key);
    if (!existing || (existing.epsActual == null && e.epsActual != null)) seen.set(key, e);
  }
  const past = Array.from(seen.values()).sort((a, b) => b.date.localeCompare(a.date));
  const nextEvent = upcoming[0] ?? null;

  const recent = past.slice(0, 5);
  // Unconfirmed reports aren't counted toward the beat/miss streak — the actual
  // EPS hasn't been cross-checked against a filed statement yet, so it shouldn't
  // feed a confidence-implying stat.
  const scored = recent.filter((e) => e.epsActual != null && e.epsEstimate != null && !e.unconfirmed);
  const beats = scored.filter((e) => (e.epsActual as number) >= (e.epsEstimate as number)).length;
  const streakLine =
    scored.length >= 2
      ? beats > scored.length / 2
        ? { text: t('earningsStreakBeat', { count: beats, total: scored.length }), glyph: '▲', cls: 'text-emerald-500' }
        : beats < scored.length / 2
          ? { text: t('earningsStreakMiss', { count: scored.length - beats, total: scored.length }), glyph: '▼', cls: 'text-red-500' }
          : { text: t('earningsStreakBeat', { count: beats, total: scored.length }), glyph: '●', cls: 'text-muted-foreground' }
      : null;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-base font-semibold">
          <CalendarIcon className="h-4 w-4" /> {t('earningsCardTitle')}
        </CardTitle>
        {isSimplified && (
          <p className="text-xs text-muted-foreground mt-1">
            {t('earningsSimplifiedExplainer')}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-2 space-y-5">

        {/* Next earnings — countdown leads */}
        {nextEvent && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{t('earningsNextReportLabel')}</p>
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-accent/30 px-4 py-3">
              <div>
                <p className="text-xl font-semibold tabular-nums leading-none">
                  {(() => {
                    const days = daysUntil(nextEvent.date, today);
                    return days === 0 ? t('earningsToday') : days === 1 ? t('earningsTomorrow') : t('earningsInDays', { count: days });
                  })()}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {formatDate(nextEvent.date)}
                  {nextEvent.quarter && nextEvent.year && ` · ${fiscalLabel(t, { quarter: nextEvent.quarter, year: nextEvent.year, offCalendar: nextEvent.offCalendar })}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {nextEvent.epsEstimate !== null && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{isSimplified ? t('earningsExpectedProfitPerShare') : t('earningsEpsEst')}</p>
                    <p className="text-sm font-medium tabular-nums">${nextEvent.epsEstimate.toFixed(2)}</p>
                  </div>
                )}
                {nextEvent.estimated && (
                  <Badge variant="outline" className="text-xs shrink-0 border-dashed" title={t('earningsEstimatedDateHint')}>
                    {t('earningsEstimatedDate')}
                  </Badge>
                )}
                {formatHour(nextEvent.hour, t) && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {formatHour(nextEvent.hour, t)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {nextEvent && companyName && (
          <EarningsEmailSignup
            symbol={ticker}
            name={companyName}
            date={nextEvent.date}
            estimate={nextEvent.epsEstimate}
            // An unconfirmed actual isn't counted in the streak, so it isn't the sample email either.
            last={recent[0] && !recent[0].unconfirmed ? { date: recent[0].date, actual: recent[0].epsActual, estimate: recent[0].epsEstimate } : null}
          />
        )}

        {/* Upcoming date not announced yet — say so instead of a silent gap */}
        {!nextEvent && recent.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('earningsDateNotAnnounced')}
          </p>
        )}

        {/* Past earnings — actual vs estimate bars */}
        {recent.length > 0 && (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('earningsRecentReportsLabel')}</p>
              {streakLine && (
                <p className="text-xs text-muted-foreground">
                  <span className={streakLine.cls} aria-hidden>{streakLine.glyph}</span> {streakLine.text}
                </p>
              )}
            </div>
            <div className="space-y-1">
              {recent.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 py-2 px-3 rounded-md hover:bg-muted/40 transition-colors"
                >
                  {/* Wraps on phones: it was shrink-0, so date + quarter +
                      "Awaiting filing" pushed the result off the card. */}
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="whitespace-nowrap text-sm font-medium">{formatDate(e.date)}</span>
                    {e.quarter && e.year && (
                      <span className="text-xs text-muted-foreground">{fiscalLabel(t, { quarter: e.quarter, year: e.year, offCalendar: e.offCalendar })}</span>
                    )}
                    {e.unconfirmed && (
                      <Badge variant="outline" className="text-xs">{t('earningsUnconfirmed')}</Badge>
                    )}
                  </div>
                  <DeltaBar
                    className="shrink-0"
                    estimate={e.epsEstimate}
                    actual={e.epsActual}
                    srLabel={
                      e.epsActual != null && e.epsEstimate != null
                        ? t('earningsDeltaSrLabelActual', {
                            actual: e.epsActual.toFixed(2),
                            estimate: e.epsEstimate.toFixed(2),
                            suffix: e.unconfirmed ? t('earningsDeltaSrLabelUnconfirmedSuffix') : '',
                          })
                        : t('earningsDeltaSrLabelEstimate', { estimate: e.epsEstimate?.toFixed(2) ?? '—' })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
