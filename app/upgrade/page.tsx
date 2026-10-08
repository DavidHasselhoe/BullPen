'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowLeft, Check, Crown, Info, Loader2, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BullAiIcon } from '@/components/ai/BullAiIcon';
import { InkBullets } from '@/components/ai/InkText';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useWatchlist } from '@/hooks/use-watchlist';
import { PRICING, PLAN_COMPARISON, type ComparisonRow } from '@/lib/billing/entitlements';
import { planCopyKey } from '@/lib/billing/plan-copy';
import { startCheckout } from '@/lib/billing/checkout';
import { renewalTerms } from '@/lib/billing/trial-copy';
import { trackEvent } from '@/lib/analytics/track';
import { UpgradeSuccessModal } from '@/components/billing/UpgradeSuccessModal';
import { TrialTimeline } from '@/components/billing/TrialTimeline';

/** The comparison is English in entitlements.ts; each string is looked up by a key derived from it. */
function planText(t: TFunction, kind: 'group' | 'row' | 'hint' | 'value', english: string): string {
  return t(planCopyKey(kind, english), { defaultValue: english });
}

const ALL_ROWS = PLAN_COMPARISON.flatMap((g) => g.rows.map((row) => ({ ...row, group: g.title })));
const PRO_ROWS = ALL_ROWS.filter((r) => r.free !== r.pro);
const SHARED_ROWS = ALL_ROWS.filter((r) => r.free === r.pro);

