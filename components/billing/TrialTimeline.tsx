'use client';

import { useTranslation } from 'react-i18next';
import { Bell, CreditCard, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRICING } from '@/lib/billing/entitlements';

/**
 * What happens when, laid out before the trial starts: Pro today, a reminder
 * email before the trial ends, the first charge on the last day. Showing the
 * reminder up front is the honest version of a trial, and it converts: a
 * timeline like this raised trial starts 23% and cut cancellations at Blinkist.
 *
 * The reminder lands 3 days before the trial ends (Stripe's trial_will_end,
 * see app/api/billing/webhook), so the day is computed, not written in.
 */
export function TrialTimeline({ annual, className }: { annual: boolean; className?: string }) {
  const { t } = useTranslation('billing');
  const charge = annual ? PRICING.proAnnualPerMonth * 12 : PRICING.proMonthly;
  const reminderDay = PRICING.trialDays - 3;
  const steps = [
    { icon: Unlock, when: t('trialTimelineToday'), what: t('trialTimelineTodayDesc') },
    { icon: Bell, when: t('trialTimelineDay', { day: reminderDay }), what: t('trialTimelineReminderDesc') },
    {
      icon: CreditCard,
      when: t('trialTimelineDay', { day: PRICING.trialDays }),
      what: annual ? t('trialTimelineChargeAnnual', { price: charge }) : t('trialTimelineChargeMonthly', { price: charge }),
    },
  ];

  return (
    <ol className={cn('relative space-y-3', className)}>
      {steps.map(({ icon: Icon, when, what }, i) => (
        <li key={when} className="relative flex gap-3">
          {/* Connector between the steps */}
          {i < steps.length - 1 && <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-4px)] w-px bg-border" />}
          <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background">
            <Icon className="h-3 w-3 text-foreground" aria-hidden />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-xs font-semibold text-foreground">{when}</p>
            <p className="text-xs leading-snug text-muted-foreground">{what}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
