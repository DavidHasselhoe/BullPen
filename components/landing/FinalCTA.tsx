'use client';

import Link from 'next/link';
import { Counter, Reveal } from './Atoms';
import { Icon } from './Icon';

interface Props {
  onSignUp: () => void;
}

export function FinalCTA({ onSignUp }: Props) {
  return (
    <section style={{ padding: '60px 0 80px' }}>
      <div className="wrap">
        <Reveal>
          <div
            style={{
              position: 'relative',
              background: 'linear-gradient(135deg, var(--accent-soft), transparent 60%), var(--surface)',
              border: '1px solid var(--accent)',
              borderRadius: 32,
              padding: 'clamp(40px, 6vw, 72px)',
              overflow: 'hidden',
              boxShadow: '0 40px 100px -30px var(--accent-glow)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-50%',
                right: '-20%',
                width: 500,
                height: 500,
                borderRadius: '50%',
                background: 'radial-gradient(closest-side, var(--accent-glow), transparent)',
                pointerEvents: 'none',
              }}
            />

            <div style={{ position: 'relative', zIndex: 1, maxWidth: 700 }}>
              <h2 className="headline" style={{ margin: 0, fontSize: 'clamp(36px, 5vw, 64px)', color: 'var(--fg)' }}>
                Ready to{' '}
                <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                  invest
                </span>{' '}
                with conviction?
              </h2>
              <p style={{ margin: '20px 0 32px', fontSize: 18, lineHeight: 1.55, color: 'var(--fg-muted)', maxWidth: 540, textWrap: 'pretty' }}>
                Join thousands of investors getting smarter every morning. Free plan, no card, 30-second signup.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={onSignUp} className="btn btn-primary" style={{ padding: '14px 22px', fontSize: 15 }}>
                  Sign up free
                  <Icon name="arrowRight" size={16} />
                </button>
                <Link href="/" className="btn btn-ghost" style={{ padding: '14px 22px', fontSize: 15 }}>
                  Open dashboard
                  <Icon name="arrowRight" size={15} />
                </Link>
                <span style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                  <Counter to={28412} /> investors joined this month
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
