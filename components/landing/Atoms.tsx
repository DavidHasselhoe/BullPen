'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

// ── Brand mark ────────────────────────────────────────────────────────────────
export function BullPenMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bp-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <path d="M5 21 L5 11 L13 6 L22 11 L22 16 L26 19 L26 23 L22 25 L18 22 L13 25 L5 21 Z" fill="url(#bp-grad)" />
      <path d="M5 11 L13 6 L22 11 L13 16 Z" fill="oklch(1 0 0 / 0.18)" />
      <path d="M13 16 L13 25" stroke="oklch(0 0 0 / 0.35)" strokeWidth="0.8" />
    </svg>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 22 : size === 'lg' ? 36 : 28;
  const fs = size === 'sm' ? 17 : size === 'lg' ? 26 : 21;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <BullPenMark size={px} />
      <span style={{ fontWeight: 700, letterSpacing: '-0.02em', fontSize: fs, color: 'var(--fg)' }}>
        BullPen
      </span>
    </div>
  );
}

// ── Reveal-on-scroll ──────────────────────────────────────────────────────────
type RevealProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
};

export function Reveal({ children, delay = 0, className, style }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal${className ? ` ${className}` : ''}`} data-delay={delay} style={style}>
      {children}
    </div>
  );
}

// ── Section heading ──────────────────────────────────────────────────────────
export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = 'center',
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div
      style={{
        textAlign: align,
        maxWidth: 760,
        margin: align === 'center' ? '0 auto 56px' : '0 0 56px',
      }}
    >
      {eyebrow && (
        <Reveal>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 99,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 18,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: 'var(--accent)',
                boxShadow: '0 0 0 4px var(--accent-soft)',
              }}
            />
            {eyebrow}
          </div>
        </Reveal>
      )}
      <Reveal delay={1}>
        <h2 className="headline" style={{ margin: 0, fontSize: 'clamp(34px, 4.6vw, 56px)', color: 'var(--fg)' }}>
          {title}
        </h2>
      </Reveal>
      {sub && (
        <Reveal delay={2}>
          <p
            style={{
              margin: '20px auto 0',
              fontSize: 18,
              lineHeight: 1.55,
              color: 'var(--fg-muted)',
              maxWidth: 620,
              textWrap: 'pretty',
            }}
          >
            {sub}
          </p>
        </Reveal>
      )}
    </div>
  );
}

// ── Counter (animates from 0 to target on first viewport entry) ───────────────
export function Counter({
  to,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 1400,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            const start = performance.now();
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / duration);
              const eased = 1 - Math.pow(1 - t, 3);
              setVal(eased * to);
              if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
        });
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [to, duration]);

  const formatted = val.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  return (
    <span ref={ref} className="mono">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
