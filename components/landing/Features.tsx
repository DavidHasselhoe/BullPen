'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Reveal, SectionHeading } from './Atoms';
import { Icon, type IconName } from './Icon';
import { buildPath } from './buildPath';

function MiniSpark({ up = true, h = 40, w = 120, seed = 1 }: { up?: boolean; h?: number; w?: number; seed?: number }) {
  const pts: number[] = [];
  for (let i = 0; i < 18; i++) {
    pts.push(50 + Math.sin(i * 0.7 + seed) * 12 + i * (up ? 1.4 : -1.4) + Math.sin(i * 1.3) * 3);
  }
  const { line, area } = buildPath(pts, w, h, 2, 4);
  const id = `mini-${seed}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={up ? 'var(--up)' : 'var(--down)'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={up ? 'var(--up)' : 'var(--down)'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={up ? 'var(--up)' : 'var(--down)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
// `MiniSpark` defined for potential future use; keep as named export hint
void MiniSpark;

function FeatureCard({
  children,
  accent = false,
  style,
}: {
  children: ReactNode;
  accent?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: accent
          ? 'linear-gradient(135deg, var(--accent-soft), transparent 60%), var(--surface)'
          : 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 22,
        padding: 28,
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 200ms, transform 240ms cubic-bezier(.22,1,.36,1), box-shadow 240ms',
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.boxShadow = '0 20px 50px -20px oklch(0 0 0 / 0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {children}
    </div>
  );
}

function FeatureKicker({ icon, label }: { icon: IconName; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={16} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

function FeatureTitle({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        margin: '0 0 8px',
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        color: 'var(--fg)',
        textWrap: 'balance',
      }}
    >
      {children}
    </h3>
  );
}

function FeatureDesc({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--fg-muted)', textWrap: 'pretty' }}>
      {children}
    </p>
  );
}

// ── Visuals ───────────────────────────────────────────────────────────────────

function ChatVisual() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 6), 2200);
    return () => clearInterval(id);
  }, []);

  const bubbles = [
    { from: 'user', text: 'Why is NVDA up today?' },
    { from: 'ai', text: 'NVDA gained 4.2% on three catalysts:' },
    { from: 'ai', text: '1. New Blackwell GPU benchmark leaks…' },
    { from: 'ai', text: '2. Morgan Stanley raised PT to $1,100' },
    { from: 'ai', text: '3. Sector rotation back into AI names' },
  ];

  return (
    <div
      style={{
        marginTop: 'auto',
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 14,
        minHeight: 180,
      }}
    >
      {bubbles.map((b, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: b.from === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 8,
            opacity: i <= step ? 1 : 0.2,
            transform: i <= step ? 'translateY(0)' : 'translateY(4px)',
            transition: 'opacity 300ms, transform 300ms',
          }}
        >
          <div
            style={{
              maxWidth: '85%',
              padding: '8px 12px',
              borderRadius: 12,
              fontSize: 12.5,
              lineHeight: 1.45,
              background: b.from === 'user' ? 'var(--accent)' : 'var(--surface)',
              color: b.from === 'user' ? 'var(--accent-ink)' : 'var(--fg)',
              border: b.from === 'user' ? 'none' : '1px solid var(--border)',
              fontWeight: b.from === 'user' ? 600 : 500,
            }}
          >
            {b.text}
            {i === step && b.from === 'ai' && (
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 12,
                  marginLeft: 3,
                  background: 'var(--fg)',
                  verticalAlign: 'middle',
                  animation: 'bp-blink 1s infinite',
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function BriefVisual() {
  return (
    <div
      style={{
        marginTop: 'auto',
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 16,
        minHeight: 180,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          fontSize: 11,
          color: 'var(--fg-dim)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        <span>Monday · 6:30 AM</span>
        <span style={{ color: 'var(--accent)' }}>● Live</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 8, letterSpacing: '-0.01em' }}>
        Markets opened mixed as tech leads.
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
        <span style={{ color: 'var(--fg)' }}>NVDA</span> jumped 4.2% premarket on Blackwell news. In your portfolio:{' '}
        <span style={{ color: 'var(--up)', fontWeight: 600 }}>AAPL +1.5%</span>,
        <span style={{ color: 'var(--down)', fontWeight: 600 }}> TSLA -1.4%</span>. Fed minutes drop at 2PM ET.
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 60,
          background: 'linear-gradient(to top, var(--bg-2), transparent)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function PortfolioVisual() {
  const slices = [
    { v: 38, c: 'var(--accent)' },
    { v: 24, c: 'oklch(0.65 0.18 250)' },
    { v: 18, c: 'oklch(0.7 0.17 50)' },
    { v: 12, c: 'oklch(0.68 0.18 300)' },
    { v: 8, c: 'var(--border-strong)' },
  ];
  const r = 38;
  const c = 50;
  const C = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ marginTop: 'auto', display: 'flex', gap: 18, alignItems: 'center' }}>
      <svg viewBox="0 0 100 100" width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bg-2)" strokeWidth="14" />
        {slices.map((s, i) => {
          const len = (s.v / 100) * C;
          const el = (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.c}
              strokeWidth="14"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              style={{ transition: 'stroke-dasharray 600ms' }}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div style={{ flex: 1 }}>
        <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.02em' }}>
          $42,891.20
        </div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--up)', fontWeight: 600, marginBottom: 10 }}>
          ▲ +$1,248.40 (3.0%)
        </div>
        {[
          { l: 'Tech', v: '38%', c: 'var(--accent)' },
          { l: 'Finance', v: '24%', c: 'oklch(0.65 0.18 250)' },
          { l: 'Crypto', v: '18%', c: 'oklch(0.7 0.17 50)' },
        ].map((row) => (
          <div
            key={row.l}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--fg-muted)', marginBottom: 3 }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 99, background: row.c }} />
            <span style={{ flex: 1 }}>{row.l}</span>
            <span className="mono">{row.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenerVisual() {
  const filters = [
    { l: 'Market cap', v: '> $10B' },
    { l: 'P/E', v: '< 25' },
    { l: 'ROE', v: '> 15%' },
    { l: 'Sector', v: 'Tech' },
    { l: 'Div yield', v: '> 1%' },
  ];
  return (
    <div style={{ marginTop: 'auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {filters.map((f) => (
          <span
            key={f.l}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 99,
              border: '1px solid var(--accent)',
              background: 'var(--accent-soft)',
              fontSize: 11,
              color: 'var(--accent)',
              fontWeight: 600,
            }}
          >
            {f.l} <span style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>{f.v}</span>
          </span>
        ))}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 10px',
            borderRadius: 99,
            border: '1px dashed var(--border-strong)',
            fontSize: 11,
            color: 'var(--fg-dim)',
          }}
        >
          <Icon name="plus" size={11} /> Add filter
        </span>
      </div>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, fontSize: 12 }}>
        {[
          { t: 'NVDA', n: 'NVIDIA Corp', m: '2.21T', pct: '+4.2%' },
          { t: 'MSFT', n: 'Microsoft', m: '3.26T', pct: '+0.9%' },
          { t: 'AAPL', n: 'Apple Inc.', m: '3.54T', pct: '+1.5%' },
        ].map((r) => (
          <div
            key={r.t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontWeight: 700, color: 'var(--fg)', width: 50 }}>{r.t}</span>
            <span style={{ color: 'var(--fg-dim)', flex: 1, fontSize: 11 }}>{r.n}</span>
            <span className="mono" style={{ color: 'var(--fg-muted)', fontSize: 11 }}>
              ${r.m}
            </span>
            <span className="mono up" style={{ fontWeight: 600, fontSize: 11 }}>
              {r.pct}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandleVisual() {
  // Deterministic pseudo-random via sin/cos so the memo body stays pure
  // (React Compiler rejects Math.random in render). Visual result is identical.
  const candles = useMemo(() => {
    const arr: { o: number; c: number; high: number; low: number }[] = [];
    let p = 100;
    for (let i = 0; i < 22; i++) {
      const o = p;
      const change = (Math.sin(i * 0.55) + Math.cos(i * 0.7)) * 4;
      const c = o + change + Math.sin(i * 13.7) * 0.9;
      const high = Math.max(o, c) + Math.abs(Math.sin(i * 17.3)) * 3;
      const low = Math.min(o, c) - Math.abs(Math.cos(i * 19.1)) * 3;
      arr.push({ o, c, high, low });
      p = c;
    }
    return arr;
  }, []);

  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const W = 320;
  const H = 150;
  const stepX = W / candles.length;
  const yFor = (v: number) => H - ((v - min) / (max - min)) * H;
  const cw = stepX * 0.6;

  return (
    <div style={{ marginTop: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {candles.map((c, i) => {
          const up = c.c >= c.o;
          const x = i * stepX + (stepX - cw) / 2;
          const yHi = yFor(c.high);
          const yLo = yFor(c.low);
          const yO = yFor(c.o);
          const yC = yFor(c.c);
          const top = Math.min(yO, yC);
          const bot = Math.max(yO, yC);
          const color = up ? 'var(--up)' : 'var(--down)';
          return (
            <g key={i} style={{ opacity: 0, animation: `bp-fade-up 0.4s ${0.4 + i * 0.04}s cubic-bezier(.22,1,.36,1) forwards` }}>
              <line x1={x + cw / 2} y1={yHi} x2={x + cw / 2} y2={yLo} stroke={color} strokeWidth="1.2" />
              <rect x={x} y={top} width={cw} height={Math.max(2, bot - top)} fill={color} rx="1" />
            </g>
          );
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          fontSize: 10,
          color: 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
        }}
      >
        <span>9:30</span>
        <span>11:00</span>
        <span>13:00</span>
        <span>15:00</span>
        <span>16:00</span>
      </div>
    </div>
  );
}


export function Features() {
  return (
    <section id="features" style={{ padding: '120px 0 80px', position: 'relative' }}>
      <div className="wrap">
        <SectionHeading
          eyebrow="What's inside"
          title={
            <>
              Everything you need to{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                conviction-check
              </span>{' '}
              every move.
            </>
          }
          sub="Live data, AI explanations, portfolio tools, and a research kit that grows with you — from your first share to your hundredth thesis."
        />

        <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 18 }}>
          <Reveal delay={1} style={{ gridColumn: 'span 7' }}>
            <FeatureCard accent>
              <FeatureKicker icon="sparkles" label="BullPen AI" />
              <FeatureTitle>Ask anything. Get answers with the receipts.</FeatureTitle>
              <FeatureDesc>
                A research assistant that knows your portfolio, reads filings, and explains moves in plain English. Always shows its sources.
              </FeatureDesc>
              <ChatVisual />
            </FeatureCard>
          </Reveal>

          <Reveal delay={2} style={{ gridColumn: 'span 5' }}>
            <FeatureCard>
              <FeatureKicker icon="chart" label="Real-time charts" />
              <FeatureTitle>TradingView-grade candles, indicators, alerts.</FeatureTitle>
              <FeatureDesc>8 timeframes from 1D to ALL. Overlay SMA, EMA, Bollinger Bands, RSI, MACD.</FeatureDesc>
              <CandleVisual />
            </FeatureCard>
          </Reveal>

          <Reveal delay={1} style={{ gridColumn: 'span 4' }}>
            <FeatureCard>
              <FeatureKicker icon="bolt" label="Daily Brief" />
              <FeatureTitle>Your market summary, every morning at 6:30.</FeatureTitle>
              <FeatureDesc>Personalized to what you hold and watch — written by Claude.</FeatureDesc>
              <BriefVisual />
            </FeatureCard>
          </Reveal>

          <Reveal delay={2} style={{ gridColumn: 'span 4' }}>
            <FeatureCard>
              <FeatureKicker icon="pie" label="Portfolio" />
              <FeatureTitle>Holdings, P&amp;L, and risk in one view.</FeatureTitle>
              <FeatureDesc>Link a brokerage or track manually. Sector breakdown and diversification score included.</FeatureDesc>
              <PortfolioVisual />
            </FeatureCard>
          </Reveal>

          <Reveal delay={3} style={{ gridColumn: 'span 4' }}>
            <FeatureCard>
              <FeatureKicker icon="search" label="Screener" />
              <FeatureTitle>Find tomorrow&apos;s winners with the filters you trust.</FeatureTitle>
              <FeatureDesc>Stack filters on revenue, margins, EPS, debt-to-equity, ROE, and yield.</FeatureDesc>
              <ScreenerVisual />
            </FeatureCard>
          </Reveal>

          <Reveal delay={2} style={{ gridColumn: 'span 12' }}>
            <FeatureCard>
              <FeatureKicker icon="shield" label="Alerts & filings" />
              <FeatureTitle>Never miss a 10-K, an earnings beat, or a 5% move.</FeatureTitle>
              <FeatureDesc>Email alerts on SEC filings, insider trades, earnings, and price thresholds.</FeatureDesc>
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { icon: 'bell' as const, t: 'AAPL filed 10-Q', s: 'Q3 revenue beat by 2.1%', up: true },
                  { icon: 'arrowUp' as const, t: 'NVDA moved +5.2%', s: 'On Blackwell benchmark leak', up: true },
                  { icon: 'bolt' as const, t: 'TSLA earnings tomorrow', s: 'Consensus EPS: $0.62', up: null },
                ].map((a, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: a.up ? 'oklch(from var(--up) l c h / 0.15)' : 'var(--surface-2)',
                        color: a.up ? 'var(--up)' : 'var(--fg-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name={a.icon} size={13} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{a.t}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{a.s}</div>
                    </div>
                  </div>
                ))}
              </div>
            </FeatureCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
