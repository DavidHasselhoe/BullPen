'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Check, X, Sparkles, ArrowLeft, Loader2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useEntitlements } from '@/hooks/use-entitlements';
import { PRICING, PLAN_COMPARISON } from '@/lib/billing/entitlements';
import { startCheckout } from '@/lib/billing/checkout';
import { UpgradeSuccessModal } from '@/components/billing/UpgradeSuccessModal';

function Cell({ value, accent }: { value: string | boolean; accent?: boolean }) {
  if (value === true) return <Check className={cn('mx-auto h-4 w-4', accent ? 'text-primary' : 'text-emerald-500')} />;
  if (value === false) return <X className="mx-auto h-4 w-4 text-muted-foreground/80" />;
  return <span className={cn('text-xs font-medium tabular-nums', accent ? 'text-foreground' : 'text-muted-foreground')}>{value}</span>;
}

function UpgradeContent() {
  const { t } = useTranslation('billing');
  const { isAuthenticated } = useAuth();
  const { isPro } = useEntitlements();
  const searchParams = useSearchParams();
  const router = useRouter();

  const FAQ = [
    { q: t('upgradeFaqTrialQ'), a: t('upgradeFaqTrialA', { trialDays: PRICING.trialDays, moneyBackDays: PRICING.moneyBackDays }) },
    { q: t('upgradeFaqCancelQ'), a: t('upgradeFaqCancelA') },
    { q: t('upgradeFaqCompareQ'), a: t('upgradeFaqCompareA') },
    { q: t('upgradeFaqLimitsQ'), a: t('upgradeFaqLimitsA') },
  ];

  const WHY_UPGRADE = [
    { t: t('upgradeWhyNoLimitsTitle'), d: t('upgradeWhyNoLimitsDesc') },
    { t: t('upgradeWhyAnalystTitle'), d: t('upgradeWhyAnalystDesc') },
    { t: t('upgradeWhyLearnTitle'), d: t('upgradeWhyLearnDesc') },
  ];
  // Preselect the plan the user clicked on the landing page (?checkout=monthly|annual).
  const [annual, setAnnual] = useState(searchParams.get('checkout') !== 'monthly');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [successModalDismissed, setSuccessModalDismissed] = useState(false);
  const justSubscribed = searchParams.get('checkout') === 'success' && !successModalDismissed;

  const price = annual ? PRICING.proAnnualPerMonth : PRICING.proMonthly;

  async function handleUpgrade() {
    const cycle = annual ? 'annual' : 'monthly';
    if (!isAuthenticated) {
      // Send them through signup, then back here with the chosen plan to finish checkout.
      const back = `/upgrade?checkout=${cycle}`;
      router.push(`/register?redirect=${encodeURIComponent(back)}`);
      return;
    }
    setStatus('loading');
    const result = await startCheckout(cycle);
    if (result.url) { window.location.href = result.url; return; } // real Stripe checkout
    setStatus(result.error ? 'error' : 'done');
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <Link href="/dashboard" className="group mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          {t('upgradeBackHome')}
        </Link>

        <UpgradeSuccessModal
          open={justSubscribed}
          onOpenChange={(nextOpen) => { if (!nextOpen) setSuccessModalDismissed(true); }}
        />

        {/* Hero */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">{t('upgradeHeroEyebrow')}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('upgradeHeroTitlePrefix')}<br className="hidden sm:block" />{' '}
            <span className="text-primary">{t('upgradeHeroTitleSuffix')}</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            {t('upgradeHeroDescription')}
          </p>
        </div>

        {/* Why upgrade — three things the report-capped apps can't match */}
        <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          {WHY_UPGRADE.map((f) => (
            <div key={f.t} className="rounded-xl border bg-card/50 p-4 text-left">
              <p className="text-sm font-semibold text-foreground">{f.t}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>

        {isPro && !justSubscribed && (
          <div className="mx-auto mt-6 flex max-w-md items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-foreground">
            <Crown className="h-4 w-4 text-primary" /> {t('upgradeAlreadyProBanner')}
          </div>
        )}

        {/* Billing toggle */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={cn('rounded-full px-4 py-1.5 text-sm font-medium transition-colors', !annual ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}
            >
              {t('upgradeMonthly')}
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={cn('flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors', annual ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}
            >
              {t('upgradeAnnual')}
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-500">{t('upgradeAnnualSavePct')}</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="mx-auto mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col rounded-2xl border bg-card p-6">
            <span className="text-lg font-bold">{t('upgradeFreePlanName')}</span>
            <p className="mt-1 text-sm text-muted-foreground">{t('upgradeFreePlanDescription')}</p>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums">$0</span>
              <span className="text-sm text-muted-foreground">{t('upgradePerMonth')}</span>
            </div>
            {isAuthenticated ? (
              <Button variant="outline" disabled className="mt-5 w-full">{t('upgradeCurrentPlan')}</Button>
            ) : (
              <Button variant="outline" asChild className="mt-5 w-full"><Link href="/register">{t('upgradeSignUpFree')}</Link></Button>
            )}
          </div>

          {/* Pro */}
          <div className="relative flex flex-col rounded-2xl border border-primary bg-gradient-to-b from-primary/[0.06] to-transparent p-6 shadow-lg shadow-primary/10">
            <span className="absolute -top-3 right-5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">{t('upgradeMostPopular')}</span>
            <span className="flex items-center gap-1.5 text-lg font-bold"><Sparkles className="h-4 w-4 text-primary" /> {t('upgradeProPlanName')}</span>
            <p className="mt-1 text-sm text-muted-foreground">{t('upgradeProPlanDescription')}</p>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums">${price}</span>
              <span className="text-sm text-muted-foreground">{t('upgradePerMonth')}</span>
              {annual && <span className="ml-auto text-[11px] font-mono text-muted-foreground/85">{t('upgradeBilledPerYear', { price: price * 12 })}</span>}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground/80">{t('upgradeVatIncluded')}</p>
            {isPro ? (
              <Button disabled className="mt-5 w-full">{t('upgradeYoureOnPro')}</Button>
            ) : status === 'done' ? (
              <Button disabled className="mt-5 w-full"><Check className="mr-1 h-4 w-4" aria-hidden />{t('upgradeOnTheList')}</Button>
            ) : (
              <Button onClick={handleUpgrade} disabled={status === 'loading'} className="mt-5 w-full">
                {status === 'loading' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('upgradeOneSec')}</> : t('upgradeStartTrial', { trialDays: PRICING.trialDays })}
              </Button>
            )}
            {!isPro && status === 'idle' && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {t('upgradeNoCardFooter', { moneyBackDays: PRICING.moneyBackDays })}
              </p>
            )}
            {status === 'done' && (
              <p className="mt-2 text-center text-xs text-muted-foreground">{t('upgradeCheckoutSoon')}</p>
            )}
            {status === 'error' && (
              <p className="mt-2 text-center text-xs text-red-400">{t('upgradeCheckoutError')}</p>
            )}
          </div>
        </div>

        {/* Comparison */}
        <div id="compare" className="mx-auto mt-12 max-w-3xl scroll-mt-20">
          <h2 className="mb-4 text-center text-lg font-semibold">{t('upgradeComparePlans')}</h2>
          <div className="overflow-hidden rounded-2xl border">
            <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{t('upgradeCompareFeature')}</span>
              <span className="text-center">{t('upgradeCompareFree')}</span>
              <span className="text-center text-foreground">{t('upgradeComparePro')}</span>
            </div>
            {PLAN_COMPARISON.map((group) => (
              <div key={group.title}>
                <div className="bg-muted/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{group.title}</div>
                {group.rows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-t px-4 py-2.5">
                    <div className="min-w-0">
                      <span className="text-sm text-foreground">{row.label}</span>
                      {row.hint && <span className="block text-[11px] text-muted-foreground/80">{row.hint}</span>}
                    </div>
                    <div className="text-center"><Cell value={row.free} /></div>
                    <div className="rounded-md bg-primary/[0.03] py-1 text-center"><Cell value={row.pro} accent /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mx-auto mt-12 max-w-2xl">
          <h2 className="mb-4 text-center text-lg font-semibold">{t('upgradeQuestionsHeading')}</h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">{item.q}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense>
      <UpgradeContent />
    </Suspense>
  );
}
