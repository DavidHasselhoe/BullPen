'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, Zap, Sparkles, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DialogTitle } from '@/components/ui/dialog';
import { PRICING } from '@/lib/billing/entitlements';
import type { QuotaState } from '@/lib/billing/quotas';
import { RiskAnalysisPaywallPreview } from './RiskAnalysisPaywallPreview';

interface Props {
  quota?: QuotaState;
  onDismiss: () => void;
}

const BENEFITS = [
  { icon: ShieldAlert, text: 'Unlimited Portfolio Risk Analysis' },
  { icon: Zap, text: 'A daily market brief, in plain English' },
  { icon: Sparkles, text: 'See why your stocks moved with "Why Today?"' },
];

function formatResetDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

export function RiskAnalysisPaywallContent({ quota, onDismiss }: Props) {
  // Annual first, matching /upgrade's own default — it's the price this
  // dialog leads with, same convention as the pricing page.
  const [annual, setAnnual] = useState(true);
  const price = annual ? PRICING.proAnnualPerMonth : PRICING.proMonthly;
  const checkoutHref = `/upgrade?checkout=${annual ? 'annual' : 'monthly'}`;

  return (
    <div className="relative">
      <RiskAnalysisPaywallPreview />

      {/* Mascot badge — a small supporting seal overlapping the preview/content
          seam, the same "badge overlapping a card edge" pattern as /upgrade's
          "Most popular" pill, not a dominant hero illustration. */}
      <div className="relative flex justify-center">
        <div className="absolute -top-5 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/bull-locked.png"
            alt=""
            aria-hidden
            className="h-6 w-6 select-none opacity-90 dark:opacity-80 dark:invert"
          />
        </div>
      </div>

      <div className="px-6 pb-6 pt-7 text-center">
        <DialogTitle className="text-balance">You&apos;ve used your free Portfolio Risk Analysis run this month</DialogTitle>

        <div className="mt-4 space-y-2.5 text-left">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </span>
              <span className="text-sm text-foreground">{text}</span>
            </div>
          ))}
        </div>

        {quota && (
          <p className="mt-3 text-[11px] text-muted-foreground/70">Resets {formatResetDay(quota.resetsAt)}</p>
        )}

        <div className="mt-5 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', !annual ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors', annual ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}
            >
              Yearly
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
                Save 25%
              </span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-center gap-1.5">
          <span className="font-mono text-2xl font-bold tabular-nums text-foreground">${price}</span>
          <span className="text-sm text-muted-foreground">/mo</span>
        </div>
        {annual && (
          <p className="text-[11px] text-muted-foreground/70">billed ${price * 12}/yr</p>
        )}

        <Button asChild className="mt-4 w-full animate-cta-pulse">
          <Link href={checkoutHref}>
            <Crown className="h-3.5 w-3.5" /> Upgrade to Pro · ${price}/mo
          </Link>
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={onDismiss}>
          Maybe later
        </Button>
      </div>
    </div>
  );
}
