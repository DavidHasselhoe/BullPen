'use client';

import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CompanyLogo } from '@/components/company/CompanyLogo';

interface Props {
  /** The ticker the user was trying to add an alert for. */
  ticker?: string;
  companyName?: string;
  /** The condition they just built, already described (e.g. "New all-time high"). */
  condition?: string;
}

/**
 * Price-alert paywall teaser: the notification the user would have received
 * for the alert they just tried to create, on their real ticker and
 * condition, with two blurred example notifications stacked behind it.
 */
export function AlertsPaywallPreview({ ticker, companyName, condition }: Props) {
  const { t } = useTranslation('billing');
  const symbol = ticker ?? 'NVDA';

  return (
    <div className="relative select-none bg-card px-6 pb-10 pt-8" aria-hidden="true">
      <div className="pointer-events-none mx-4 -mb-9 space-y-1.5 opacity-60 blur-[2px]">
        <div className="h-9 rounded-xl border border-border/60 bg-muted/40" />
        <div className="mx-2 h-9 rounded-xl border border-border/60 bg-muted/30" />
      </div>

      <div className="relative flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left shadow-sm">
        <CompanyLogo name={companyName ?? symbol} ticker={symbol} logoUrl={null} size={28} className="rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Bell className="h-3 w-3" />
            <span>{t('alertsPreviewSource')}</span>
          </div>
          <p className="text-sm font-medium text-foreground">
            <span className="font-mono font-semibold">{symbol}</span>{' '}
            {condition ?? t('alertsPreviewFallbackCondition')}
          </p>
        </div>
      </div>

      {/* Top fade keeps the dialog's close button legible over the preview. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-card to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
    </div>
  );
}
