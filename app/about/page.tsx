import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { FoundersNote } from '@/components/about/FoundersNote';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'About',
  description: 'What BullPen is, who it\'s for, and who builds it.',
};

export default function AboutPage() {
  return (
    <div className="bullpen-landing-root">
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

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div className="legal-doc">
            <h1>About BullPen</h1>
            <p>
              BullPen is an investment research and portfolio-tracking platform for everyday investors.
              It provides stock, ETF, crypto, and market data; company financials; AI-powered analysis,
              explanations, and a research assistant; price and earnings alerts; watchlists; portfolio
              tracking with optional brokerage-account connection; and educational tools and social
              features.
            </p>
            <h2>Who it&apos;s for</h2>
            <p>
              BullPen is built for beginners who don&apos;t want to stay beginners. People who want
              real financial data and honest explanations, not jargon, and who want to actually
              understand what they&apos;re looking at rather than just being told what to think.
            </p>
            {/* Sits after "what it is" and "who it's for" so the reader has
                context before the personal account, and before "Who builds it",
                which answers the same question in a formal register. */}
            <FoundersNote />

            <h2>Who builds it</h2>
            <p>
              BullPen is built and operated by Hasselø BullPen, a sole proprietorship (enkeltpersonforetak)
              registered in Norway.
            </p>
            <p>
              Have a question we haven&apos;t answered? <Link href="/contact">Get in touch</Link>.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
