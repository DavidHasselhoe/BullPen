'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Reveal } from './Atoms';
import { Icon } from './Icon';
import { buildPath } from './buildPath';
import { CompanyLogo } from '@/components/company/CompanyLogo';

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


// ── Skeleton placeholder for numbers still loading — never show a fabricated price ──
function Skel({ w, h = 14 }: { w: number; h?: number }) {
  return <span className="hero-skel" style={{ width: w, height: h }} />;
}

// Deterministic placeholder curve (no Math.random — stable across renders/SSR),
// shown only until the real NVDA chart loads (or if the fetch fails/market has
// no data yet). Never mixed with real points.
const FALLBACK_CHART_POINTS: number[] = (() => {
  const n = 20;
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const climb = t < 0.55 ? t * 0.6 : 0.33 + (t - 0.55) * 2.9;
    const wave = Math.sin(i * 0.9) * 1.4;
    arr.push(100 + climb * 40 + wave);
  }
  return arr;
})();

// ── Real NVDA 1D chart, shared across all visitors via /api/market/landing-chart ──
function useNvdaChartPoints(): number[] {
  const [points, setPoints] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchChart() {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/market/landing-chart');
        if (!res.ok) return;
        const data = await res.json() as { success: boolean; points?: number[] };
        if (cancelled || !data.success || !data.points || data.points.length < 2) return;
        setPoints(data.points);
      } catch {
        // Network hiccup — hero falls back to its placeholder curve.
      }
    }

    fetchChart();
    const id = setInterval(fetchChart, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return points;
}

