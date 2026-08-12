import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { FAQ_ITEMS } from '@/components/landing/faq-data';
import { PageMascot } from '@/components/legal/PageMascot';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Help Center',
  description: 'Answers to common questions about BullPen.',
};

export default function HelpCenterPage() {
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
            <PageMascot pose="search" className="mb-3" />
            <h1>Help Center</h1>
            <p>Answers to the questions we hear most.</p>
            {FAQ_ITEMS.map((item, i) => (
              <div key={i}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
            <p>
              Didn&apos;t find what you were looking for? <Link href="/contact">Contact us</Link>.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
