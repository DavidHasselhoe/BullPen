'use client';

import { Reveal, SectionHeading } from './Atoms';

const TESTIMONIALS = [
  {
    quote: "Finally understand my portfolio instead of just watching numbers go up and down. The daily brief alone is worth it.",
    name: "Jamie R.",
    handle: "@jamier_invests",
    role: "Retail investor, 2 years",
    avatar: "JR",
    color: "oklch(0.55 0.18 152)",
  },
  {
    quote: "I asked the AI why my NVDA position dropped and it gave me a breakdown with actual news sources. That's genuinely useful.",
    name: "Marcus T.",
    handle: "@marcust",
    role: "Software engineer",
    avatar: "MT",
    color: "oklch(0.55 0.18 240)",
  },
  {
    quote: "Used to pay $40/month for a finance newsletter. BullPen's AI brief is better and it actually knows my holdings.",
    name: "Priya S.",
    handle: "@priyasaves",
    role: "Product manager",
    avatar: "PS",
    color: "oklch(0.55 0.2 320)",
  },
  {
    quote: "The screener helped me find dividend stocks I'd never heard of. Super clean compared to the Bloomberg-style tools.",
    name: "Alex W.",
    handle: "@alexwstocks",
    role: "Early retiree",
    avatar: "AW",
    color: "oklch(0.55 0.18 50)",
  },
];

export function Testimonials() {
  return (
    <section style={{ padding: '80px 0', position: 'relative' }}>
      <div className="wrap">
        <SectionHeading
          eyebrow="What investors say"
          title={
            <>
              Smarter investors,{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                every morning.
              </span>
            </>
          }
          sub="Join investors who replaced guesswork with BullPen."
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
            marginTop: 48,
          }}
        >
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={i} delay={i + 1}>
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  padding: '24px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  height: '100%',
                  transition: 'border-color 200ms, transform 240ms cubic-bezier(.22,1,.36,1), box-shadow 240ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                  e.currentTarget.style.boxShadow = '0 16px 40px -16px oklch(0 0 0 / 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                {/* Stars */}
                <div style={{ display: 'flex', gap: 3 }}>
                  {[...Array(5)].map((_, s) => (
                    <svg key={s} width="14" height="14" viewBox="0 0 14 14" fill="var(--accent)">
                      <path d="M7 1l1.5 3.2L12 4.7l-2.5 2.4.6 3.4L7 9l-3.1 1.5.6-3.4L2 4.7l3.5-.5z" />
                    </svg>
                  ))}
                </div>

                {/* Decorative quote mark + quote */}
                <div style={{ flex: 1, position: 'relative' }}>
                  <div
                    aria-hidden
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontStyle: 'italic',
                      fontSize: 72,
                      lineHeight: 0.65,
                      color: 'var(--accent)',
                      opacity: 0.22,
                      userSelect: 'none',
                      marginBottom: 6,
                    }}
                  >
                    &ldquo;
                  </div>
                  <p style={{
                    fontSize: 14,
                    lineHeight: 1.65,
                    color: 'var(--fg-muted)',
                    margin: 0,
                  }}>
                    {t.quote}
                  </p>
                </div>

                {/* Attribution */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: t.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'white',
                    flexShrink: 0,
                    boxShadow: `0 0 0 2px var(--bg), 0 0 0 3.5px ${t.color}`,
                  }}>
                    {t.avatar}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
