import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { getStockDirectory } from '@/lib/market-data/stock-directory';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Stocks by sector',
  description:
    'Every company in the S&P 500 and Nasdaq-100, grouped by sector and sorted by size. Open any of them for its price, financials and a plain-English explanation.',
  alternates: { canonical: '/stocks' },
};

/**
 * The public stock directory: one server-rendered link to every crawlable
 * stock page, linked from the site footer. See lib/market-data/stock-directory.ts
 * for why this exists.
 */
export default async function StocksPage() {
  const sectors = await getStockDirectory();
  const total = sectors.reduce((n, s) => n + s.stocks.length, 0);

  return (
    <div className="bullpen-landing-root landing-light-preview">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ paddingTop: 56, paddingBottom: 96 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
            Stocks by sector
          </h1>
          <p style={{ margin: '12px 0 0', maxWidth: 640, fontSize: 16, lineHeight: 1.55, color: 'var(--fg-muted)' }}>
            All {total} companies in the S&amp;P 500 and Nasdaq-100, grouped by what they do and sorted from
            largest to smallest. Open any of them for its price, financials and what is moving it today.
          </p>

          <nav aria-label="Sectors" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '28px 0 8px' }}>
            {sectors.map((s) => (
              <a
                key={s.key}
                href={`#${s.key}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 36,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  fontSize: 14,
                  color: 'var(--fg)',
                }}
              >
                {s.label}
                <span style={{ marginLeft: 6, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>{s.stocks.length}</span>
              </a>
            ))}
          </nav>

          {sectors.map((s) => (
            <section key={s.key} id={s.key} aria-labelledby={`${s.key}-heading`} style={{ marginTop: 48, scrollMarginTop: 24 }}>
              <h2 id={`${s.key}-heading`} style={{ margin: 0, fontSize: 22, fontWeight: 650, color: 'var(--fg)' }}>
                {s.label}
              </h2>
              <p style={{ margin: '4px 0 16px', fontSize: 14, color: 'var(--fg-muted)' }}>{s.tagline}</p>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))',
                  gap: '2px 24px',
                }}
              >
                {s.stocks.map((stock) => (
                  <li key={stock.ticker}>
                    <Link
                      href={`/stock/${stock.ticker}`}
                      style={{ display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 36, padding: '8px 0', borderBottom: '1px solid var(--border)' }}
                    >
                      <span style={{ fontSize: 14, color: 'var(--fg)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stock.name}>
                        {stock.name}
                      </span>
                      {stock.name !== stock.ticker && (
                        <span style={{ marginLeft: 'auto', flexShrink: 0, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 12, color: 'var(--fg-dim)' }}>
                          {stock.ticker}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </main>

        <Footer />
      </div>
    </div>
  );
}
