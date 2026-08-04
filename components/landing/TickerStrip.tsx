'use client';

import { useEffect, useState } from 'react';
import { TAPE_SYMBOLS } from '@/lib/market-data/landing-symbols';

/**
 * Live ticker tape under the hero.
 *
 * Every price here used to be a hardcoded string — AAPL frozen at 234.56, NVDA
 * at 892.40, BTC at 68,242 — scrolling under a marquee animation directly below
 * a hero that shows genuinely live data. A scrolling tape is about as strong a
 * "this is live market data" signal as a UI can send, so hardcoding it was the
 * most misleading element on the page.
 *
 * It now reads the same shared, CDN-cached `/api/market/landing-quotes` batch
 * the hero uses (one request for all landing traffic, not one per visitor —
 * see CLAUDE.md's TwelveData cost rules). Symbols that haven't resolved render
 * a shimmer, never a substitute number: if we can't show the real price, we
 * show that we're still loading it.
 */

interface Quote {
  price: string;
  pct: string;
  up: boolean;
}

function fmtPrice(c: number): string {
  if (c >= 1000) return c.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return c.toFixed(2);
}

function useTapeQuotes() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      if (document.hidden) return; // don't burn requests for background tabs
      try {
        const res = await fetch('/api/market/landing-quotes');
        if (!res.ok) return;
        const data = (await res.json()) as {
          success: boolean;
          quotes?: Record<string, { c: number; d: number; dp: number }>;
        };
        if (cancelled || !data.success || !data.quotes) return;
        const next: Record<string, Quote> = {};
        for (const [sym, q] of Object.entries(data.quotes)) {
          next[sym] = {
            price: fmtPrice(q.c),
            pct: `${q.dp >= 0 ? '+' : ''}${q.dp.toFixed(2)}%`,
            up: q.dp >= 0,
          };
        }
        if (Object.keys(next).length > 0) setQuotes(next);
      } catch {
        // Network hiccup — the tape keeps showing whatever it already had.
      }
    }

    fetchAll();
    const id = setInterval(fetchAll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return quotes;
}

/** Placeholder shown until a real quote arrives. Never a stand-in price. */
function TapeSkeleton({ w }: { w: number }) {
  return <span className="hero-skel" style={{ width: w, height: 12 }} />;
}

export function TickerStrip() {
  const quotes = useTapeQuotes();

  // Duplicated once so the marquee can loop seamlessly.
  const loop = [...TAPE_SYMBOLS, ...TAPE_SYMBOLS];

  return (
    <section
      aria-label="Live market prices"
      style={{
        position: 'relative',
        padding: '18px 0',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-2)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'linear-gradient(to right, var(--bg-2) 0%, transparent 8%, transparent 92%, var(--bg-2) 100%)',
          zIndex: 2,
        }}
      />
      <div
        style={{
          display: 'flex',
          gap: 0,
          animation: 'bp-marquee 50s linear infinite',
          width: 'max-content',
          willChange: 'transform',
        }}
      >
        {loop.map((sym, i) => {
          const q = quotes[sym];
          return (
            <div
              key={`${sym}-${i}`}
              // Only the first copy is exposed to assistive tech; the second is
              // a visual duplicate for the seamless loop.
              aria-hidden={i >= TAPE_SYMBOLS.length}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '0 28px',
                borderRight: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
                {sym}
              </span>
              {q ? (
                <>
                  <span className="mono" style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
                    ${q.price}
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: 12, fontWeight: 600, color: q.up ? 'var(--up)' : 'var(--down)' }}
                  >
                    {q.up ? '▲' : '▼'} {q.pct}
                  </span>
                </>
              ) : (
                <>
                  <TapeSkeleton w={52} />
                  <TapeSkeleton w={40} />
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
