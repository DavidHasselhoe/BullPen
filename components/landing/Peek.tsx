'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Reveal, SectionHeading } from './Atoms';
import { Icon } from './Icon';
import { buildPath } from './buildPath';

function BrowserChrome({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 40px 100px -30px oklch(0 0 0 / 0.55), 0 0 0 1px var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-2)',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <span key={c} style={{ width: 11, height: 11, borderRadius: 99, background: c, opacity: 0.85 }} />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 480,
            margin: '0 auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--fg-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Icon name="shield" size={11} style={{ color: 'var(--up)' }} />
          <span style={{ color: 'var(--fg-dim)' }}>bullpen.app</span>
          <span style={{ color: 'var(--fg)' }}>{url}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {[1, 2, 3].map((i) => (
            <span key={i} style={{ width: 14, height: 2, background: 'var(--fg-dim)', opacity: 0.4, borderRadius: 2 }} />
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function StockDetailView() {
  const W = 720;
  const H = 250;
  // Deterministic pseudo-random — see same note in Features.tsx
  const pts = useMemo(() => {
    const a: number[] = [];
    let v = 100;
    for (let i = 0; i < 60; i++) {
      v += (Math.sin(i * 0.4) + Math.cos(i * 0.7)) * 1.8 + i * 0.3 + Math.sin(i * 11.3) * 0.6;
      a.push(v);
    }
    return a;
  }, []);
  const { line, area, lastX, lastY } = buildPath(pts, W, H);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, padding: 22, background: 'var(--bg)' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                background: 'oklch(0.2 0 0)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: '-0.05em',
              }}
            ></div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>AAPL</span>
                <span style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Apple Inc. · NASDAQ</span>
              </div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg)', marginTop: 4 }}>
                $234.56 <span style={{ fontSize: 13, color: 'var(--up)', fontWeight: 600 }}>▲ +$3.42 (1.48%)</span>
              </div>
            </div>
          </div>
          <div
            style={{
              padding: '7px 14px',
              borderRadius: 99,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            + Watchlist
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
            <defs>
              <linearGradient id="peek-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.33, 0.66].map((f, i) => (
              <line key={i} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--border)" strokeDasharray="3 6" />
            ))}
            <path d={area} fill="url(#peek-area)" />
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            <circle cx={lastX} cy={lastY} r="4" fill="var(--accent)" />
          </svg>
        </div>

        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 4 }}>
          {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((t) => (
            <span
              key={t}
              className="mono"
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: t === '1Y' ? 'var(--accent-soft)' : 'transparent',
                color: t === '1Y' ? 'var(--accent)' : 'var(--fg-dim)',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--fg-dim)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Health score
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--up)' }}>
              87
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>/ 100</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                padding: '2px 8px',
                background: 'oklch(from var(--up) l c h / 0.15)',
                color: 'var(--up)',
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              STRONG
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-2)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: '87%', height: '100%', background: 'var(--up)', borderRadius: 99 }} />
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--fg-dim)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Key stats
          </div>
          {[
            ['P/E', '28.4'],
            ['EPS', '$6.43'],
            ['Mkt cap', '$3.54T'],
            ['Div yield', '0.51%'],
            ['52-wk range', '164—237'],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '5px 0',
                borderBottom: '1px dashed var(--border)',
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--fg-dim)' }}>{k}</span>
              <span className="mono" style={{ color: 'var(--fg)', fontWeight: 600 }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AiChatView() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 0, background: 'var(--bg)', minHeight: 380 }}>
      <div style={{ padding: 18, borderRight: '1px solid var(--border)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            fontSize: 12,
            color: 'var(--fg-dim)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          <Icon name="chat" size={13} />
          Conversations
        </div>
        {[
          { t: 'Why did NVDA jump 4.2%?', active: true },
          { t: 'Compare AAPL vs MSFT 5y', active: false },
          { t: 'Best dividend ETFs', active: false },
          { t: 'TSLA earnings preview', active: false },
          { t: 'Sector rotation thesis', active: false },
        ].map((c, i) => (
          <div
            key={i}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: c.active ? 'var(--accent-soft)' : 'transparent',
              color: c.active ? 'var(--accent)' : 'var(--fg-muted)',
              fontSize: 12,
              fontWeight: c.active ? 600 : 500,
              marginBottom: 4,
            }}
          >
            {c.t}
          </div>
        ))}
      </div>

      <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            padding: '10px 14px',
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 600,
            alignSelf: 'flex-end',
            maxWidth: '70%',
          }}
        >
          Why did NVDA jump 4.2% today?
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '14px 16px',
            borderRadius: 14,
            maxWidth: '85%',
            fontSize: 13,
            color: 'var(--fg)',
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 99,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            <Icon name="sparkles" size={10} /> Reasoning
          </div>
          <div style={{ marginBottom: 6 }}>
            NVDA gained <strong>4.21% to $892.40</strong> on three catalysts:
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: 'var(--fg-muted)' }}>
            <li>Leaked Blackwell GPU benchmarks beat H100 by 2.3×</li>
            <li>Morgan Stanley raised PT to $1,100 (from $950)</li>
            <li>Sector rotation back into AI infrastructure</li>
          </ol>
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Reuters', 'Bloomberg', 'MS Research'].map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 99,
                  border: '1px solid var(--border)',
                  color: 'var(--fg-dim)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            padding: '8px 14px',
            borderRadius: 14,
            fontSize: 13,
            color: 'var(--fg-dim)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 'auto',
          }}
        >
          Ask BullPen anything…
          <span
            style={{
              marginLeft: 'auto',
              padding: '4px 8px',
              borderRadius: 6,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            ↵
          </span>
        </div>
      </div>
    </div>
  );
}

