'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useWatchlist } from '@/hooks/use-watchlist';
import { Logo } from '@/components/landing/Atoms';
import { OnboardingProgress } from '@/components/get-started/OnboardingProgress';
import { TOTAL_STEPS } from '@/components/get-started/GetStartedFlow';
import { PRICING } from '@/lib/billing/entitlements';
import { startCheckout, type BillingCycle } from '@/lib/billing/checkout';
import { trialTermsLine } from '@/lib/billing/trial-copy';
import { trackEvent } from '@/lib/analytics/track';
import '@/components/landing/landing-styles.css';

export default function TrialOfferPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isPro } = useEntitlements();
  const { data: watchlist } = useWatchlist();
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>('annual');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'unavailable'>('idle');

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace('/get-started');
    else if (isPro) router.replace('/dashboard');
  }, [isLoading, isAuthenticated, isPro, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isPro) {
      trackEvent('get_started_step_viewed', { step_key: 'trial_offer', step_number: 5 });
      trackEvent('trial_offer_viewed', {});
    }
  }, [isLoading, isAuthenticated, isPro]);

  if (isLoading || !isAuthenticated || isPro) return null;

  const lead = watchlist?.[0]?.symbol;

  async function start() {
    setStatus('loading');
    trackEvent('trial_offer_started', { cycle });
    const result = await startCheckout(cycle, { returnTo: 'onboarding' });
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    if (result.alreadyPro) {
      router.replace('/dashboard');
      return;
    }
    setStatus(result.waitlisted ? 'unavailable' : 'error');
  }

  const benefits = [
    lead ? `Why Today? explains what moved ${lead}, the day it moves` : 'Why Today? explains what moved a stock, the day it moves',
    'Deep Dive reports on any company, in plain language',
    'A Daily Brief every morning covering your stocks',
    'Unlimited alerts and AI research with Ask Bull',
  ];

  return (
    <div className="bullpen-landing-root dark">
      <div className="page-bg" aria-hidden />
      <div className="page-noise" aria-hidden />
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '24px 0' }}>
          <div className="wrap">
            <Logo size="sm" />
          </div>
        </header>

        <main style={{ padding: '80px 0' }}>
          <div className="wrap" style={{ maxWidth: 520, margin: '0 auto' }}>
            <OnboardingProgress stepIndex={4} totalSteps={TOTAL_STEPS} />

            <h1
              className="headline"
              style={{ margin: '0 0 12px', fontSize: 'clamp(26px, 3.4vw, 34px)', color: 'var(--fg)', textAlign: 'center' }}
            >
              Here&apos;s a one week free trial{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>on us!</span>
            </h1>
            <p style={{ margin: '0 0 28px', textAlign: 'center', fontSize: 16, color: 'var(--fg-muted)' }}>
              Try everything in BullPen Pro for {PRICING.trialDays} days.
            </p>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {benefits.map((b) => (
                <li key={b} style={{ display: 'flex', gap: 10, fontSize: 15, color: 'var(--fg)' }}>
                  <span aria-hidden style={{ color: 'var(--accent)' }}>✓</span>
                  {b}
                </li>
              ))}
            </ul>

            <div role="radiogroup" aria-label="Billing" style={{ display: 'flex', gap: 8, marginTop: 28 }}>
              {(['annual', 'monthly'] as const).map((c) => {
                const selected = cycle === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCycle(c)}
                    style={{
                      flex: 1, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', color: 'var(--fg)',
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{c === 'annual' ? 'Yearly' : 'Monthly'}</span>
                    <span className="mono" style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)' }}>
                      ${c === 'annual' ? PRICING.proAnnualPerMonth : PRICING.proMonthly}/mo{c === 'annual' ? ' billed yearly' : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="btn-brand-solid"
              onClick={start}
              disabled={status === 'loading'}
              style={{ width: '100%', marginTop: 20 }}
            >
              {status === 'loading' ? <><Loader2 size={16} className="animate-spin" aria-hidden /> One moment</> : 'Start my free week'}
            </button>

            <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.6 }}>
              {trialTermsLine(cycle)}{' '}
              <Link href="/terms" style={{ textDecoration: 'underline' }}>Refunds within {PRICING.moneyBackDays} days of your first charge.</Link>
            </p>

            {status === 'error' && (
              <p role="alert" style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--down)' }}>
                We couldn&apos;t open checkout. Please try again.
              </p>
            )}
            {status === 'unavailable' && (
              <p role="status" style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--fg-muted)' }}>
                Trials aren&apos;t available right now. You can start one later from your account.
              </p>
            )}

            <p style={{ margin: '24px 0 0', textAlign: 'center' }}>
              <Link
                href="/dashboard"
                onClick={() => trackEvent('trial_offer_skipped', {})}
                style={{ fontSize: 14, color: 'var(--fg-dim)' }}
              >
                Continue with Free
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
