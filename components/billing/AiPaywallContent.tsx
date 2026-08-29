'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DialogTitle } from '@/components/ui/dialog';
import { PRICING, PLAN_COMPARISON_UPGRADE_COUNT } from '@/lib/billing/entitlements';
import type { QuotaState } from '@/lib/billing/quotas';

export interface PaywallBenefit {
  icon: LucideIcon;
  text: string;
}

interface Props {
  headline: string;
  benefits: PaywallBenefit[];
  preview: ReactNode;
  quota?: QuotaState;
  /** False for a hard Pro-only gate (e.g. Why Today) — there's no free quota to reset. */
  showResetLine: boolean;
  onDismiss: () => void;
}

function formatResetDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

/**
 * Shared "rich" paywall body: fabricated feature preview, a short value stack,
 * a link to the rest of the benefits, and the pricing toggle/CTA. One
 * component reused across every AI-generation gate (Risk Analysis, Why Today,
 * Ask Bull, Portfolio Builder, Deep Dive) — only the headline/benefits/preview
 * change per feature, so the offer can never drift between them.
 */
export function AiPaywallContent({ headline, benefits, preview, quota, showResetLine, onDismiss }: Props) {
  const { t } = useTranslation('billing');
  // Annual first, matching /upgrade's own default — it's the price this
  // dialog leads with, same convention as the pricing page.
  const [annual, setAnnual] = useState(true);
  const price = annual ? PRICING.proAnnualPerMonth : PRICING.proMonthly;
  const checkoutHref = `/upgrade?checkout=${annual ? 'annual' : 'monthly'}`;
  const moreBenefitsCount = PLAN_COMPARISON_UPGRADE_COUNT - benefits.length;

  return (
    <div className="relative">
      {preview}

      {/* Brand badge — a supporting seal overlapping the preview/content seam,
          the same "badge overlapping a card edge" pattern as /upgrade's
          "Most popular" pill, not a dominant hero illustration. Uses the solid
          bull silhouette (same asset as the nav logo) rather than the
          thin-line mascot art — the line art reads fine at illustration size
          but disappears at badge size, where a solid fill holds up. */}
      <div className="relative flex justify-center">
        <div className="absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/BullPenLogo.png"
            alt=""
            aria-hidden
            className="block h-9 w-9 select-none dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/BullPenLogo-dark.png"
            alt=""
            aria-hidden
            className="hidden h-9 w-9 select-none dark:block"
          />
        </div>
      </div>

      <div className="px-6 pb-6 pt-7 text-center">
        <DialogTitle className="text-balance">{headline}</DialogTitle>

        <div className="mt-4 space-y-2.5 text-left">
          {benefits.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </span>
              <span className="text-sm text-foreground">{text}</span>
            </div>
          ))}
        </div>

        {moreBenefitsCount > 0 && (
          <Link
            href="/upgrade#compare"
            className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t('paywallContentMoreBenefits', { count: moreBenefitsCount })}
          </Link>
        )}

        {showResetLine && quota && (
          <p className="mt-3 text-[11px] text-muted-foreground/70">{t('paywallContentResetLine', { date: formatResetDay(quota.resetsAt) })}</p>
        )}

        <div className="mt-5 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', !annual ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}
            >
              {t('paywallContentMonthly')}
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors', annual ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}
            >
              {t('paywallContentYearly')}
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
                {t('paywallContentSavePct')}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-center gap-1.5">
          <span className="font-mono text-2xl font-bold tabular-nums text-foreground">${price}</span>
          <span className="text-sm text-muted-foreground">{t('paywallContentPerMonth')}</span>
        </div>
        {annual && (
          <p className="text-[11px] text-muted-foreground/70">{t('paywallContentBilledPerYear', { price: price * 12 })}</p>
        )}

        <Button asChild className="mt-4 w-full animate-cta-pulse">
          <Link href={checkoutHref}>
            <Crown className="h-3.5 w-3.5" /> {t('paywallContentUpgradeCta', { price })}
          </Link>
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={onDismiss}>
          {t('paywallContentMaybeLater')}
        </Button>
      </div>
    </div>
  );
}
