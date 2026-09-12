'use client';

import { Reveal, SectionHeading } from './Atoms';
import { Icon } from './Icon';

/**
 * The three steps, as a ruled index rather than three cards of drawn UI.
 *
 * This section used to draw a miniature of the app inside each card: a fake
 * signup form with a blinking caret, a fake search dropdown, and a fake Daily
 * Brief carrying invented percentages (AAPL +1.5%, NVDA +2.1%, TSLA -0.4%).
 * They were the last hand-drawn mockups left on the page after Features moved
 * to real captures, and the third one was the worst of them: a fabricated Daily
 * Brief sitting a few hundred pixels below an actual screenshot of the real
 * Daily Brief, with no "Example" tag to tell the two apart.
 *
 * They are not replaced with screenshots. This section sits between Features
 * (four large captures) and Peek (a full-width framed gallery), so a third
 * image-bearing section would make the middle of the page image-image-image
 * with nowhere to rest. The steps are simple enough to read as words, and the
 * quiet beat between two loud sections is worth more than a third picture.
 *
 * The ruled-column treatment is deliberately the same one `Toolkit.tsx` uses,
 * for the same reason given there: it reads as an index, it needs no card
 * chrome, and two uses make it the page's structural texture rather than a
 * one-off.
 */

interface Step {
  n: string;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  {
    n: '01',
    title: 'Sign up in 30 seconds',
    desc: 'Email or Google. No card, no brokerage connection, no waitlist.',
  },
  {
    n: '02',
    title: 'Build your watchlist',
    desc: 'Search stocks, ETFs, crypto and commodities, then ask Bull why any of them just moved.',
  },
  {
    n: '03',
    title: 'Wake up to your Daily Brief',
    // Was "lands in your inbox", which is not what happens: the brief is
    // generated at 06:30 UTC and surfaced on the dashboard with an in-app
    // notification (lib/notifications/notification-creators.ts,
    // createDailyBriefReadyNotification). Nothing is emailed.
    desc: 'A personalized summary of what moved, what mattered and what to watch, waiting on your dashboard before the open.',
  },
];

export function HowItWorks({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section id="how" style={{ padding: '104px 0 96px', position: 'relative' }}>
      <div className="wrap">
        <SectionHeading
          title={
            <>
              From signup to first insight,{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                under a minute.
              </span>
            </>
          }
          sub="Three steps. You don't need to connect a brokerage, learn new vocabulary, or wait for anything to sync."
        />

        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i + 1}>
              <div style={{ borderTop: '1px solid var(--border-strong)', paddingTop: 18 }}>
                <span
                  className="mono"
                  style={{
                    display: 'block',
                    marginBottom: 12,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: 'var(--accent)',
                  }}
                >
                  {s.n}
                </span>
                <h3
                  style={{
                    margin: '0 0 8px',
                    fontSize: 19,
                    fontWeight: 700,
                    letterSpacing: '-0.015em',
                    color: 'var(--fg)',
                    textWrap: 'balance',
                  }}
                >
                  {s.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: 'var(--fg-muted)',
                    textWrap: 'pretty',
                  }}
                >
                  {s.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* The section argues the product is fast to start, then used to offer
            no way to start it — the next CTA was all the way down at Pricing. */}
        <Reveal delay={4}>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 56 }}>
            <button type="button" onClick={onSignUp} className="btn btn-primary">
              Start for free
              <Icon name="arrowRight" size={15} />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
