'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, X, Sparkles, ArrowLeft, Loader2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useEntitlements } from '@/hooks/use-entitlements';
import { PRICING, PLAN_COMPARISON } from '@/lib/billing/entitlements';
import { startCheckout } from '@/lib/billing/checkout';
import { EmptyState } from '@/components/ui/EmptyState';

const FAQ = [
  { q: `Is there a free trial?`, a: `Yes — Pro starts with a ${PRICING.trialDays}-day free trial, and there's a ${PRICING.moneyBackDays}-day money-back guarantee. No card needed to use the free plan.` },
  { q: 'Can I cancel anytime?', a: 'Anytime. You keep Pro until the end of the billing period, then drop back to the (still generous) free plan.' },
  { q: 'How is BullPen different from Simply Wall St or Seeking Alpha?', a: 'They meter the basics — Simply Wall St caps free users at 5 company reports a month and has no AI assistant; Seeking Alpha paywalls articles. BullPen keeps unlimited research and the screener free, and Pro adds a real AI analyst — chat, Deep Dives, a daily brief, and "Why did it move?" — for less than their entry price.' },
  { q: 'What counts against the AI limits?', a: 'Only the AI features (chat, Deep Dive, Portfolio Builder, Portfolio Checkup). Everything else — charts, screener, alerts, holdings, Academy — is unlimited on free.' },
];

function Cell({ value, accent }: { value: string | boolean; accent?: boolean }) {
  if (value === true) return <Check className={cn('mx-auto h-4 w-4', accent ? 'text-primary' : 'text-emerald-500')} />;
  if (value === false) return <X className="mx-auto h-4 w-4 text-muted-foreground/30" />;
  return <span className={cn('text-xs font-medium tabular-nums', accent ? 'text-foreground' : 'text-muted-foreground')}>{value}</span>;
}

function UpgradeContent() {
  const { isAuthenticated } = useAuth();
  const { isPro } = useEntitlements();
  const searchParams = useSearchParams();
  // Preselect the plan the user clicked on the landing page (?checkout=monthly|annual).
  const [annual, setAnnual] = useState(searchParams.get('checkout') !== 'monthly');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const justSubscribed = searchParams.get('checkout') === 'success';

  const price = annual ? PRICING.proAnnualPerMonth : PRICING.proMonthly;

  async function handleUpgrade() {
    const cycle = annual ? 'annual' : 'monthly';
    if (!isAuthenticated) {
      // Send them through signup, then back here with the chosen plan to finish checkout.
      const back = `/upgrade?checkout=${cycle}`;
      window.location.href = `/register?redirect=${encodeURIComponent(back)}`;
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
          Home
        </Link>

        {justSubscribed && (
          <div className="mx-auto mb-8 max-w-lg rounded-2xl border border-primary/30 bg-primary/[0.06] p-6">
            <EmptyState
              pose="celebrate"
              title="Welcome to Pro! 🎉"
              description="Your 14-day trial is live and the full AI analyst is unlocked. It can take a few seconds for your account to reflect it."
              imageSize={150}
            >
              <Button asChild>
                <Link href="/dashboard">Start exploring</Link>
              </Button>
            </EmptyState>
          </div>
        )}

        {/* Hero */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">Pricing</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Unlimited research, free.<br className="hidden sm:block" />{' '}
            <span className="text-primary">Pro adds your AI analyst.</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Keep the whole app — advanced charts, full screener, alerts, holdings, Academy — free, with no report caps. Upgrade when you want an analyst that reads the filings, explains the moves, and briefs you every morning.
          </p>
        </div>

        {/* Why upgrade — three things the report-capped apps can't match */}
        <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          {[
            { t: 'No report limits', d: 'Research every stock, unlimited — no monthly cap on how much you can look at.' },
            { t: 'An AI analyst, not just charts', d: 'Ask anything and get a full Deep Dive — not a static report.' },
            { t: 'Learn as you invest', d: 'Academy, streaks, and plain-English explanations on every metric.' },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border bg-card/50 p-4 text-left">
              <p className="text-sm font-semibold text-foreground">{f.t}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>

        {isPro && !justSubscribed && (
          <div className="mx-auto mt-6 flex max-w-md items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-foreground">
            <Crown className="h-4 w-4 text-primary" /> You’re on Pro — thanks for supporting BullPen.
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
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={cn('flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors', annual ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}
            >
              Annual
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">−25%</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="mx-auto mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col rounded-2xl border bg-card p-6">
            <span className="text-lg font-bold">Free</span>
            <p className="mt-1 text-sm text-muted-foreground">Everything to research and track stocks. Unlimited, no card.</p>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums">$0</span>
              <span className="text-sm text-muted-foreground">/ month</span>
            </div>
            {isAuthenticated ? (
              <Button variant="outline" disabled className="mt-5 w-full">Your current plan</Button>
            ) : (
              <Button variant="outline" asChild className="mt-5 w-full"><Link href="/register">Sign up free</Link></Button>
            )}
          </div>

          {/* Pro */}
          <div className="relative flex flex-col rounded-2xl border border-primary bg-gradient-to-b from-primary/[0.06] to-transparent p-6 shadow-lg shadow-primary/10">
            <span className="absolute -top-3 right-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">Most popular</span>
            <span className="flex items-center gap-1.5 text-lg font-bold"><Sparkles className="h-4 w-4 text-primary" /> Pro</span>
            <p className="mt-1 text-sm text-muted-foreground">Your AI analyst + unlimited everything.</p>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums">${price}</span>
              <span className="text-sm text-muted-foreground">/ month</span>
              {annual && <span className="ml-auto text-[11px] font-mono text-muted-foreground/70">billed ${price * 12}/yr</span>}
            </div>
            {isPro ? (
              <Button disabled className="mt-5 w-full">You’re on Pro</Button>
            ) : status === 'done' ? (
              <Button disabled className="mt-5 w-full">✓ You’re on the list</Button>
            ) : (
              <Button onClick={handleUpgrade} disabled={status === 'loading'} className="mt-5 w-full">
                {status === 'loading' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />One sec…</> : `Start your ${PRICING.trialDays}-day free trial`}
              </Button>
            )}
            {!isPro && status === 'idle' && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                No card charged today · Cancel anytime · {PRICING.moneyBackDays}-day money-back
              </p>
            )}
            {status === 'done' && (
              <p className="mt-2 text-center text-xs text-muted-foreground">Self-serve checkout opens soon — we’ll email you.</p>
            )}
            {status === 'error' && (
              <p className="mt-2 text-center text-xs text-red-400">Something went wrong. Please try again.</p>
            )}
          </div>
        </div>

        {/* Comparison */}
        <div className="mx-auto mt-12 max-w-3xl">
          <h2 className="mb-4 text-center text-lg font-semibold">Compare plans</h2>
          <div className="overflow-hidden rounded-2xl border">
            <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Feature</span>
              <span className="text-center">Free</span>
              <span className="text-center text-foreground">Pro</span>
            </div>
            {PLAN_COMPARISON.map((group) => (
              <div key={group.title}>
                <div className="bg-muted/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{group.title}</div>
                {group.rows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-t px-4 py-2.5">
                    <div className="min-w-0">
                      <span className="text-sm text-foreground">{row.label}</span>
                      {row.hint && <span className="block text-[11px] text-muted-foreground/60">{row.hint}</span>}
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
          <h2 className="mb-4 text-center text-lg font-semibold">Questions</h2>
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
