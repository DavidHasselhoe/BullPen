'use client';

import { useState } from 'react';
import { SectionHeading } from './Atoms';
import { Icon } from './Icon';
import { PRICING, FREE_WATCHLISTS, FREE_ALERT_STOCKS } from '@/lib/billing/entitlements';
import { QUOTAS } from '@/lib/billing/quotas';
import { renewalTerms } from '@/lib/billing/trial-copy';
import { useTrialDays } from '@/hooks/use-trial-days';

interface Props {
  onSignUp: () => void;
  /** Pro CTA — carries the chosen billing cycle so checkout resumes after signup. */
  onSubscribe?: (cycle: 'monthly' | 'annual') => void;
}

interface Plan {
  name: string;
  tagline: string;
  monthly: number;
  annualMo: number;
  cta: string;
  ctaStyle: 'primary' | 'ghost';
  highlight?: boolean;
  /** The first `lead` rows are what a beginner compares on; the rest open with "See everything". */
  features: string[];
  lead: number;
}

/**
 * Plan copy is derived from `lib/billing/entitlements.ts` and `quotas.ts` —
 * the same modules the server-side gates and the /upgrade page read from.
 *
 * That file's own header says it exists "so the offer and the marketing copy
 * can never drift", but this page had been hardcoding its own list, and had
 * drifted badly: it advertised "20 AI chat messages / month" against a real
 * limit of 15 *per day* (understating by roughly 20x), described the screener
 * as capped at "3 saved filters" when 3 is the watchlist limit and the screener
 * isn't capped at all, and promised "SEC filing alerts & summaries", which is
 * not an entitlement that exists. Reading the real values means those three
 * classes of error can't recur.
 *
 * 2026-11-24 critique: 19 bullets at once was a wall a beginner can't compare.
 * Each plan now leads with the rows that differ (`lead`) and the rest wait
 * behind one "See everything" toggle; the trial is stated once, at the button.
 */
const PLANS: Plan[] = [
  {
    name: 'Free',
    tagline: 'Everything to start exploring.',
    monthly: 0,
    annualMo: 0,
    cta: 'Start for free',
    ctaStyle: 'ghost',
    lead: 4,
    features: [
      'Unlimited stock, ETF, crypto & commodity pages, with a health grade for every stock',
      '“Why Today?” for your biggest mover each day',
      `${QUOTAS.chat.count} questions to Bull, the AI assistant, a day`,
      `Holdings tracking, ${FREE_WATCHLISTS} watchlists with scorecards, alerts on ${FREE_ALERT_STOCKS} stocks`,
      'Full stock screener & company compare',
      `${QUOTAS.deep_dive.count} AI research report & ${QUOTAS.portfolio_builder.count} portfolio plans a month`,
      'Economy results, market calendar & Congress trades',
      "Bull's Weekly Pick and its full track record",
      'Academy beginner courses & daily challenge',
    ],
  },
  {
    name: 'Pro',
    tagline: 'For when BullPen becomes your daily check-in.',
    monthly: PRICING.proMonthly,
    annualMo: PRICING.proAnnualPerMonth,
    cta: `Start free ${PRICING.trialDays}-day trial`,
    ctaStyle: 'primary',
    highlight: true,
    lead: 5,
    features: [
      'Everything in Free',
      'Daily Brief: a short market read every morning',
      '“Why Today?” for any stock, any day',
      `${QUOTAS.chat.proCap} questions to Bull a day, unlimited portfolio plans & checkups`,
      'Automatic sync with Robinhood, Schwab, Fidelity & more',
      "The full thesis behind Bull's Weekly Pick",
      'Full holdings of famous funds like Berkshire',
      'Your watchlist charted against the S&P 500',
      'Unlimited watchlists & price alerts',
      'Insider trades, exports & advanced Academy courses',
    ],
  },
];

const SAVE_PCT = Math.round(100 * (1 - PRICING.proAnnualPerMonth / PRICING.proMonthly));

