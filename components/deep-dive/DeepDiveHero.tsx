'use client';

import { useTranslation } from 'react-i18next';
import { CalendarCheck, Clock } from 'lucide-react';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { useEarningsHistory } from '@/hooks/use-earnings-history';
import type { EarningsCalendar as EarningsItem } from '@/lib/finnhub/finnhub-client';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { VerdictBar } from './VerdictBar';
import type { DeepDivePrice } from '@/hooks/use-deep-dive-price';
import type { DeepDiveReport as Report } from '@/lib/ai/deep-dive/schema';

// Relative for the first 24h, then an absolute date — used for BOTH
// generatedAt and dataAsOf so the two dates in the meta line never mismatch
// in format (previously dataAsOf was interpolated raw/unformatted).
export function fmtRelative(iso: string, locale: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (mins < 1) return rtf.format(0, 'minute');
  if (mins < 60) return rtf.format(-mins, 'minute');
  if (mins < 24 * 60) return rtf.format(-Math.floor(mins / 60), 'hour');
  return fmtAbsolute(iso, locale);
}

// dataAsOf is a bare "YYYY-MM-DD" string. new Date("YYYY-MM-DD") parses as
// UTC midnight, and toLocaleDateString then applies the LOCAL timezone,
// which can shift the displayed day by one in the evening at negative UTC
// offsets. Parse the parts explicitly instead of trusting that round-trip.
export function fmtAbsolute(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

const STALE_DAYS = 14;
/** A quarter is reported within ~6-10 weeks of ending. Stored statements whose
 *  latest quarter ended longer than this before the latest report predate it. */
const REPORT_LAG_DAYS = 75;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / DAY_MS;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return (Date.parse(toYmd.slice(0, 10)) - Date.parse(fromYmd.slice(0, 10))) / DAY_MS;
}

/** "YYYY-MM-DD" and minutes past midnight, in New York: earnings dates are exchange dates. */
function etParts(iso: string): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Did this earnings release come out after the report was written? */
function releasedAfter(e: EarningsItem, written: { day: string; minutes: number }): boolean {
  if (e.date !== written.day) return e.date > written.day;
  // Same day: an after-the-close release lands after a report written during the session.
  if (/after/i.test(e.hour)) return written.minutes < 16 * 60;
  if (/before|pre/i.test(e.hour)) return written.minutes < 9 * 60 + 30;
  return false;
}

/**
 * The report's time story, from the company's real earnings dates.
 *
 * "fundamentals as of {date}" used to sit in the meta line. That date is the
 * last quarter in BullPen's stored statements, not how fresh the report is, and
 * on GOOGL it read Jun 30 above a Financials card about July to September.
 * Freshness is now "does it include the latest results", and the stored-data
 * date only appears when it actually lags those results.
 */
function useTimeline(report: Report, when: string) {
  const { data: earnings } = useEarningsHistory(report.ticker);
  const now = etParts(new Date().toISOString());
  const written = etParts(when);
  const released = (earnings ?? [])
    .filter((e) => !e.estimated && !releasedAfter(e, now))
    .sort((a, b) => b.date.localeCompare(a.date));
  const newer = released.find((e) => releasedAfter(e, written));
  const included = released.find((e) => !releasedAfter(e, written));
  const storedLags = !!included && !!report.dataAsOf && daysBetween(report.dataAsOf, included.date) > REPORT_LAG_DAYS;
  return { newer, included, storedLags };
}

interface Props {
  report: Report;
  /** ISO timestamp this report was created/restored — drives the "Generated X ago" meta line. */
  when: string;
  /** Ask Bull / Regenerate, rendered in the top row. Passed in rather than
   *  rendered by the parent beside the hero, so they don't reserve width down
   *  the whole hero column. */
  actions?: React.ReactNode;
  /** Resolved once per report by DeepDiveReport, so every price agrees. */
  price: DeepDivePrice;
}

/**
 * Layer 1 of the report: identity, then the verdict, then one sentence.
 *
 * The stance badge and the old stance+confidence gauge bar used to live here.
 * Both moved into VerdictBar, where the stance now sits beside a real computed
 * health score instead of a lookup-table percentage (see VerdictBar's header
 * for why that number was removed rather than restyled).
 *
 * The risk/catalyst highlight strip that used to close this component moved to
 * ThreeThings (layer 2), which renders it from authored sentences rather than
 * repeating risks[0] and catalysts[0] verbatim.
 */
export function DeepDiveHero({ report, when, actions, price }: Props) {
  const { t } = useTranslation('tools');
  const locale = useIntlLocale();
  const { newer, included, storedLags } = useTimeline(report, when);
  // A report sitting beside today's live price reads as current. New results
  // since it was written are the real reason it isn't; past two weeks, news
  // alone is. This used to also fire on dataAsOf older than two weeks, which is
  // every report: a quarter always ends weeks before it is reported.
  const notice = newer
    ? t('deepDiveNewResultsNotice', { date: fmtAbsolute(newer.date, locale) })
    : daysSince(when) > STALE_DAYS
      ? t('deepDiveStaleNotice', { date: fmtAbsolute(when, locale) })
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogo name={report.companyName} ticker={report.ticker} size={40} className="border border-border/50" loading="eager" />
          <h1 className="min-w-0 text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-tight">
            {report.companyName} <span className="text-muted-foreground font-mono text-base">${report.ticker}</span>
          </h1>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
          <p className="text-xs leading-snug text-muted-foreground sm:max-w-[300px] sm:text-right">
            {t('deepDiveMetaGenerated', { when: fmtRelative(when, locale) })}
            {' · '}
            {t('deepDiveMetaVerify')}
          </p>
        </div>
      </div>

      {notice ? (
        <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs leading-relaxed text-foreground/90">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
          {notice}
        </p>
      ) : included && (
        <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <CalendarCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <div className="space-y-0.5">
            <p>
              <span className="font-medium text-foreground/90">{t('deepDiveTimelineIncludes', { date: fmtAbsolute(included.date, locale) })}</span>
              {' '}{t('deepDiveTimelineWhy')}
            </p>
            {storedLags && report.dataAsOf && (
              <p>{t('deepDiveTimelineStoredData', { date: fmtAbsolute(report.dataAsOf, locale) })}</p>
            )}
          </div>
        </div>
      )}

      <VerdictBar ticker={report.ticker} verdict={report.verdict} price={price} />

      {/* The report's own title, then its single most important takeaway.
          These are the only two prose elements above the fold. */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold leading-snug text-foreground text-balance">
          {report.headline}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-foreground/85">
          {report.verdict.oneLiner}
        </p>
      </div>

    </div>
  );
}
