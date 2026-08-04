'use client';

import { useState } from 'react';
import { Reveal, SectionHeading } from './Atoms';
import { Icon } from './Icon';
import { PRICING, FREE_WATCHLISTS, FREE_ALERT_STOCKS } from '@/lib/billing/entitlements';
import { QUOTAS } from '@/lib/billing/quotas';

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
  features: string[];
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
 */
const PLANS: Plan[] = [
  {
    name: 'Free',
    tagline: 'Everything to start exploring.',
    monthly: 0,
    annualMo: 0,
    cta: 'Sign up free',
    ctaStyle: 'ghost',
    features: [
      'Live US quotes, charts & indicators',
      'Unlimited stock, ETF & crypto pages',
      'Full stock screener & company compare',
      `${QUOTAS.chat.count} AI chat messages a day`,
      `${QUOTAS.deep_dive.count} AI Deep Dive & ${QUOTAS.portfolio_builder.count} Portfolio Builder runs a month`,
      `Holdings tracking, ${FREE_WATCHLISTS} watchlists, alerts on ${FREE_ALERT_STOCKS} stocks`,
      'Academy beginner courses & daily challenge',
    ],
  },
  {
    name: 'Pro',
    tagline: 'For active investors who want the edge.',
    monthly: PRICING.proMonthly,
    annualMo: PRICING.proAnnualPerMonth,
    cta: `Start free ${PRICING.trialDays}-day trial`,
    ctaStyle: 'primary',
    highlight: true,
    features: [
      'Everything in Free',
      'Daily Brief — AI market recap every morning',
      '“Why Today?” move explanations',
      'Unlimited AI chat, Portfolio Builder & Checkup',
      "Bull's Weekly Pick — full thesis",
      'Automatic brokerage sync (SnapTrade)',
      'Unlimited watchlists & price alerts',
      'Insider transactions, exports & advanced Academy',
    ],
  },
];

export function Pricing({ onSignUp, onSubscribe }: Props) {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" style={{ padding: '120px 0 80px', position: 'relative' }}>
      <div className="wrap">
        <SectionHeading
          title={
            <>
              Free to start.{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                Pro
              </span>{' '}
              when you&apos;re ready.
            </>
          }
          sub="No card to sign up. Cancel anytime. Upgrade only when the daily brief becomes your most-opened tab."
        />

        <Reveal>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <div
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
              <button
                type="button"
                onClick={() => setAnnual(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 99,
                  border: 'none',
                  background: !annual ? 'var(--accent)' : 'transparent',
                  color: !annual ? 'var(--accent-ink)' : 'var(--fg-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 200ms',
                }}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setAnnual(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 99,
                  border: 'none',
                  background: annual ? 'var(--accent)' : 'transparent',
                  color: annual ? 'var(--accent-ink)' : 'var(--fg-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 200ms',
                }}
              >
                Annual
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 99,
                    background: annual ? 'var(--accent-ink)' : 'var(--accent-soft)',
                    color: 'var(--accent)',
                    letterSpacing: '0.04em',
                  }}
                >
                  −{Math.round((1 - PRICING.proAnnualPerMonth / PRICING.proMonthly) * 100)}%
                </span>
              </button>
            </div>
          </div>
        </Reveal>

        <div
          className="pricing-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, maxWidth: 880, margin: '0 auto' }}
        >
          {PLANS.map((p, i) => {
            const price = annual ? p.annualMo : p.monthly;
            return (
              <Reveal key={p.name} delay={i + 1}>
                <div
                  style={{
                    position: 'relative',
                    background: p.highlight
                      ? 'linear-gradient(160deg, var(--accent-soft), transparent 60%), var(--surface)'
                      : 'var(--surface)',
                    border: p.highlight ? '1px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 22,
                    padding: 32,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: p.highlight ? '0 30px 80px -30px var(--accent-glow), 0 0 0 1px var(--accent)' : 'none',
                  }}
                >
                  {p.highlight && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -12,
                        right: 24,
                        padding: '4px 12px',
                        borderRadius: 99,
                        background: 'var(--accent)',
                        color: 'var(--accent-ink)',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        boxShadow: '0 8px 20px -6px var(--accent-glow)',
                      }}
                    >
                      Most popular
                    </div>
                  )}

                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--fg)' }}>{p.name}</span>
                  </div>
                  <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--fg-muted)', textWrap: 'pretty' }}>{p.tagline}</p>

                  <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="mono" style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--fg)' }}>
                      ${price}
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--fg-muted)' }}>/ month</span>
                    {annual && price > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
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
                    style={{ justifyContent: 'center', padding: '14px', fontSize: 14, marginBottom: 24 }}
                  >
                    {p.cta}
                    <Icon name="arrowRight" size={14} />
                  </button>

                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {p.features.map((f) => (
                      <li
                        key={f}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          fontSize: 13.5,
                          color: 'var(--fg)',
                          lineHeight: 1.45,
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            width: 18,
                            height: 18,
                            borderRadius: 99,
                            background: p.highlight ? 'var(--accent)' : 'var(--surface-2)',
                            color: p.highlight ? 'var(--accent-ink)' : 'var(--fg)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 1,
                          }}
                        >
                          <Icon name="check" size={11} stroke={2.4} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={3}>
          <div
            style={{
              marginTop: 36,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              fontSize: 13,
              color: 'var(--fg-dim)',
            }}
          >
            {/* Both facts come from PRICING in entitlements.ts. The money-back
                window was previously not mentioned anywhere on this page. */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
              {PRICING.trialDays}-day free trial
            </span>
            <span style={{ width: 3, height: 3, background: 'var(--fg-dim)', borderRadius: 99, opacity: 0.5 }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
              {PRICING.moneyBackDays}-day money-back guarantee
            </span>
            <span style={{ width: 3, height: 3, background: 'var(--fg-dim)', borderRadius: 99, opacity: 0.5 }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
              Cancel anytime
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
