'use client';

import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntlLocale } from '@/hooks/use-intl-locale';
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

function daysSince(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 0;
  return (Date.now() - new Date(y, m - 1, d).getTime()) / (24 * 60 * 60 * 1000);
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
  const dataStale = !!report.dataAsOf && daysSince(report.dataAsOf) > STALE_DAYS;
  // A report sitting beside today's live price reads as current. Past two
  // weeks, or on fundamentals that old, say so where the verdict is read
  // instead of only in the 12px meta line.
  const stale = daysSince(when) > STALE_DAYS || dataStale;

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
            {report.dataAsOf && (
              <>
                {' · '}
                <span className={cn(dataStale && 'text-amber-500 font-medium')}>
                  {t('deepDiveMetaDataAsOf', { date: fmtAbsolute(report.dataAsOf, locale) })}
                </span>
              </>
            )}
            {' · '}
            {t('deepDiveMetaVerify')}
          </p>
        </div>
      </div>

      {stale && (
        <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs leading-relaxed text-foreground/90">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
          {t('deepDiveStaleNotice', { date: fmtAbsolute(when, locale) })}
        </p>
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
