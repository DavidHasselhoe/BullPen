'use client';

import { useTranslation } from 'react-i18next';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { FRED_NOTICE } from '@/lib/market-data/economic-kinds';
import { fmtDay } from './format';

/** Source credit plus the notice FRED's API terms require on every page that shows its data. */
export function EconomyFooter({ sources, updatedAt }: { sources: string[]; updatedAt: string | null }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  return (
    <footer className="space-y-1 border-t border-border/40 pt-5 text-xs leading-relaxed text-muted-foreground">
      <p>
        {t('sourceLine', { sources: [...new Set(sources)].join(', ') })}
        {updatedAt && <> {t('updatedOn', { date: fmtDay(updatedAt.slice(0, 10), locale) })}</>}
      </p>
      <p>
        {/* The notice is required word for word, so it is not translated. */}
        {FRED_NOTICE}{' '}
        <a href="https://fred.stlouisfed.org/docs/api/terms_of_use.html" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          {t('fredTerms')}
        </a>
      </p>
    </footer>
  );
}
