'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Reveal } from './Atoms';
import { Icon } from './Icon';
import { buildPath } from './buildPath';

interface Props {
  onSignUp: () => void;
}

// ── Hero chart ────────────────────────────────────────────────────────────────
function HeroChart() {
  const W = 720;
  const H = 320;

  const basePoints = useMemo(() => {
    const n = 64;
    const arr: number[] = [];
    let v = 100;
    for (let i = 0; i < n; i++) {
      const trend = i * 0.45;
      const wave = Math.sin(i * 0.38) * 4 + Math.sin(i * 0.11) * 6;
      const noise = (Math.sin(i * 1.7) + Math.cos(i * 2.3)) * 1.6;
      v = 100 + trend + wave + noise;
      arr.push(v);
    }
    return arr;
  }, []);

  const [points, setPoints] = useState(basePoints);
  const [tab, setTab] = useState('1M');

  useEffect(() => {
    const id = setInterval(() => {
      setPoints((p) => {
        const next = p.slice();
        const last = next[next.length - 1];
        const delta = (Math.random() - 0.45) * 1.3;
        next[next.length - 1] = Math.max(80, Math.min(180, last + delta));
        return next;
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const { line, area, lastX, lastY } = buildPath(points, W, H);
  const lastPrice = points[points.length - 1];
  const firstPrice = points[0];
  const change = lastPrice - firstPrice;
  const pct = (change / firstPrice) * 100;
  const displayPrice = (180 + (lastPrice - 100) * 0.7).toFixed(2);
  const tabs = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 24,
        padding: 22,
        boxShadow: '0 30px 80px -30px oklch(0 0 0 / 0.5), 0 0 0 1px var(--border)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'oklch(0.18 0 0)',
              color: 'oklch(0.95 0 0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: '-0.04em',
              border: '1px solid var(--border)',
            }}
          ></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--fg)' }}>AAPL</span>
              <span style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Apple Inc.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: 'var(--up)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background: 'var(--up)',
                    animation: 'bp-pulse-dot 1.6s ease-in-out infinite',
                  }}
                />
                LIVE
              </div>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>NASDAQ · Real-time</span>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            className="mono"
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--fg)',
              animation: 'bp-count-up 0.4s ease-out',
            }}
            key={displayPrice}
          >
            ${displayPrice}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 13,
              color: pct >= 0 ? 'var(--up)' : 'var(--down)',
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {pct >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)} ({pct.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="1" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((f, i) => (
            <line key={i} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--border)" strokeDasharray="3 6" />
          ))}

          <path
            d={area}
            fill="url(#hero-area)"
            style={{ opacity: 0, animation: 'bp-fade-up 0.9s 0.35s cubic-bezier(.22,1,.36,1) forwards' }}
          />
          <path
            d={line}
            fill="none"
            stroke="url(#hero-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 4000,
              strokeDashoffset: 4000,
              animation: 'bp-draw-path 1.8s cubic-bezier(.22,1,.36,1) forwards',
            }}
          />

          <circle
            cx={lastX}
            cy={lastY}
            r="14"
            fill="var(--accent)"
            opacity="0.35"
            style={{
              transformOrigin: `${lastX}px ${lastY}px`,
              animation: 'bp-pulse-ring 1.8s ease-out infinite',
            }}
          />
          <circle cx={lastX} cy={lastY} r="5" fill="var(--accent)" style={{ filter: 'drop-shadow(0 0 8px var(--accent-glow))' }} />
        </svg>

        <div
          style={{
            position: 'absolute',
            left: `calc(${(lastX / W) * 100}% + 10px)`,
            top: `calc(${(lastY / H) * 100}% - 14px)`,
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: 6,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
            boxShadow: '0 6px 20px -6px var(--accent-glow)',
            pointerEvents: 'none',
            animation: 'bp-fade-up 0.6s 1.2s both',
          }}
        >
          ${displayPrice}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, gap: 8 }}>
        <div
          style={{
            display: 'inline-flex',
            gap: 2,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            padding: 3,
            borderRadius: 999,
          }}
        >
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '6px 12px',
                borderRadius: 99,
                border: 'none',
                background: tab === t ? 'var(--surface)' : 'transparent',
                color: tab === t ? 'var(--fg)' : 'var(--fg-dim)',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                transition: 'all 150ms',
                boxShadow: tab === t ? '0 1px 3px oklch(0 0 0 / 0.2)' : 'none',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[
            { l: 'SMA 50', c: 'oklch(0.7 0.18 50)' },
            { l: 'EMA 20', c: 'oklch(0.72 0.18 240)' },
          ].map((i) => (
            <div
              key={i.l}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span style={{ width: 10, height: 2, background: i.c, borderRadius: 2 }} />
              {i.l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Floating mini ticker card ─────────────────────────────────────────────────
interface FloatingTickerProps {
  symbol: string;
  name: string;
  price: string;
  change: string;
  pct: string;
  up: boolean;
  style?: CSSProperties;
  anim: string;
  sparkSeed?: number;
}

function FloatingTicker({ symbol, name, price, pct, up, style, anim, sparkSeed = 1 }: FloatingTickerProps) {
  const pts = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 14; i++) {
      arr.push(50 + Math.sin(i * 0.7 + sparkSeed) * 12 + i * (up ? 1.6 : -1.6) + Math.sin(i * 1.4) * 4);
    }
    return arr;
  }, [up, sparkSeed]);
  const sw = 110;
  const sh = 36;
  const { line } = buildPath(pts, sw, sh, 2, 4);

  return (
    <div
      style={{
        position: 'absolute',
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 14,
        padding: '12px 14px',
        boxShadow: '0 16px 40px -10px oklch(0 0 0 / 0.4)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        minWidth: 200,
        animation: `${anim} ease-in-out infinite`,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{symbol}</div>
          <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
            ${price}
          </div>
          <div className="mono" style={{ fontSize: 10, color: up ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
            {up ? '▲' : '▼'} {pct}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${sw} ${sh}`} width="100%" height="36" style={{ display: 'block' }}>
        <path
          d={line}
          fill="none"
          stroke={up ? 'var(--up)' : 'var(--down)'}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
export function Hero({ onSignUp }: Props) {
  return (
    <section id="top" style={{ position: 'relative', padding: '60px 0 80px' }}>
      <div className="wrap">
        <Reveal>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 14px 6px 8px',
              borderRadius: 999,
              background: 'var(--surface)',
              border: '1px solid oklch(from var(--accent) l c h / 0.3)',
              fontSize: 13,
              color: 'var(--fg-muted)',
              margin: '0 auto 28px',
              boxShadow: '0 0 24px -10px var(--accent-glow)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 99,
                background: 'var(--accent)',
                color: 'var(--accent-ink)',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              New
            </span>
            Daily Brief — your AI market summary, every morning
            <Icon name="arrowRight" size={14} />
          </div>
        </Reveal>

        <div style={{ textAlign: 'center', maxWidth: 920, margin: '0 auto' }}>
          <Reveal delay={1}>
            <h1 className="headline" style={{ margin: 0, fontSize: 'clamp(48px, 8vw, 104px)', color: 'var(--fg)' }}>
              Invest like you{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                mean it.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={2}>
            <p
              style={{
                margin: '28px auto 0',
                fontSize: 'clamp(17px, 1.6vw, 20px)',
                lineHeight: 1.55,
                color: 'var(--fg-muted)',
                maxWidth: 640,
                textWrap: 'pretty',
              }}
            >
              Real-time market data, an AI that explains every move, and pro-grade research tools — built for investors who are serious about getting smarter.
            </p>
          </Reveal>

          <Reveal delay={3}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                marginTop: 36,
                flexWrap: 'wrap',
              }}
            >
              <button type="button" onClick={onSignUp} className="btn btn-primary" style={{ padding: '16px 28px', fontSize: 16 }}>
                Start for free
                <Icon name="arrowRight" size={16} />
              </button>
              <Link href="/dashboard" style={{ fontSize: 14, color: 'var(--fg-dim)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                or explore the dashboard →
              </Link>
            </div>
          </Reveal>

          <Reveal delay={4}>
            <div
              style={{
                marginTop: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                fontSize: 13,
                color: 'var(--fg-dim)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
                No card required
              </span>
              <span style={{ width: 3, height: 3, background: 'var(--fg-dim)', borderRadius: 99, opacity: 0.5 }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
                Free forever plan
              </span>
              <span style={{ width: 3, height: 3, background: 'var(--fg-dim)', borderRadius: 99, opacity: 0.5 }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
                10,000+ tickers
              </span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={5}>
          <div style={{ position: 'relative', maxWidth: 1040, margin: '64px auto 0' }}>
            <div
              style={{
                position: 'absolute',
                inset: -40,
                background: 'radial-gradient(50% 50% at 50% 50%, var(--accent-glow), transparent 70%)',
                filter: 'blur(40px)',
                opacity: 0.5,
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <HeroChart />
            </div>

            <div className="float-tickers" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
              <div style={{ pointerEvents: 'auto' }}>
                <FloatingTicker
                  symbol="NVDA"
                  name="NVIDIA"
                  price="892.40"
                  pct="+4.21%"
                  change="+36.12"
                  up
                  anim="bp-float-tilted-neg3 5s"
                  style={{ left: -60, top: 40 }}
                  sparkSeed={1.2}
                />
              </div>
              <div style={{ pointerEvents: 'auto' }}>
                <FloatingTicker
                  symbol="BTC/USD"
                  name="Bitcoin"
                  price="68,242"
                  pct="+2.08%"
                  change="+1390"
                  up
                  anim="bp-float-tilted-pos4 6s"
                  style={{ right: -50, top: -20 }}
                  sparkSeed={2.4}
                />
              </div>
              <div style={{ pointerEvents: 'auto' }}>
                <FloatingTicker
                  symbol="TSLA"
                  name="Tesla"
                  price="218.94"
                  pct="-1.42%"
                  change="-3.15"
                  up={false}
                  anim="bp-float-tilted-neg2 7s"
                  style={{ right: -30, bottom: 30 }}
                  sparkSeed={3.8}
                />
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={6}>
          <div style={{ marginTop: 110, textAlign: 'center' }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--fg-dim)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: 20,
              }}
            >
              Powered by best-in-class data
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              {['NASDAQ', 'NYSE', 'TwelveData', 'Finnhub', 'SEC EDGAR', 'Anthropic'].map((b) => (
                <span
                  key={b}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 99,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    color: 'var(--fg-dim)',
                    fontFamily: b === 'TwelveData' || b === 'Finnhub' ? 'var(--font-mono)' : 'inherit',
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