function PlanCell({ value, pro, t }: { value: ComparisonRow['free']; pro?: boolean; t: TFunction }) {
  // Icons alone read as nothing to a screen reader; the words are there for it.
  if (value === true) {
    return (
      <span className="inline-flex justify-center">
        <Check className={cn('h-4 w-4', pro ? 'text-foreground' : 'text-muted-foreground')} aria-hidden />
        <span className="sr-only">{t('upgradeIncluded')}</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex justify-center">
        <Minus className="h-4 w-4 text-muted-foreground/60" aria-hidden />
        <span className="sr-only">{t('upgradeNotIncluded')}</span>
      </span>
    );
  }
  return (
    <span className={cn('text-xs tabular-nums', pro ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
      {planText(t, 'value', value)}
    </span>
  );
}

function PlanTable({ rows, t }: { rows: Array<ComparisonRow & { group: string }>; t: TFunction }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          <th scope="col" className="py-2.5 pr-3 font-medium">{t('upgradeCompareFeature')}</th>
          <th scope="col" className="w-20 py-2.5 text-center font-medium sm:w-28">{t('upgradeCompareFree')}</th>
          <th scope="col" className="w-20 py-2.5 text-center font-semibold text-foreground sm:w-28">{t('upgradeComparePro')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-border/50 last:border-0">
            <th scope="row" className="py-3 pr-3 font-normal">
              <span className="block text-sm text-foreground">{planText(t, 'row', row.label)}</span>
              {row.hint && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{planText(t, 'hint', row.hint)}</span>}
            </th>
            <td className="py-3 text-center"><PlanCell value={row.free} t={t} /></td>
            <td className="py-3 text-center"><PlanCell value={row.pro} pro t={t} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One moment of "a day with Pro": a time, what happens, and what it looks like. */
function Beat({ time, title, desc, children }: { time: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <li className="scroll-reveal relative pl-8">
      {/* The rail's dot */}
      <span aria-hidden className="absolute left-0 top-1.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border border-border bg-background">
        <span className="h-[5px] w-[5px] rounded-full bg-foreground" />
      </span>
      <p className="font-mono text-xs text-muted-foreground">{time}</p>
      <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{desc}</p>
      <div className="mt-4">{children}</div>
    </li>
  );
}

/**
 * A real capture from the app, in the theme the reader is using. The dark
 * captures are taken with the same viewport and crop as the light ones (same
 * pixel size), so swapping them never moves the layout.
 */
function Shot({ src, darkSrc, alt, width, height }: { src: string; darkSrc: string; alt: string; width: number; height: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white ring-1 ring-black/5 dark:bg-card dark:ring-white/5">
      <Image src={src} alt={alt} width={width} height={height} sizes="(max-width: 1024px) 92vw, 568px" className="h-auto w-full dark:hidden" />
      <Image src={darkSrc} alt={alt} width={width} height={height} sizes="(max-width: 1024px) 92vw, 568px" className="hidden h-auto w-full dark:block" />
    </div>
  );
}

function UpgradeContent() {
  const { t } = useTranslation('billing');
  const { isAuthenticated } = useAuth();
  const { isPro } = useEntitlements();
  const { data: watchlist } = useWatchlist();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Preselect the plan the user clicked on the landing page (?checkout=monthly|annual).
  const [annual, setAnnual] = useState(searchParams.get('checkout') !== 'monthly');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [successModalDismissed, setSuccessModalDismissed] = useState(false);
  const justSubscribed = searchParams.get('checkout') === 'success' && !successModalDismissed;
  const cameBackCancelled = searchParams.get('checkout') === 'cancelled';
  // Their own stock makes "why it moved" concrete; the onboarding trial page does the same.
  const lead = watchlist?.[0]?.symbol;

  // Without these the page couldn't be judged: it fired no events at all.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackEvent('upgrade_viewed', { from: searchParams.get('from') ?? null, checkout: searchParams.get('checkout') ?? null });
  }, [searchParams]);

  const price = annual ? PRICING.proAnnualPerMonth : PRICING.proMonthly;
  const terms = renewalTerms(annual ? 'annual' : 'monthly');

  async function handleUpgrade() {
    const cycle = annual ? 'annual' : 'monthly';
    trackEvent('upgrade_checkout_started', { cycle, signed_in: isAuthenticated });
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

  const FAQ = [
    { q: t('upgradeFaqTrialQ'), a: t('upgradeFaqTrialA', { trialDays: PRICING.trialDays, moneyBackDays: PRICING.moneyBackDays }) },
    { q: t('upgradeFaqCardQ'), a: t('upgradeFaqCardA', { trialDays: PRICING.trialDays }) },
    { q: t('upgradeFaqCancelQ'), a: t('upgradeFaqCancelA') },
    { q: t('upgradeFaqCompareQ'), a: t('upgradeFaqCompareA') },
    { q: t('upgradeFaqLimitsQ'), a: t('upgradeFaqLimitsA') },
  ];

  const benefits = [
    lead ? t('upgradeProBenefitWhy', { ticker: lead }) : t('upgradeProBenefitWhyGeneric'),
    t('upgradeProBenefitBrief'),
    t('upgradeProBenefitAsk'),
    t('upgradeProBenefitDeepDive'),
  ];

  const cycleButton = (isAnnual: boolean) => (
    <button
      type="button"
      role="radio"
      aria-checked={annual === isAnnual}
      onClick={() => setAnnual(isAnnual)}
      className={cn(
        'flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        annual === isAnnual ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {isAnnual ? t('upgradeAnnual') : t('upgradeMonthly')}
      {isAnnual && (
        <span className="rounded-full bg-[var(--brand)]/15 px-1.5 py-0.5 text-xs font-semibold text-[var(--brand)]">{t('upgradeAnnualSavePct')}</span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <Link href="/dashboard" className="group mb-8 inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden />
          {t('upgradeBackHome')}
        </Link>

        <UpgradeSuccessModal
          open={justSubscribed}
          onOpenChange={(nextOpen) => { if (!nextOpen) setSuccessModalDismissed(true); }}
        />

        {cameBackCancelled && !isPro && (
          <p role="status" className="mb-8 flex items-start gap-2 rounded-xl border bg-card/50 px-4 py-3 text-sm text-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {t('upgradeCheckoutCancelled')}
          </p>
        )}

        {isPro && !justSubscribed && (
          <p className="mb-8 flex items-center gap-2 rounded-xl border bg-card/50 px-4 py-3 text-sm font-medium text-foreground">
            <Crown className="h-4 w-4" aria-hidden /> {t('upgradeAlreadyProBanner')}
          </p>
        )}

        <div className="grid items-start gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Hero. One serif word, the page's only display moment. */}
        <header className="max-w-3xl lg:col-start-1 lg:row-start-1">
          <h1 className="text-balance text-4xl font-bold tracking-[-0.03em] text-foreground sm:text-5xl">
            {t('upgradeHeroTitle')}{' '}
            <span className="font-normal italic text-[var(--brand)]" style={{ fontFamily: 'var(--font-instrument-serif), serif' }}>
              {t('upgradeHeroTitleAccent')}
            </span>
          </h1>
          {/* Inks in the way Bull's own explanations do. */}
          <InkBullets
            bullets={[t('upgradeHeroDescription')]}
            className="mt-4 block max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          />
        </header>

          {/* The plan card: right after the headline on phones, a sticky companion beside it on desktop. */}
          <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-labelledby="pro-plan-name">
            {/* Phones: the button and its terms come before the bullets, so they
                are on the first screen rather than under the tab bar. */}
            <div className="flex flex-col rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <BullAiIcon pose="idle" size={36} />
                  <h2 id="pro-plan-name" className="text-xl font-bold tracking-tight">{t('upgradeProPlanName')}</h2>
                </div>
                <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-foreground">
                  {t('upgradeTrialBadge', { trialDays: PRICING.trialDays })}
                </span>
              </div>

              <div role="radiogroup" aria-label={t('upgradeBillingCycleAria')} className="mt-5 flex gap-1 rounded-full border bg-muted/40 p-1">
                {cycleButton(false)}
                {cycleButton(true)}
              </div>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight">${price}</span>
                <span className="text-sm text-muted-foreground">{t('upgradePerMonth')}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {annual ? `${t('upgradeBilledPerYear', { price: price * 12 })} · ` : ''}{t('upgradeVatIncluded')}
              </p>

              <ul className="mt-5 space-y-2.5 max-sm:order-1">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              {isPro ? (
                <Button disabled className="mt-6 h-11 w-full">{t('upgradeYoureOnPro')}</Button>
              ) : status === 'done' ? (
                <Button disabled className="mt-6 h-11 w-full">{t('upgradeOnTheList')}</Button>
              ) : (
                <Button onClick={handleUpgrade} disabled={status === 'loading'} className="btn-brand-solid mt-6 h-11 w-full text-sm font-semibold">
                  {status === 'loading'
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{t('upgradeOneSec')}</>
                    : t('upgradeStartTrial', { trialDays: PRICING.trialDays })}
                </Button>
              )}
              {!isPro && status === 'idle' && (
                // Renewal terms, next to the button that starts the purchase.
                // Left in English from one shared source: a machine-translated
                // auto-renewal disclosure is a legal statement nobody has
                // checked, in six languages. See lib/billing/trial-copy.ts.
                <div className="mt-3 space-y-1 text-center text-xs leading-relaxed text-muted-foreground">
                  <p className="font-medium text-foreground/85">{terms.chargeLine}</p>
                  <p>{terms.cancelLine}</p>
                </div>
              )}
              {status === 'done' && <p className="mt-3 text-center text-xs text-muted-foreground">{t('upgradeCheckoutSoon')}</p>}
              {status === 'error' && <p role="alert" className="mt-3 text-center text-xs text-destructive">{t('upgradeCheckoutError')}</p>}

              {/* What happens when, before they commit: Pro today, a reminder, then the charge. */}
              {!isPro && (
                <div className="mt-5 border-t pt-4 max-sm:order-2">
                  <TrialTimeline annual={annual} />
                  <p className="mt-3 text-xs text-muted-foreground">{t('upgradeRefundNote', { moneyBackDays: PRICING.moneyBackDays })}</p>
                </div>
              )}
            </div>

            {!isPro && (
              <p className="mt-4 px-1 text-sm text-muted-foreground">
                {t('upgradeFreeNote')}
                {!isAuthenticated && (
                  <> <Link href="/register" className="font-medium text-foreground underline underline-offset-4">{t('upgradeSignUpFree')}</Link></>
                )}
              </p>
            )}
          </aside>

          {/* A day with Pro, shown with real captures from the app. */}
          <section aria-labelledby="day-heading" className="lg:col-start-1 lg:row-start-2">
            <h2 id="day-heading" className="text-sm font-medium text-muted-foreground">{t('upgradeDayHeading')}</h2>
            <ol className="relative mt-6 space-y-14 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-border">
              <Beat time={t('upgradeBeatBriefTime')} title={t('upgradeBeatBriefTitle')} desc={t('upgradeBeatBriefDesc')}>
                <Shot src="/screenshots/bento-brief.png" darkSrc="/screenshots/bento-brief-dark.png" alt={t('upgradeBeatBriefAlt')} width={568} height={231} />
              </Beat>
              {/* Generic on purpose: the capture shows another stock, so naming theirs would mislabel it. */}
              <Beat time={t('upgradeBeatWhyTime')} title={t('upgradeBeatWhyTitleGeneric')} desc={t('upgradeBeatWhyDesc')}>
                <Shot src="/screenshots/bento-why.png" darkSrc="/screenshots/bento-why-dark.png" alt={t('upgradeBeatWhyAlt')} width={568} height={307} />
              </Beat>
              <Beat time={t('upgradeBeatAskTime')} title={t('upgradeBeatAskTitle')} desc={t('upgradeBeatAskDesc')}>
                {/* Questions only: an invented answer would be a fake product shot. */}
                <div className="flex items-end gap-3 rounded-xl border bg-card/50 p-4">
                  <BullAiIcon pose="wave" size={56} className="shrink-0" />
                  <div className="flex min-w-0 flex-col items-end gap-2">
                    {[t('upgradeBeatAskExample1'), t('upgradeBeatAskExample2'), t('upgradeBeatAskExample3')].map((q) => (
                      <span key={q} className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">{q}</span>
                    ))}
                  </div>
                </div>
              </Beat>
            </ol>
          </section>
        </div>

        {/* What Pro adds: only the rows that differ. The rest wait behind a toggle. */}
        <section aria-labelledby="compare-heading" id="compare" className="mt-24 max-w-3xl scroll-mt-24">
          <h2 id="compare-heading" className="text-2xl font-bold tracking-tight">{t('upgradeWhatProAdds')}</h2>
          <div className="mt-5 rounded-2xl border bg-card/40 px-4 sm:px-5">
            <PlanTable rows={PRO_ROWS} t={t} />
          </div>
          <Accordion type="single" collapsible className="mt-3">
            <AccordionItem value="shared" className="rounded-2xl border bg-card/20 px-4 sm:px-5">
              <AccordionTrigger className="text-sm">{t('upgradeAlreadyFree', { count: SHARED_ROWS.length })}</AccordionTrigger>
              <AccordionContent>
                <PlanTable rows={SHARED_ROWS} t={t} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-heading" className="mt-20 max-w-3xl">
          <h2 id="faq-heading" className="text-2xl font-bold tracking-tight">{t('upgradeQuestionsHeading')}</h2>
          <Accordion type="single" collapsible className="mt-4">
            {FAQ.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-left text-sm font-medium">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
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
