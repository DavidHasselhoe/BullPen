'use client';

const TICKERS = [
  { s: 'AAPL', p: '234.56', c: '+1.48%', up: true },
  { s: 'NVDA', p: '892.40', c: '+4.21%', up: true },
  { s: 'TSLA', p: '218.94', c: '-1.42%', up: false },
  { s: 'MSFT', p: '438.21', c: '+0.92%', up: true },
  { s: 'GOOGL', p: '178.32', c: '+2.04%', up: true },
  { s: 'META', p: '512.78', c: '-0.51%', up: false },
  { s: 'AMZN', p: '194.10', c: '+1.18%', up: true },
  { s: 'BTC/USD', p: '68,242', c: '+2.08%', up: true },
  { s: 'ETH/USD', p: '3,612', c: '+3.41%', up: true },
  { s: 'XAU/USD', p: '2,342', c: '+0.18%', up: true },
  { s: 'SPY', p: '518.42', c: '+0.62%', up: true },
  { s: 'QQQ', p: '442.18', c: '+0.81%', up: true },
  { s: 'AMD', p: '142.66', c: '-2.31%', up: false },
  { s: 'COIN', p: '218.04', c: '+5.92%', up: true },
  { s: 'PLTR', p: '34.21', c: '+1.74%', up: true },
];

export function TickerStrip() {
  const loop = [...TICKERS, ...TICKERS];

  return (
    <section
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
        {loop.map((t, i) => (
          <div
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 28px',
              borderRight: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>{t.s}</span>
            <span className="mono" style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
              ${t.p}
            </span>
            <span
              className="mono"
              style={{ fontSize: 12, fontWeight: 600, color: t.up ? 'var(--up)' : 'var(--down)' }}
            >
              {t.up ? '▲' : '▼'} {t.c}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
