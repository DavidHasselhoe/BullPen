'use client';

import type { ReactNode } from 'react';
import { Reveal, SectionHeading } from './Atoms';
import { Icon, type IconName } from './Icon';

interface Step {
  n: string;
  icon: IconName;
  title: string;
  desc: string;
  visual: ReactNode;
}

const STEPS: Step[] = [
  {
    n: '01',
    icon: 'check',
    title: 'Sign up in 30 seconds',
    desc: 'Email or Google. No card, no broker connection, no waitlist. Start exploring instantly.',
    visual: (
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--fg-dim)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Create account
        </div>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            color: 'var(--fg)',
            marginBottom: 8,
            fontFamily: 'var(--font-mono)',
          }}
        >
          you@email.com
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 14,
              background: 'var(--accent)',
              marginLeft: 2,
              verticalAlign: 'middle',
              animation: 'bp-blink 1s infinite',
            }}
          />
        </div>
        <div
          style={{
            width: '100%',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            border: 'none',
            borderRadius: 8,
            padding: '10px',
            fontWeight: 600,
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          Continue with email →
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--fg-dim)', textAlign: 'center' }}>
          Or continue with Google · Apple · GitHub
        </div>
      </div>
    ),
  },
  {
    n: '02',
    icon: 'plus',
    title: 'Build your watchlist',
    desc: 'Search 10,000+ stocks, ETFs, crypto, and commodities — then ask BullPen AI why any of them just moved.',
    visual: (
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 10,
          }}
        >
          <Icon name="search" size={14} style={{ color: 'var(--fg-dim)' }} />
          <span style={{ fontSize: 13, color: 'var(--fg)' }}>nvi</span>
          <span style={{ width: 1, height: 14, background: 'var(--accent)', animation: 'bp-blink 1s infinite' }} />
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>⌘K</span>
        </div>
        {[
          { t: 'NVDA', n: 'NVIDIA Corporation', tag: 'Stock' },
          { t: 'NVDY', n: 'YieldMax NVDA Option Income', tag: 'ETF' },
          { t: 'NVTS', n: 'Navitas Semiconductor', tag: 'Stock' },
        ].map((r, i) => (
          <div
            key={r.t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: i === 0 ? 'var(--accent-soft)' : 'transparent',
              border: i === 0 ? '1px solid var(--accent)' : '1px solid transparent',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 12, color: i === 0 ? 'var(--accent)' : 'var(--fg)', width: 50 }}>{r.t}</span>
            <span style={{ flex: 1, fontSize: 11, color: 'var(--fg-muted)' }}>{r.n}</span>
            <span
              style={{
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--surface-2)',
                color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.05em',
              }}
            >
              {r.tag.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    n: '03',
    icon: 'sparkles',
    title: 'Wake up to your Daily Brief',
    desc: 'Every morning, a personalized summary lands in your inbox — what moved, what mattered, and what to watch today.',
    visual: (
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 10,
            color: 'var(--fg-dim)',
            marginBottom: 8,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span>Tue · 6:30 AM</span>
          <span style={{ color: 'var(--accent)' }}>● Pro</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', marginBottom: 6 }}>
          Good morning. Markets steady before CPI.
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.55, marginBottom: 10 }}>
          Your watchlist is <span style={{ color: 'var(--up)', fontWeight: 600 }}>up 1.2% premarket</span>. AAPL leads after Citi upgrade to
          Buy. Fed minutes today at 2PM.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { l: 'AAPL', v: '+1.5%', up: true },
            { l: 'NVDA', v: '+2.1%', up: true },
            { l: 'TSLA', v: '-0.4%', up: false },
          ].map((m) => (
            <span
              key={m.l}
              className="mono"
              style={{
                fontSize: 10,
                padding: '3px 7px',
                borderRadius: 6,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontWeight: 600,
                color: 'var(--fg)',
              }}
            >
              {m.l} <span style={{ color: m.up ? 'var(--up)' : 'var(--down)' }}>{m.v}</span>
            </span>
          ))}
        </div>
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how" style={{ padding: '120px 0 80px', position: 'relative' }}>
      <div className="wrap">
        <SectionHeading
          eyebrow="Get started"
          title={
            <>
              From signup to first insight,{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                under a minute.
              </span>
            </>
          }
          sub="Three steps. No broker handshake, no jargon to wade through, no learning curve before you can see something useful."
        />

        <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, position: 'relative' }}>
          <div
            className="step-line"
            style={{
              position: 'absolute',
              left: '12%',
              right: '12%',
              top: 38,
              height: 1,
              background: 'linear-gradient(to right, transparent, var(--border-strong) 20%, var(--border-strong) 80%, transparent)',
              zIndex: 0,
            }}
          />

          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i + 1}>
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  padding: 24,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'border-color 200ms',
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                  <span
                    className="mono"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'var(--accent)',
                      color: 'var(--accent-ink)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 13,
                      letterSpacing: '0.04em',
                      boxShadow: '0 6px 20px -6px var(--accent-glow)',
                    }}
                  >
                    {s.n}
                  </span>
                  <Icon name={s.icon} size={16} style={{ color: 'var(--fg-dim)' }} />
                </div>

                <h3
                  style={{
                    margin: '0 0 8px',
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: 'var(--fg)',
                    textWrap: 'balance',
                  }}
                >
                  {s.title}
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.55, color: 'var(--fg-muted)', textWrap: 'pretty' }}>
                  {s.desc}
                </p>

                <div style={{ marginTop: 'auto' }}>{s.visual}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