export function Pricing({ onSignUp, onSubscribe }: Props) {
  const [annual, setAnnual] = useState(true);
  const [showAll, setShowAll] = useState(false);
  // A signed-in invitee gets a longer trial, and checkout starts straight from
  // this section, so its disclosure has to state their real length.
  const { days: trialDays } = useTrialDays();

  const cycleButton = (isAnnual: boolean) => {
    const on = annual === isAnnual;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setAnnual(isAnnual)}
        style={{
          minHeight: 44,
          padding: '10px 18px',
          borderRadius: 99,
          border: 'none',
          // Ink, not emerald: the selected cycle is a UI state, not a gain (One Signal Rule).
          background: on ? 'var(--fg)' : 'transparent',
          color: on ? 'var(--bg)' : 'var(--fg-muted)',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          transition: 'background 200ms, color 200ms',
        }}
      >
        {isAnnual ? 'Annual' : 'Monthly'}
        {isAnnual && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 99,
              border: '1px solid currentColor',
            }}
          >
            {/* Same wording as /upgrade and the paywall. "3 months free" was the same
                maths, but beside the 7-day trial it read as a second free offer. */}
            Save {SAVE_PCT}%
          </span>
        )}
      </button>
    );
  };

  return (
    <section id="pricing" className="landing-section">
      <div className="wrap">
        <SectionHeading
          title={
            <>
              Free to start.{' '}
              Pro{' '}
              when you&apos;re ready.
            </>
          }
          sub="No card to sign up. Upgrade when you want a brief every morning and “Why Today?” for any stock."
        />
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div
            role="group"
            aria-label="Billing"
            style={{
              display: 'inline-flex',
              gap: 2,
              padding: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 99,
              alignItems: 'center',
            }}
          >
            {cycleButton(false)}
            {cycleButton(true)}
          </div>
        </div>

        <div
          className="pricing-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, maxWidth: 880, margin: '0 auto' }}
        >
          {PLANS.map((p) => {
            const price = annual ? p.annualMo : p.monthly;
            const rows = showAll ? p.features : p.features.slice(0, p.lead);
            return (
              <div
                key={p.name}
                style={{
                  background: 'var(--surface)',
                  // A firmer border marks Pro; no gradient or resting glow
                  // (Earned-Depth Rule: only the CTA glows at rest).
                  border: p.highlight ? '2px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 18,
                  padding: p.highlight ? 31 : 32,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--fg)' }}>{p.name}</span>
                </div>
                <p style={{ margin: '0 0 24px', fontSize: 15, color: 'var(--fg-muted)', textWrap: 'pretty' }}>{p.tagline}</p>

                <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--fg)' }}>
                    ${price}
                  </span>
                  <span style={{ fontSize: 15, color: 'var(--fg-muted)' }}>/ month</span>
                  {annual && price > 0 && (
                    <span style={{ fontSize: 13, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                      billed ${price * 12}/yr
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={
                    p.highlight && onSubscribe
                      ? () => onSubscribe(annual ? 'annual' : 'monthly')
                      : onSignUp
                  }
                  className={`btn btn-${p.ctaStyle}`}
                  style={{ justifyContent: 'center', padding: '14px', fontSize: 15, marginBottom: 24 }}
                >
                  {p.name === 'Pro' ? `Start free ${trialDays}-day trial` : p.cta}
                  <Icon name="arrowRight" size={14} />
                </button>

                {/* Renewal terms belong with the button that starts the
                    purchase, not only in the FAQ or the terms of service. */}
                {p.highlight && onSubscribe && (
                  <div
                    style={{
                      margin: '-12px 0 24px',
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: 'var(--fg-dim)',
                      textWrap: 'pretty',
                    }}
                  >
                    <p style={{ margin: 0, color: 'var(--fg-muted)' }}>
                      {renewalTerms(annual ? 'annual' : 'monthly', { days: trialDays }).chargeLine}
                    </p>
                    <p style={{ margin: '2px 0 0' }}>
                      {renewalTerms(annual ? 'annual' : 'monthly', { days: trialDays }).cancelLine}
                    </p>
                  </div>
                )}

                <ul
                  id={`plan-${p.name.toLowerCase()}-features`}
                  style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  {rows.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        fontSize: 15,
                        color: 'var(--fg)',
                        lineHeight: 1.5,
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          width: 18,
                          height: 18,
                          borderRadius: 99,
                          background: 'var(--surface-2)',
                          color: 'var(--fg)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 3,
                        }}
                      >
                        <Icon name="check" size={11} stroke={2.4} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={showAll}
            aria-controls={PLANS.map((p) => `plan-${p.name.toLowerCase()}-features`).join(' ')}
            onClick={() => setShowAll((s) => !s)}
            style={{ fontSize: 15, padding: '11px 18px', minHeight: 44 }}
          >
            {showAll ? 'Show less' : 'See everything in each plan'}
          </button>
        </div>

        <div
          style={{
            marginTop: 28,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            fontSize: 14,
            color: 'var(--fg-dim)',
          }}
        >
          {/* From PRICING in entitlements.ts. The trial is not repeated here:
              the Pro button already says it, next to its renewal terms. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check" size={14} />
            {PRICING.moneyBackDays}-day money-back guarantee
          </span>
          <span aria-hidden style={{ width: 3, height: 3, background: 'var(--fg-dim)', borderRadius: 99, opacity: 0.5 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check" size={14} />
            Cancel anytime
          </span>
        </div>
      </div>
    </section>
  );
}