// ── Floating ticker card — ambient market pulse, real price via live quotes ────
function FloatTicker({
  symbol,
  name,
  side,
  liveQuote,
}: {
  symbol: string;
  name: string;
  side: 'tsla' | 'aapl';
  liveQuote?: LiveQuote;
}) {
  return (
    <div
      className={`hero-float-ticker ${side}`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 13,
        padding: '9px 11px',
        boxShadow: '0 18px 40px -14px oklch(0 0 0 / 0.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <CompanyLogo ticker={symbol} name={name} size={20} />
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg)' }}>{symbol}</div>
          <div style={{ fontSize: 9, color: 'var(--fg-dim)' }}>{name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        {liveQuote ? (
          <>
            <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fg)' }}>
              {liveQuote.price}
            </span>
            <span
              className="mono"
              style={{ fontSize: 9.5, fontWeight: 600, color: liveQuote.up ? 'var(--up)' : 'var(--down)' }}
            >
              {liveQuote.pct}
            </span>
          </>
        ) : (
          <>
            <Skel w={44} h={12} />
            <Skel w={32} h={10} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Hero chart panel — the "why" demo: real NVDA price, animated draw, why-bubble
// pinned to the actual spike, Daily Brief tucked in as a glance ────────────────
function HeroChartPanel({ liveQuotes }: { liveQuotes: Record<string, LiveQuote> }) {
  const nvdaPoints = useNvdaChartPoints();
  const chartPoints = nvdaPoints.length >= 2 ? nvdaPoints : FALLBACK_CHART_POINTS;
  const { line, area, lastX, lastY } = useMemo(() => buildPath(chartPoints, 400, 170), [chartPoints]);
  const nvda = liveQuotes['NVDA'];
  // Describes what the feature does against the real, live move — it never
  // asserts *why* the move happened. The previous version paired this real
  // price with three invented catalysts ("Blackwell benchmarks leak, beat H100
  // by 2.3x", "Morgan Stanley raised price target"), which read as reporting
  // rather than illustration. Real data mixed with fabricated specifics is
  // worse than either alone, so the specifics are gone.
  const whyHeadline = nvda
    ? `NVDA is ${nvda.up ? 'up' : 'down'} ${nvda.pct.replace(/^[+-]/, '')} today.`
    : 'NVDA moved today.';

  return (
    <div
      className="hero-chart-panel"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 20,
        boxShadow: '0 30px 80px -30px oklch(0 0 0 / 0.55)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CompanyLogo ticker="NVDA" name="NVIDIA Corp" size={34} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)' }}>NVDA</div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>NVIDIA Corp · NASDAQ</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {nvda ? (
            <>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>
                ${nvda.price}
              </div>
              <div
                className="mono"
                style={{ fontSize: 12, fontWeight: 600, color: nvda.up ? 'var(--up)' : 'var(--down)' }}
              >
                {nvda.up ? '▲' : '▼'} {nvda.pct}
              </div>
            </>
          ) : (
            <>
              <Skel w={70} h={20} />
              <div style={{ marginTop: 4 }}>
                <Skel w={50} h={12} />
              </div>
            </>
          )}
        </div>
      </div>

      <svg viewBox="0 0 400 170" width="100%" height={170} style={{ display: 'block', overflow: 'visible', margin: '6px 0 2px' }}>
        <defs>
          <linearGradient id="hero-area-v2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="hero-chart-area" d={area} fill="url(#hero-area-v2)" />
        <path
          className="hero-chart-line"
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="hero-spike-ring" cx={lastX} cy={lastY} r={4} fill="none" stroke="var(--accent)" strokeWidth={2} />
        <circle className="hero-spike-dot" cx={lastX} cy={lastY} r={5} fill="var(--accent)" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
        <span>9:30</span>
        <span>11:00</span>
        <span>13:00</span>
        <span>15:00</span>
        <span>16:00</span>
      </div>

      <div
        className="hero-why-bubble"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid oklch(from var(--accent) l c h / 0.5)',
          borderRadius: 14,
          padding: '13px 15px',
          boxShadow: '0 18px 44px -14px oklch(0 0 0 / 0.6), 0 0 0 4px oklch(from var(--accent) l c h / 0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          <Icon name="sparkles" size={12} />
          Why Today?
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6, lineHeight: 1.4, color: 'var(--fg)' }}>
          {whyHeadline}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.6 }}>
          Ask once and BullPen reads the day&apos;s news, filings and analyst moves, then explains the
          move in plain English with every source linked.
        </div>
      </div>
      <div className="hero-why-connector" />

      <div
        className="hero-brief-card"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 14,
          boxShadow: '0 20px 50px -18px oklch(0 0 0 / 0.55)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 99,
                background: 'var(--up)',
                display: 'inline-block',
                animation: 'bp-pulse-dot 1.6s ease-in-out infinite',
              }}
            />
            Daily Brief
          </span>
          <span style={{ textTransform: 'none', letterSpacing: 'normal', color: 'var(--fg-dim)', fontWeight: 600 }}>
            6:30 AM
          </span>
        </div>
        {/* Generic rather than asserting a specific macro event ("Markets steady
            before CPI") on a card sitting beside genuinely live prices. */}
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>
          Good morning. Here&apos;s your market, in a minute.
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {(['AAPL', 'NVDA', 'TSLA'] as const).map((sym) => {
            const q = liveQuotes[sym];
            return (
              <span
                key={sym}
                className="mono"
                style={{
                  fontSize: 9.5,
                  padding: '3px 7px',
                  borderRadius: 6,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  fontWeight: 600,
                  color: 'var(--fg)',
                }}
              >
                {sym} {q ? <span style={{ color: q.up ? 'var(--up)' : 'var(--down)' }}>{q.pct}</span> : <Skel w={28} h={10} />}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Rotating audience ────────────────────────────────────────────────────────
// Everyday people, then "you": the rotation is how the line lands, so it stops
// there instead of looping. Reduced motion goes straight to "you". The pill's
// width eases to each new word (a hidden copy measures it) so the line reflows
// smoothly rather than jumping, the same mechanism as notion.com's hero.
const AUDIENCES = ['teachers', 'nurses', 'electricians', 'students', 'new parents', 'retirees', 'you'];
const ROTATE_MS = 1900;

function RotatingAudience() {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState<number | null>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const last = AUDIENCES.length - 1;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t = setTimeout(() => setIndex(last), 0);
      return () => clearTimeout(t);
    }
    const id = setInterval(() => {
      setIndex((n) => {
        if (n + 1 >= last) clearInterval(id);
        return Math.min(n + 1, last);
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [last]);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <span className="hero-audience" aria-hidden>
        <span className="hero-audience-label" style={width != null ? { width } : undefined}>
          <span key={index} className="hero-audience-word accent-serif">
            {AUDIENCES[index]}
          </span>
        </span>
        <span ref={measureRef} className="hero-audience-measure accent-serif">
          {AUDIENCES[index]}
        </span>
      </span>
      <span className="sr-only">you</span>
    </>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
export function Hero({ onSignUp }: Props) {
  const liveQuotes = useLiveQuotes();

  return (
    <section id="top" style={{ position: 'relative', padding: '72px 0 80px' }}>
      <div className="wrap">
        <div style={{ textAlign: 'center', maxWidth: 920, margin: '0 auto' }}>
          <Reveal delay={1}>
            <h1 className="headline" style={{ margin: 0, fontSize: 'clamp(44px, 7.4vw, 96px)', color: 'var(--fg)' }}>
              Investing, explained
              <br />
              for <RotatingAudience />.
            </h1>
          </Reveal>

          <Reveal delay={2}>
            <p
              style={{
                margin: '24px auto 0',
                fontSize: 'clamp(17px, 1.6vw, 20px)',
                lineHeight: 1.55,
                color: 'var(--fg-muted)',
                maxWidth: 640,
                textWrap: 'pretty',
              }}
            >
              Every stock in plain English, every move with a reason. No finance degree, no jargon, no guessing.
            </p>
          </Reveal>

          <Reveal delay={3}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                marginTop: 28,
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
                marginTop: 18,
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
              <span className="hero-trust-dot" aria-hidden style={{ width: 3, height: 3, background: 'var(--fg-dim)', borderRadius: 99, opacity: 0.5 }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
                Free forever plan
              </span>
              <span className="hero-trust-dot" aria-hidden style={{ width: 3, height: 3, background: 'var(--fg-dim)', borderRadius: 99, opacity: 0.5 }} />
              {/* Was "10,000+ tickers" — an unverifiable count, and one that
                  implied real-time coverage across all of it. Real-time is US
                  equities and ETFs; global equities are end-of-day. Naming the
                  asset classes is both accurate and more useful. */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
                Stocks, ETFs, crypto &amp; commodities
              </span>
            </div>
          </Reveal>
        </div>

        {/* Deliberately NOT wrapped in <Reveal>. Its box starts below the fold
            on a 900px viewport, so the IntersectionObserver that adds `.in`
            never fired at scroll 0 and the whole visual sat at opacity 0 until
            the visitor scrolled: the first screen rendered blank below the
            trust row, which is the opposite of what a hero is for. The panel,
            tickers, bubble and brief card each already carry their own keyframe
            entrance (bp-panel-in, bp-card-in-*, bp-bubble-in, bp-brief-in), so
            the arrival stays choreographed without a scroll trigger, and
            DESIGN.md §6 asks for one entrance per page rather than a stagger. */}
        <div>
          <div className="hero-visual-wrap">
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
            <div className="hero-stage" style={{ position: 'relative', zIndex: 1 }}>
              <FloatTicker symbol="TSLA" name="Tesla Inc." side="tsla" liveQuote={liveQuotes['TSLA']} />
              <FloatTicker symbol="AAPL" name="Apple Inc." side="aapl" liveQuote={liveQuotes['AAPL']} />
              <HeroChartPanel liveQuotes={liveQuotes} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
