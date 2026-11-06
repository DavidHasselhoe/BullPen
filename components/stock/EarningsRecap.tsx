'use client';

/**
 * The latest results recap on the earnings card (lib/ai/earnings-recap.ts):
 * three plain-English points read from the company's press release. Pro sees
 * them; everyone else sees that a recap exists and what Pro adds. Renders
 * nothing until the cron has written one for this report.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { ProBadge } from '@/components/billing/ProBadge';
import { intlLocale } from '@/lib/i18n/intl-locale';

export interface RecapResponse {
  recap: { reportDate: string; bullets: string[]; sourceUrl: string | null } | null;
  locked?: { reportDate: string };
}

/**
 * Called by EarningsCalendar before its own history loads, so the two
 * requests run side by side and the recap doesn't pop in after the card.
 */
export function useEarningsRecap(ticker: string) {
  return useQuery({
    queryKey: ['earnings-recap', ticker],
    queryFn: async (): Promise<RecapResponse> => {
      const res = await fetch(`/api/stock/${encodeURIComponent(ticker)}/earnings-recap`);
      if (!res.ok) throw new Error(`earnings-recap ${res.status}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

const shortDate = (ymd: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));

export function EarningsRecap({ data }: { data: RecapResponse | undefined }) {
  const { t, i18n } = useTranslation('stock');
  const reportDate = data?.recap?.reportDate ?? data?.locked?.reportDate;
  if (!reportDate) return null;
  const label = (
    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {t('earningsRecapLabel', { date: shortDate(reportDate, intlLocale(i18n.language)) })}
      {!data?.recap && <ProBadge />}
    </p>
  );

  if (data?.recap) {
    return (
      <div>
        {label}
        {/* Model-written, shown whole: three short points, never clamped. */}
        <ul className="list-disc space-y-1.5 rounded-lg border border-border/50 py-3 pl-8 pr-4 text-sm leading-relaxed marker:text-muted-foreground">
          {data.recap.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span>{t('earningsRecapSource')}</span>
          {data.recap.sourceUrl && (
            <a
              href={data.recap.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center underline underline-offset-2 transition-colors hover:text-foreground focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
            >
              {t('earningsRecapReadRelease')}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {label}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border/70 px-4 py-3">
        <p className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('earningsRecapLocked')}
        </p>
        {/* The card's own Pro-lock link, as on Insider Transactions below it. */}
        <Link
          href="/upgrade?from=earnings_recap"
          className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
        >
          {t('earningsRecapUnlock')}
        </Link>
      </div>
    </div>
  );
}