function PortfolioView() {
  const holdings = [
    { t: 'AAPL', n: 'Apple Inc.', qty: 42, px: 234.56, val: 9851.52, pct: '+18.4%', up: true },
    { t: 'NVDA', n: 'NVIDIA', qty: 8, px: 892.40, val: 7139.2, pct: '+42.1%', up: true },
    { t: 'MSFT', n: 'Microsoft', qty: 14, px: 438.21, val: 6134.94, pct: '+12.3%', up: true },
    { t: 'BTC/USD', n: 'Bitcoin', qty: 0.08, px: 68242, val: 5459.36, pct: '+24.8%', up: true },
    { t: 'TSLA', n: 'Tesla', qty: 20, px: 218.94, val: 4378.8, pct: '-8.2%', up: false },
  ];

  return (
    <div style={{ padding: 22, background: 'var(--bg)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--fg-dim)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Total value
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.02em' }}>
            $32,963.82
          </div>
          <div className="mono" style={{ fontSize: 13, color: 'var(--up)', fontWeight: 600, marginTop: 4 }}>
            ▲ +$2,418.40 today (+7.9%)
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--fg-dim)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Diversification
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fg)' }}>
              74
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>/ 100</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                padding: '2px 8px',
                background: 'oklch(0.65 0.16 80 / 0.18)',
                color: 'oklch(0.7 0.16 80)',
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              BALANCED
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: 'var(--bg-2)',
              borderRadius: 99,
              marginTop: 8,
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            <div style={{ width: '30%', height: '100%', background: 'var(--accent)' }} />
            <div style={{ width: '22%', height: '100%', background: 'oklch(0.65 0.18 250)' }} />
            <div style={{ width: '18%', height: '100%', background: 'oklch(0.7 0.18 40)' }} />
            <div style={{ width: '16%', height: '100%', background: 'oklch(0.68 0.16 320)' }} />
            <div style={{ width: '14%', height: '100%', background: 'oklch(0.6 0.15 200)' }} />
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.8fr',
            padding: '10px 16px',
            fontSize: 10,
            color: 'var(--fg-dim)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span>Holding</span>
          <span style={{ textAlign: 'right' }}>Qty</span>
          <span style={{ textAlign: 'right' }}>Price</span>
          <span style={{ textAlign: 'right' }}>Value</span>
          <span style={{ textAlign: 'right' }}>Gain</span>
        </div>
        {holdings.map((h) => (
          <div
            key={h.t}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.8fr',
              padding: '10px 16px',
              alignItems: 'center',
              fontSize: 12,
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: 'var(--fg)' }}>{h.t}</div>
              <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{h.n}</div>
            </div>
            <span className="mono" style={{ textAlign: 'right', color: 'var(--fg-muted)' }}>
              {h.qty}
            </span>
            <span className="mono" style={{ textAlign: 'right', color: 'var(--fg-muted)' }}>
              ${h.px.toLocaleString()}
            </span>
            <span className="mono" style={{ textAlign: 'right', color: 'var(--fg)', fontWeight: 600 }}>
              ${h.val.toLocaleString()}
            </span>
            <span className="mono" style={{ textAlign: 'right', color: h.up ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
              {h.pct}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenshotView({ src, alt }: { src: string; alt: string }) {
  return (
    <div style={{ background: 'var(--bg)', position: 'relative', overflow: 'hidden', maxHeight: 500 }}>
      <Image
        src={src}
        alt={alt}
        width={1400}
        height={800}
        style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover', objectPosition: 'top' }}
        unoptimized
      />
    </div>
  );
}

const VIEWS = [
  { id: 'screener', label: 'Screener', url: '/tools/screener', Component: () => <ScreenshotView src="/screenshots/screener.png" alt="BullPen stock screener" /> },
  { id: 'stock', label: 'Stock detail', url: '/stock/AAPL', Component: StockDetailView },
  { id: 'ai', label: 'BullPen AI', url: '/tools/ai', Component: AiChatView },
  { id: 'portfolio', label: 'Portfolio', url: '/holdings', Component: PortfolioView },
  { id: 'dashboard', label: 'Dashboard', url: '/dashboard', Component: () => <ScreenshotView src="/screenshots/dashboard.png" alt="BullPen dashboard" /> },
];

export function Peek() {
  const [idx, setIdx] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [clickPaused, setClickPaused] = useState(false);
  const isPaused = hovering || clickPaused;

  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % VIEWS.length), 4500);
    return () => clearInterval(id);
  }, [isPaused]);

  const View = VIEWS[idx].Component;

  return (
    <section id="peek" style={{ padding: '120px 0 60px', position: 'relative' }}>
      <div className="wrap">
        <SectionHeading
          eyebrow="A peek inside"
          title={
            <>
              Powerful, but never{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                overwhelming.
              </span>
            </>
          }
          sub="Every screen is built around one job: helping you make a better decision in the next 30 seconds."
        />

        <Reveal>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 28 }}>
            <div
              style={{
                display: 'inline-flex',
                gap: 3,
                padding: 4,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 99,
              }}
            >
              {VIEWS.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setIdx(i);
                    setClickPaused(true);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 99,
                    border: 'none',
                    background: i === idx ? 'var(--accent)' : 'transparent',
                    color: i === idx ? 'var(--accent-ink)' : 'var(--fg-muted)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 200ms, color 200ms',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {v.label}
                  {i === idx && !isPaused && (
                    <span
                      key={idx}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        height: 2,
                        background: 'oklch(0 0 0 / 0.25)',
                        animation: 'bp-tab-progress 4.5s linear forwards',
                        borderRadius: 99,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={1}>
          <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
            <BrowserChrome url={VIEWS[idx].url}>
              <div key={idx} style={{ animation: 'bp-fade-up 0.4s ease-out' }}>
                <View />
              </div>
            </BrowserChrome>
          </div>
        </Reveal>

        <Reveal delay={2}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 24 }}>
            {VIEWS.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setIdx(i);
                  setClickPaused(true);
                }}
                aria-label={v.label}
                style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer' }}
              >
                <span
                  style={{
                    display: 'block',
                    width: i === idx ? 24 : 6,
                    height: 6,
                    borderRadius: 99,
                    background: i === idx ? 'var(--accent)' : 'var(--border-strong)',
                    transition: 'all 300ms',
                  }}
                />
              </button>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
