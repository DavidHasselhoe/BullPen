'use client';

import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown } from 'lucide-react';
import type { QuotaState } from '@/lib/billing/quotas';
import { AiPaywallContent } from './AiPaywallContent';
import { getAiPaywallConfig } from './paywall-config';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Human-readable feature name, e.g. "Portfolio Builder" */
  featureName: string;
  /** Quota state from the 402 response (used to compose the message). Optional — falls back to generic copy. */
  quota?: QuotaState;
}

function formatReset(iso: string, period: 'day' | 'month'): string {
  const d = new Date(iso);
  if (period === 'day') return `at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return `on ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
}

export function AiPaywallDialog({ open, onOpenChange, featureName, quota }: Props) {
  const { t } = useTranslation('billing');
  const isProOnly = quota?.reason === 'pro_only';
  // Pro user who hit a cost-protection soft cap — they're already Pro, so don't upsell.
  const isProCap = quota?.reason === 'pro_cap_reached';

  const headline = isProCap
    ? t('aiPaywallHeadlineCap', { featureName })
    : isProOnly
    ? t('aiPaywallHeadlineProOnly', { featureName })
    : quota?.limit === 1
    ? (quota?.period === 'day' ? t('aiPaywallHeadlineUsedRunToday', { featureName }) : t('aiPaywallHeadlineUsedRunMonth', { featureName }))
    : (quota?.period === 'day' ? t('aiPaywallHeadlineUsedRunsToday', { featureName }) : t('aiPaywallHeadlineUsedRunsMonth', { featureName }));

  // Every AI-generation gate gets the richer, feature-specific upsell (value
  // stack, price, annual toggle, fabricated result preview) via
  // getAiPaywallConfig — one shared AiPaywallContent, only the benefits/preview
  // differ per feature. isProCap still falls through to the generic "Got it"
  // content below since that user is already Pro and shouldn't be upsold.
  const config = getAiPaywallConfig(t)[featureName];
  if (config && !isProCap) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="overflow-hidden p-0 text-center sm:max-w-sm" showCloseButton>
          <AiPaywallContent
            headline={headline}
            benefits={config.benefits}
            preview={config.preview}
            quota={quota}
            showResetLine={!isProOnly}
            onDismiss={() => onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  let body: string;
  if (isProCap && quota) {
    body = t('aiPaywallBodyCapWithReset', { limit: quota.limit, featureName, reset: formatReset(quota.resetsAt, quota.period) });
  } else if (isProCap) {
    body = t('aiPaywallBodyCapNoReset', { limit: 0, featureName });
  } else if (isProOnly) {
    body = t('aiPaywallBodyProOnly', { featureName });
  } else if (quota) {
    body = t('aiPaywallBodyLimitReset', { reset: formatReset(quota.resetsAt, quota.period) });
  } else {
    body = t('aiPaywallBodyGeneric', { featureName });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm text-center">
        <DialogHeader className="items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={isProCap ? '/illustrations/bull-sleeping.png' : '/illustrations/bull-locked.png'}
            alt=""
            aria-hidden
            width={104}
            className="mb-1 h-auto select-none opacity-90 dark:opacity-80 dark:invert"
          />
          <DialogTitle className="text-balance">{headline}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground leading-relaxed text-pretty">{body}</p>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {isProCap ? (
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              {t('aiPaywallGotIt')}
            </Button>
          ) : (
            <>
              <Button asChild className="w-full animate-cta-pulse">
                <a href="/upgrade">
                  <Crown className="h-3.5 w-3.5" /> {t('aiPaywallUnlockEverything')}
                </a>
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                {t('aiPaywallMaybeLater')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
