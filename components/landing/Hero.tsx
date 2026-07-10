'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Reveal } from './Atoms';
import { Icon } from './Icon';

interface Props {
  onSignUp: () => void;
}

// ── Live quote fetching ───────────────────────────────────────────────────────
interface LiveQuote {
  price: string;
  change: string;
  pct: string;
  up: boolean;
  raw: number;
}

function fmtPrice(c: number): string {
  if (c >= 1000) return c.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return c.toFixed(2);
}

function useLiveQuotes() {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});

  useEffect(() => {
    let cancelled = false;

    // One shared, CDN/Redis-cached request for all hero symbols — never
    // per-symbol quote calls from the landing page (see CLAUDE.md golden rules).
    async function fetchAll() {
      if (document.hidden) return; // don't burn requests for background tabs
      try {
        const res = await fetch('/api/market/landing-quotes');
        if (!res.ok) return;
        const data = await res.json() as { success: boolean; quotes?: Record<string, { c: number; d: number; dp: number }> };
        if (cancelled || !data.success || !data.quotes) return;
        const next: Record<string, LiveQuote> = {};
        for (const [sym, q] of Object.entries(data.quotes)) {
          next[sym] = {
            price: fmtPrice(q.c),
            change: `${q.d >= 0 ? '+' : ''}${q.d.toFixed(2)}`,
            pct: `${q.dp >= 0 ? '+' : ''}${q.dp.toFixed(2)}%`,
            up: q.dp >= 0,
            raw: q.c,
          };
        }
        if (Object.keys(next).length > 0) setQuotes(next);
      } catch {
        // Network hiccup — hero falls back to its animated demo values.
      }
    }

    fetchAll();
    const id = setInterval(fetchAll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return quotes;
}


// ── Why Today card ────────────────────────────────────────────────────────────
function WhyTodayCard() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 20,
        boxShadow: '0 30px 80px -30px oklch(0 0 0 / 0.5), 0 0 0 1px var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 280,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Icon name="sparkles" size={12} />
        Why Today?
      </div>

      <div
        style={{
          alignSelf: 'flex-end',
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 14,
          fontSize: 13,
          fontWeight: 600,
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
        }}
      >
        Why did NVDA jump 4.2% today?
      </div>

      <div
        style={{
          maxWidth: '92%',
          padding: '14px 16px',
          borderRadius: 14,
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          fontSize: 13,
          color: 'var(--fg)',
          lineHeight: 1.55,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          NVDA gained <strong>4.21% to $892.40</strong> on three catalysts:
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--fg-muted)' }}>
          <li>Leaked Blackwell GPU benchmarks beat H100 by 2.3×</li>
          <li>Morgan Stanley raised PT to $1,100</li>
          <li>Sector rotation back into AI names</li>
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
    </div>
  );
}

// ── Daily Brief card ──────────────────────────────────────────────────────────
function DailyBriefCard({ liveQuote }: { liveQuote?: LiveQuote }) {
  const today = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    []
  );
  // liveQuote.pct already carries its own sign and '%' (see useLiveQuotes mapping below) —
  // do not prepend another sign here.
  const priceLine = liveQuote ? `AAPL ${liveQuote.pct}` : 'AAPL +1.5%';

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 20,
        boxShadow: '0 30px 80px -30px oklch(0 0 0 / 0.5), 0 0 0 1px var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 280,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="bolt" size={12} />
          Daily Brief
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            color: 'var(--up)',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            textTransform: 'none',
            letterSpacing: 'normal',
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
          {today} · 6:30 AM
        </span>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
        Good morning. Markets steady before CPI.
      </div>

      <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
        Your watchlist is <span style={{ color: 'var(--up)', fontWeight: 600 }}>up 1.2% premarket</span>.{' '}
        <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{priceLine}</span> leads after a broker upgrade. Fed minutes drop at 2PM ET.
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { l: 'AAPL', v: liveQuote?.pct ?? '+1.5%', up: liveQuote?.up ?? true },
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
              background: 'var(--surface-2)',
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
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
export function Hero({ onSignUp }: Props) {
  const liveQuotes = useLiveQuotes();

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
            Why Today? Ask any stock why it moved, get an answer with sources
            <Icon name="arrowRight" size={14} />
          </div>
        </Reveal>

        <div style={{ textAlign: 'center', maxWidth: 920, margin: '0 auto' }}>
          <Reveal delay={1}>
            <h1 className="headline" style={{ margin: 0, fontSize: 'clamp(48px, 8vw, 104px)', color: 'var(--fg)' }}>
              The market,{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                explained.
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
              Ask why any stock moved and get a real answer — sources included. Every morning, a Daily Brief tells you before you ask. Built for investors who want to understand, not just watch.
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
            <div
              className="hero-duo"
              style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
            >
              <WhyTodayCard />
              <DailyBriefCard liveQuote={liveQuotes['AAPL']} />
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
