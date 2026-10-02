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
 * They are not replaced with screenshots. This section sits between Benefits
 * (six captures) and Peek (a full-width framed gallery), so a third
 * image-bearing section would make the middle of the page image-image-image
 * with nowhere to rest. The steps are simple enough to read as words, and the
 * quiet beat between two loud sections is worth more than a third picture.
 *
 * Ruled columns: it reads as an index and needs no card chrome.
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
    title: 'Check in each morning',
    // Free on purpose: the Daily Brief this step used to promise is Pro, and
    // the free plan's Home really does explain the biggest mover each day.
    desc: 'Home shows how your stocks did and the reason behind your biggest mover, in a sentence or two.',
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
              under a minute.
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
